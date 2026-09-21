"""从 2.png 里**抠出纸的轮廓**，生成 CSS mask 用的贴图。

    python scripts/trace_edges.py --write

为什么不再用 clip-path 多边形
------------------------------------------------
之前 `--torn-sheet` 是手写的一串百分比点：能表达「大概撕开」，但和 2.png 的
实际轮廓差得远——撕口的齿是随机的，手写不出那个节奏。「1:1 复刻」只有一条路：
**从图上把轮廓抠出来**，做成 mask 贴图。轮廓就是图上的轮廓，不是近似。

步骤与几个易踩的坑
------------------------------------------------
1. 阈值**分两条**：卷面 = 够亮 + 不偏蓝；两张纸片 = 够暖 + 不太黑（它们浮在
   卷面下沿之外的水面上，比卷面暗一档，用卷面那条会被削成一条窄带——
   见 shard_mask）。背景夜景（水、屋、枝）两条都不满足。

2. **先开，后闭，顺序不能反。** 开（腐蚀再膨胀）先削掉「毛刺」——水面反光、
   樱瓣、屋檐这些细长的亮条会粘在纸边上，像纸长出了胡须。腐蚀是按**厚度**
   起作用的：两三像素的细条无论多长都会被削掉，而撕口那几个像素的齿还在。
   闭随后把笔画与纸纹留下的小孔填平。反过来先闭的话，毛刺会被膨胀糊进纸里，
   再开就削不掉了。

3. **先分块，再闭。** 闭运算会把卷面右下角与「右下纸片」之间那道透明缝隙糊掉，
   两块并成一块——于是卷面的 mask 里多出一块纸片，画面上那块位置就会多出一张
   纸。所以：在开过的图上做连通域 → 按种子点 / 位置认领 → **每块各自闭**，
   只修自己的凹处，不会把邻居吞进来。

4. 抗锯齿不能省。二值掩码直接当 mask 用，边缘是 1px 的硬台阶。这里用内外
   距离场做跨 1px 的过渡：alpha = 0.5 + d_in - d_out，边界正好落在原轮廓上。

5. 输出必须是 **RGBA**。CSS 的 `mask-mode: match-source` 对带 alpha 的图取
   alpha 通道；灰度图（L 模式）没有 alpha，会被当成「全不透明」，整块 mask 失效。
   这是个很常见的坑。
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import disk

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "2.png"
OUT = ROOT / "public"

# 纸卷占的那一条：卷面要在这里切开，否则卷面会把纸卷盖掉
ROLLER_RIGHT = 104

# 认领卷面用的种子点（y, x）：取在纸**内部**，避开文字造成的孔
SHEET_SEED = (400, 400)


def paper_mask(rgb: np.ndarray) -> np.ndarray:
    """卷面：纸 = 够亮 + 不偏蓝。只做**开**，闭留给每一块自己去闭（见文件头第 3 条）。"""
    lum = rgb.mean(axis=2)
    warm = rgb[:, :, 0].astype(float) - rgb[:, :, 2].astype(float)
    return ndimage.binary_opening((lum > 138) & (warm > -14), structure=disk(2))


def shard_mask(rgb: np.ndarray) -> np.ndarray:
    """纸片：判据要**比卷面松一档**。

    两张纸片落在卷面下沿之外——它们浮在水面上、处在夜景的暗部，纸面亮度只有
    130~220（卷面是 190~230）。拿卷面那条「够亮」（>138）去量，纸片会被削成中间
    一条窄带：上下那两档暗边整条丢掉，于是应用里这两块纸的边缘跟设计图差了十几
    像素（左下那块最明显，纸上只剩一条）。所以纸片单独一条判据：
    **够暖（R−B>0）+ 不太黑（>100）**。夜与水两条都不满足，仍然分得开。"""
    lum = rgb.mean(axis=2)
    warm = rgb[:, :, 0].astype(float) - rgb[:, :, 2].astype(float)
    return ndimage.binary_opening((lum > 100) & (warm > 0), structure=disk(2))


def antialias(mask: np.ndarray) -> np.ndarray:
    """二值掩码 → 跨 1px 的抗锯齿 alpha。边界落在原轮廓上，不胖不瘦。"""
    inside = ndimage.distance_transform_edt(mask)
    outside = ndimage.distance_transform_edt(~mask)
    return np.clip(0.5 + inside - outside, 0, 1)


def tidy(blob: np.ndarray) -> np.ndarray:
    """只对**这一块**做闭运算：补掉凹处的豁口，碰不到邻居。"""
    return ndimage.binary_fill_holes(ndimage.binary_closing(blob, structure=disk(4)))


def save(alpha: np.ndarray, box: tuple, name: str, report: list) -> None:
    x0, y0, x1, y1 = box
    crop = (alpha[y0:y1, x0:x1] * 255).round().astype(np.uint8)
    # 输出 RGBA：灰度图（L 模式）没有 alpha，CSS 会把它当成「全不透明」，
    # 整块 mask 失效——这里必须带上 alpha 通道。
    rgba = np.dstack([np.full_like(crop, 255)] * 3 + [crop])
    path = OUT / name
    Image.fromarray(rgba, "RGBA").save(path, optimize=True)
    report.append((name, box, (crop.shape[1], crop.shape[0]), path.stat().st_size))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    rgb = np.asarray(Image.open(SRC).convert("RGB")).astype(float)
    H, W, _ = rgb.shape
    print(f"源图 {W}×{H}")

    opened = paper_mask(rgb)
    labels, count = ndimage.label(opened)
    print(f"开运算后连通域 {count} 个")

    # ---- 卷面：按种子点认领 ----
    seed_y, seed_x = SHEET_SEED
    seed_label = labels[seed_y, seed_x]
    if seed_label == 0:
        raise SystemExit("种子点落在纸外，检查 SHEET_SEED")
    sheet = tidy(labels == seed_label)
    sheet[:, :ROLLER_RIGHT] = False          # 左边那一条让给纸卷
    sheet = ndimage.binary_fill_holes(sheet)

    ys, xs = np.where(sheet)
    print(f"\n卷面  面积 {int(sheet.sum()):>9}  包围盒 x {xs.min()}..{xs.max()}  y {ys.min()}..{ys.max()}")
    print("  上缘（x → 纸面起始 y）:")
    for x in range(150, 1600, 180):
        col = np.where(sheet[:, x])[0]
        print(f"    x={x:>4}  y={col.min() if len(col) else '-'}")
    print("  右缘（y → 纸面终止 x）:")
    for y in range(120, 830, 110):
        row = np.where(sheet[y])[0]
        print(f"    y={y:>4}  x={row.max() if len(row) else '-'}")

    # ---- 底部两块纸片：按位置认领 ----
    # 纸片走**另一条判据**（见 shard_mask）：它们比卷面暗一档，
    # 拿卷面那条「够亮」去量，左下那块会被削成一条窄带。
    shard_labels, shard_count = ndimage.label(shard_mask(rgb))
    shards = {}
    for i in range(1, shard_count + 1):
        blob = shard_labels == i
        if int(blob.sum()) < 4000:
            continue
        yy, xx = np.where(blob)
        if yy.min() / H < 0.84:
            continue                          # 底部之外的一律不要
        cx = xx.mean() / W
        if cx < 0.35:
            shards["unit"] = (blob, (xx.min(), yy.min(), xx.max() + 1, yy.max() + 1))
        elif cx > 0.70:
            shards["tools"] = (blob, (xx.min(), yy.min(), xx.max() + 1, yy.max() + 1))

    print("\n纸片：")
    for kind in sorted(shards):
        blob, box = shards[kind]
        x0, y0, x1, y1 = box
        print(
            f"  {kind:<6} 面积 {int(blob.sum()):>7}  包围盒 {box}"
            f"   →  left {x0 / W * 100:.2f}%  top {y0 / H * 100:.2f}%"
            f"  w {(x1 - x0) / W * 100:.2f}%  h {(y1 - y0) / H * 100:.2f}%"
        )

    if not args.write:
        print("\n（只做分析。加 --write 才会写 public/edge-*.png）")
        return

    report: list = []
    save(antialias(sheet), (0, 0, W, H), "edge-sheet.png", report)
    for kind in sorted(shards):
        blob, box = shards[kind]
        save(antialias(tidy(blob)), box, f"edge-{kind}.png", report)

    print("\n已写入 public/：")
    for name, _box, size, nbytes in report:
        print(f"  {name:<18} {size[0]}×{size[1]}  {nbytes / 1024:>6.1f} KB")


if __name__ == "__main__":
    main()
