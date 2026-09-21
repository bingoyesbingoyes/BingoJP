"""从 2.png 里**整块抠出左端的卷筒**，生成 1:1 的贴图。

    python scripts/trace_roller.py --write

为什么不再用 CSS 画这一卷
------------------------------------------------
App.css 里原来那一卷是**手写的**：一圈 repeating-radial-gradient 当卷尾、
一个 clip-path 多边形当卷口、两道 linear-gradient 当柱面受光。形状能对个大概，
但它终究是「照图描的红」，描不出图上的东西：

  · 纸上的云斑、折痕、樱色的纤维——那是这张和纸的**肌理**，梯度画不出来；
  · 卷口那一圈**卷进去的纸口**（深色的一道内圈），不是斜切的色块；
  · 卷尾那一卷**螺旋**，不是同心圆；
  · 上粗下细的锥度里，左缘那条**边界**本身带着毛。

所以这一卷跟 2.png 差得很远（这正是用户指出来的问题）。1:1 只有一条路：
**把图上的像素整块搬过来**——RGB 用原像素，alpha 用抠出来的剪影。
和 edge-sheet.png / edge-unit.png 是同一套做法（见 trace_edges.py）。

抠法，以及几个坑
------------------------------------------------
1. 纸 = **够暖**（R−B ≥ 2）+ 不太黑。上一版用的「够亮」在夜景里不行：
   雪地反光、水面灯影都很亮，但都是**冷**的（R−B 是负的），拿暖通道一刀就分开。

2. **右缘切在卷面（edge-sheet.png）的左缘上**，不是切在手写的常数上。
   卷面那张 mask 的左缘是被切平的（trace_edges.py 的 ROLLER_RIGHT），
   这一卷的右缘就必须咬着那条线：错一个像素，缝里就会漏出桌面的颜色。
   所以这里**读 edge-sheet.png 量出那条线**，两张贴图永远对得上。

3. 边界外再借卷面**两三个像素**（alpha 直接给 1）。卷面的 mask 左缘带 1px
   抗锯齿，单靠它自己会露一条半透明的发丝缝；这一卷伸进去一点，
   那半像素就由**图上原来的像素**补上——两张贴图重叠处严丝合缝。

4. 卷口的内圈、卷尾的螺旋里都有**很暗的沟**，暖通道过得去但亮度会掉。
   所以亮度阈值取得低（35），再 fill_holes 把沟填平——沟里要显示的是
   图上那些深色像素（那就是卷进去的纸），不是透明。

5. 输出 **RGBA**：CSS 的 mask-mode: match-source 对带 alpha 的图取 alpha 通道；
   灰度图（L 模式）没有 alpha，会被当成全不透明。这里不是当 mask 用，
   而是当成一张带 alpha 的贴图（background-image），alpha 同理不能省。
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import disk

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "2.png"
SHEET_MASK = ROOT / "public" / "edge-sheet.png"
OUT = ROOT / "public" / "roller.png"

# 认领卷筒用的种子点（y, x）：取在卷筒身**内部**
ROLLER_SEED = (400, 95)

# 借卷面几个像素：宽度按「和纸的撕裂口」给，2~3px 就够盖住那条 1px 的抗锯齿缝
SHEET_BITE = 3

# 剪影的边界之外留一点余量，免得抗锯齿的斜坡被裁掉
PAD = 4


def paper_mask(rgb: np.ndarray, limit: int) -> np.ndarray:
    """纸 = 够暖 + 不太黑。limit 右边一律不算（那一条让给卷面）。

    **先开，后认领**（与 trace_edges.py 同一条纪律）：开（腐蚀再膨胀）按**厚度**
    削东西——卷筒上挂着的水面反光、樱瓣、压在卷筒前面的树枝都是两三像素的细条，
    无论多长都会被削掉；卷筒自己几十像素宽的锥度一点不动（实测左右界逐行不变）。
    反过来先认领的话，这些细条会被并进剪影，卷筒边上就长出几根胡须。"""
    lum = rgb.mean(axis=2)
    warm = rgb[:, :, 0] - rgb[:, :, 2]
    paper = (warm >= 2) & (lum > 35) & (np.arange(rgb.shape[1])[None, :] < limit)
    return ndimage.binary_opening(paper, structure=disk(2))


def antialias(mask: np.ndarray) -> np.ndarray:
    """二值掩码 → 跨 1px 的抗锯齿 alpha。边界落在原轮廓上，不胖不瘦。"""
    inside = ndimage.distance_transform_edt(mask)
    outside = ndimage.distance_transform_edt(~mask)
    return np.clip(0.5 + inside - outside, 0, 1)


def clean_edge(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """把混在剪影边上的**背影**洗掉。

    2.png 里卷筒边缘那一两像素是「纸 + 夜景」的混色。这张贴图是要贴在桌面上的，
    带着这层混色再混一次背景，边上就多出一圈发黑的轮廓（像描了一道硬边）。
    所以：实心区（alpha ≈ 1）**原样保留**——那里的明暗是卷筒自己的柱面，
    其余像素一律取**最近的实心像素的颜色**，边界上只剩 alpha 那条 1px 的斜坡。"""
    core = alpha >= 0.98
    nearest = ndimage.distance_transform_edt(~core, return_indices=True)[1]
    return rgb[nearest[0], nearest[1]]


def roller_blob(rgb: np.ndarray, limit: int) -> np.ndarray:
    """卷筒的剪影：认领 + 闭 3×3（把左缘被树枝啃出的缺口合上）+ 填沟。"""
    raw = paper_mask(rgb, limit)
    labels, _ = ndimage.label(raw)
    seed_y, seed_x = ROLLER_SEED
    label = labels[seed_y, seed_x]
    if label == 0:
        raise SystemExit("种子点落在卷筒外，检查 ROLLER_SEED")
    blob = ndimage.binary_closing(labels == label, structure=np.ones((3, 3)))
    return ndimage.binary_fill_holes(blob)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    rgb = np.asarray(Image.open(SRC).convert("RGB")).astype(float)
    H, W, _ = rgb.shape
    print(f"源图 {W}×{H}")

    # 卷面的左缘：卷筒就切在这条线上（见文件头第 2 条）
    sheet = np.asarray(Image.open(SHEET_MASK))[:, :, 3]
    if sheet.shape != (H, W):
        raise SystemExit(f"edge-sheet.png 是 {sheet.shape[1]}×{sheet.shape[0]}，与 2.png 对不上")
    rows = np.where((sheet > 128).any(axis=1))[0]
    seam = min(int(np.where(sheet[y] > 128)[0].min()) for y in rows)
    print(f"卷面左缘 x = {seam}（{seam / W * 100:.2f}%）")

    blob = roller_blob(rgb, seam)
    ys, xs = np.where(blob)
    print(
        f"\n卷筒剪影  面积 {int(blob.sum()):>7}"
        f"  包围盒 x {xs.min()}..{xs.max()}  y {ys.min()}..{ys.max()}"
    )
    print("  左缘（y → 卷筒左界）:")
    for y in range(60, 860, 100):
        row = np.where(blob[y])[0]
        print(f"    y={y:>4}  x={row.min() if len(row) else '-'}")

    if not args.write:
        print("\n（只做分析。加 --write 才会写 public/roller.png）")
        return

    # 裁切框：剪影包围盒 + 余量；右缘再借卷面几像素（alpha 给满）
    x0, x1 = max(0, xs.min() - PAD), min(W, seam + SHEET_BITE)
    y0, y1 = max(0, ys.min() - PAD), min(H, ys.max() + 1 + PAD)

    # 两张贴图重叠的那几列：alpha 直接给 1，让卷面的抗锯齿边由原像素补上。
    # 只在**卷面自己盖得住的行**上借——卷面下缘以下借了就会多出一条纸。
    bite = np.zeros_like(blob)
    bite[:, seam:x1] = sheet[:, seam:x1] > 128
    solid = blob | bite

    alpha = antialias(solid)
    crop = clean_edge(rgb, alpha)[y0:y1, x0:x1]
    rgba = np.dstack([crop.round().astype(np.uint8), (alpha[y0:y1, x0:x1] * 255).round().astype(np.uint8)])
    Image.fromarray(rgba, "RGBA").save(OUT, optimize=True)

    w, h = x1 - x0, y1 - y0
    print(f"\n已写入 {OUT.relative_to(ROOT)}  {w}×{h}  {OUT.stat().st_size / 1024:.1f} KB")
    print("App.css 用这四个数（相对窗口的百分比，窗口按 2.png 的比例拉伸）:")
    print(f"  left:   {x0 / W * 100:.3f}%")
    print(f"  top:    {y0 / H * 100:.3f}%")
    print(f"  width:  {w / W * 100:.3f}%")
    print(f"  height: {h / H * 100:.3f}%")
    print(f"  卷筒露出的一段（卷面左缘 {seam / W * 100:.2f}% 之前）：宽 {(seam - x0) / W * 100:.2f}%")


if __name__ == "__main__":
    main()
