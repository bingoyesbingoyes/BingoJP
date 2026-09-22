"""从 new_design.png 里抠出这一版 UI 要用的贴图。

    python scripts/trace_design.py            # 只分析，打印量到的数
    python scripts/trace_design.py --write    # 写 public/

设计稿 new_design.png 与 1.png / 2.png 一样**不入库**（体积大，见 .gitignore），
但这份脚本要它才能跑。生成好的贴图都在 public/ 里，正常开发不需要重跑；
要重跑就把设计稿放回仓库根目录。

为什么是「抠图」而不是「画」
------------------------------------------------
设计稿上的东西分两类：

1. **手作的痕迹**——纸的撕裂边、読む 的毛笔字、朱印、笔扫色块、选中的撕纸带、
   纸上的水墨插画、和纸的斑。这些是画出来的（毛笔、水彩、撕裂的纸），
   CSS 里没有对应的东西。硬写只能写出「大概像」，所以一律**从图上搬像素**。

   **设计稿上的夜空不抠。** 那是稿子的演示底：真机上窗口之外是桌面，
   铺一张不透明的背景图会把窗口变回一个矩形，异形窗的轮廓——尤其左边纸卷那一条
   ——整个糊掉。异形窗的边框就是「纸自己的轮廓 + 纸卷 + 两道投影」。

2. **规则的形状**——梅花纹、青海波、七宝纹、扇纹、窗口按钮的朱圈与朱方、
   各种箭头。它们是几何形，搬像素反而会糊（这几枚在稿子上只有 20~30px），
   所以放在 components/Seal.tsx 里用 SVG 重画，任何尺寸都清晰
   （只画真正用到的那几枚：梅花纹、花边圆、箭头）。

本脚本负责第 1 类。

几个关键的量（都是 1579×996 的稿子上量出来的）
------------------------------------------------
  卷面（纸）      x 107..1536   y 60..870（上缘是一道弧：两边 60、中缝 91）
  纸卷（左端）    x 40..107     —— **左侧不动**，这一块仍用 2.png 抠的 roller.png
  三栏折缝        x 398 与 x 1088
  页签（真实 UI） x 41..61（内缘）y 350..457；中心 y 403.5＝窗口高的 40.5%；
                  右页签外缘 x 1536 —— 轮廓是**梯形**（外缘整个身高、内缘短 20px），
                  用 clip-path 画在 EdgeTab.css，记号（朱梅 + 箭头）也是几何形。
  窗口按钮        圆 (1463.5, 80.5)  方 (1493, 80.5)  直径 18

  ⚠ 右下角图例那一格里的短冊（x 1298..1315 y 914..968）是**示意图**：空册面、
  两头收尖、箭头画在册面外侧，与上面真实页签的画法并不一致。做 UI 时照真实页签，
  不照那一格。

坑
------------------------------------------------
1. 「纸」和「夜空」不能靠亮度分：稿子左上角有一轮**月亮**，和纸一样亮。
   判据用**暖度**（R−B）：纸暖、月亮是中性灰、夜空偏蓝。这一条同时把星星、
   水面反光一起排除掉。

2. 撕口 / 页签边上会有「几像素的亮毛刺」（纤维、星点）粘上来。先做**开运算**
   按厚度削掉它们，再闭运算补内部的小孔——顺序反了毛刺会被糊进纸里。

3. 输出 mask 必须带 **alpha**（RGBA）。CSS 的 `mask-mode: match-source`
   对灰度图取不到 alpha，会当成「全不透明」，整条 mask 失效。

4. 背景里被纸盖住的那一块要先**补**出来。补得准不准其实看不见——纸是按百分比
   铺的、盖住的还是同一块——但留着一块黑纸的鬼影，一旦版心比例变了就会露出来。
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
from skimage.morphology import disk

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "new_design.png"
OUT = ROOT / "public"

W, H = 1579, 996

# 卷面 mask 在左边切开的位置：要切进纸卷里几像素，两张贴图叠一点，
# 缝上的 1px 抗锯齿由**纸卷自己的像素**补（和 2.png 版同一套做法）。
ROLLER_CUT = 98


def warm(rgb: np.ndarray) -> np.ndarray:
    return rgb[:, :, 0] - rgb[:, :, 2]


# ---------------------------------------------------------------- 纸面


def paper_mask(rgb: np.ndarray) -> np.ndarray:
    """纸 = 够亮 + 够暖。夜空偏蓝、月亮中性——两条都分得开。"""
    lum = rgb.mean(axis=2)
    opened = ndimage.binary_opening((lum > 130) & (warm(rgb) > 4), structure=disk(2))
    # 只留最大的一块：卷面 + 纸卷 + 页签会被开运算切成几块，先认大的
    labels, count = ndimage.label(opened)
    if count == 0:
        raise SystemExit("没找到纸——判据要重看")
    sizes = ndimage.sum(opened, labels, range(1, count + 1))
    blob = labels == (int(np.argmax(sizes)) + 1)
    return ndimage.binary_fill_holes(ndimage.binary_closing(blob, structure=disk(6)))


def antialias(mask: np.ndarray, soft: float = 1.0) -> np.ndarray:
    """二值 → 抗锯齿 alpha。边界落在原轮廓上，不胖不瘦。

    `soft` 是过渡带的**宽度**（像素）。默认 1 是「一像素硬边」——真机上看到的是一道
    台阶：这张 mask 会被重采样（1440 窗是 0.91×、2160 窗是 1.37×），一像素的过渡
    被拉成一格一格的锯齿，窗口边缘就「不平滑」。卷面给 3.4：1440 窗上是 1.5px 的软边、
    2160 窗上是 2.3px——都是纸边该有的软度，不是糊。
    """
    inside = ndimage.distance_transform_edt(mask)
    outside = ndimage.distance_transform_edt(~mask)
    return np.clip(0.5 + (inside - outside) / soft, 0, 1)


def soften(alpha: np.ndarray, sigma: float) -> np.ndarray:
    """给 alpha 再糊一道高斯，把重采样露出来的**台阶**抹平。

    为什么 `antialias` 之后还要这一道：那个 3.4px 的线性过渡落在 **2× 的网格**上，
    重采样到 1418 宽的窗口只有 1.5px；而设计稿上那条轮廓本身是 1px 的硬边，
    二值化之后就是 1px 高的台步——1.5px 的过渡盖不住它，窗口边缘于是看得见锯齿
    （实测过渡带只有 0.65px，台阶清清楚楚）。

    高斯是按**标准差**给的，软出来的是一道连续的坡，不是一条直线段：
    sigma 1.4 在 2× 网格上是 10%→90% 约 3.6px、落到窗口约 1.6px——正好是
    一张手撕的纸边该有的软度，撕口的齿还在（那个齿是十几个设计像素的起伏，
    不是一两像素的毛刺）。别再往上加：sigma 上到 2.4 就开始「糊」，
    纸边会变成一条晕开的带子，不是撕开的纸。
    """
    return ndimage.gaussian_filter(alpha, sigma)


def supersample(mask: np.ndarray, factor: int = 2) -> np.ndarray:
    """把二值 mask **平滑放大** N 倍再二值化。

    轮廓落在更细的网格上，于是「设计稿这一像素的毛边」在放大后的窗口里仍是平滑的曲线，
    而不是整数倍的方块。mask 的贴图尺寸不影响布局（CSS 一律 mask-size: 100% 100%）。
    """
    im = Image.fromarray((mask * 255).astype(np.uint8), "L")
    im = im.resize((mask.shape[1] * factor, mask.shape[0] * factor), Image.BICUBIC)
    return np.asarray(im).astype(float) / 255.0 > 0.5


def smooth_contour(mask: np.ndarray, sigma: float) -> np.ndarray:
    """**先糊成覆盖率场、再取 0.5 的等值线**——轮廓于是是一条平滑曲线。

    为什么不能只靠 antialias / soften：设计稿的纸边是一像素的硬边，阈值一取，
    轮廓就**逐像素地量在稿子的网格上**——一列两三个像素的台阶连着排下去。
    那一串台阶的起伏只有 ±1px、周期却很短（两三个设计像素一个），
    所以：
      · `antialias` 那道线性过渡盖不住它（过渡比台阶还宽，台阶只是变模糊了）；
      · 靠 `soften` 加大 sigma 也能盖住，但**代价是整个纸边一起糊**——
        sigma 要大到一整个台阶周期，纸边就成了一条晕开的带子。
    先平滑**场**再取等值线就没有这个矛盾：等值线只跟着场的**平均走向**走，
    短周期的台阶被平均掉，而它自己仍旧是一条干净的曲线，后面照旧可以只给
    一点点抗锯齿的软度。sigma＝2× 网格上的像素（3.0 → 1.5 设计像素）：
    正好吃掉一两像素的台阶，十几像素的撕口齿（稿子真正的特征）原样留下。
    """
    coverage = ndimage.gaussian_filter(mask.astype(float), sigma)
    return coverage > 0.5


def write_alpha(alpha: np.ndarray, name: str) -> None:
    """alpha → RGBA（白 RGB + alpha）。带 alpha 才不会被 CSS 当成全不透明。"""
    data = (np.clip(alpha, 0, 1) * 255).round().astype(np.uint8)
    rgba = np.dstack([np.full_like(data, 255)] * 3 + [data])
    Image.fromarray(rgba, "RGBA").save(OUT / name, optimize=True)
    print(f"  {name:<20} {data.shape[1]}×{data.shape[0]}  {(OUT / name).stat().st_size / 1024:>7.1f} KB")


# ---------------------------------------------------------------- 各枚贴图

# 卷面轮廓那一道高斯的 sigma（**2× 网格上的像素**，见 soften）：
#   1.4 → 窗口上约 1.6px 的软边。0.9 还看得见台阶，2.4 就糊成一条晕带。
EDGE_SOFTEN = 1.4

# 卷面轮廓**取等值线之前**那一道高斯（**2× 网格上的像素**，见 smooth_contour）：
#   设计稿的纸边是一像素的硬边，阈值一取，轮廓就逐像素地量在稿子的网格上——
#   上缘那一段「一列三个像素、往下掉一格」的台阶就是这么来的，重采样到窗口上
#   就是用户报的「锯齿形不平滑」。3.0（＝1.5 设计像素）正好吃掉这种短周期台阶，
#   又不到会磨掉撕口齿的程度；贴上再加大就得连纸边一起糊。
CONTOUR_SIGMA = 3.0

# 插画抠图（见 art_alpha / art_color）：判据、门槛与增益。
#
#   上一版的病根有两条，都在「RGB 归一到 --paper + alpha 压得很保守」这一套里：
#
#   1. **画被冲淡**。alpha 是拿「粉 / 枝」两条颜色判据凑出来的，门槛压得保守（怕纸的斑
#      漏进来），于是稿上最深的枝只有一半的 α；再乘一道 1.7 的增益也补不回来——
#      补的是 α，色本身仍停在「纸色的 0.6 倍」那一档。结果就是用户报的
#      「樱花图和设计稿差别大」：稿上是一枝有骨有花的淡彩，画面上是一片几乎看不见的影。
#   2. **贴上去的是个方块**。α>0 的地方色一律被写成 --paper，而那块纸在稿上比 --paper
#      暗一档，于是纸的斑一漏出来，纸上就浮出一个**比周围亮**的方块补丁。
#
#   现在改成**反解**（unmultiply）：α＝「这一像素里有几分之几是画」，
#   色＝paper + (稿子 − paper) / α，合成回去 paper*(1−α) + 色*α 正好还原稿子上的那一像素。
#   于是画该多深就多深（墨就是墨、粉就是粉），而 α→0 的地方**真的透明**——
#   纸的斑不再被涂成另一个颜色，方块补丁自然消失（纸自己照旧从 .makimono__mottle 透上来）。
ART_PAPER_SIGMA = 22.0  # 估「局部纸色」的高斯（设计像素）：比画粗、比整页细
ART_GATE_LO = 13.0      # 亮度偏差：低于此＝纸（完全透明）
ART_GATE_HI = 17.0      # 亮度偏差：高于此＝画（完全实心）。这两条**卡得很窄**，见下
ART_CHROMA_LO = 12.0    # 冷暖偏差（R−B 与纸的差）：低于此＝纸
ART_CHROMA_HI = 22.0    # 高于此＝画
ART_ALPHA_BLUR = 0.6    # α 再糊一道：只为了把等值线那一道硬边化开
ART_COLOR_FLOOR = 0.25  # 反解时 α 的下限：淡处最多把偏差放大四倍
ART_RULE_ROWS = 5       # 通栏发丝线（界栏）连着不超过这几行就整行抹掉

# 判据为什么是**两条**、而且第一条卡得很窄
# ----------------------------------------------------------------
# 反解（见 art_color）会把「α 那一份」按稿子原样画出来——包括稿子**纸面自己的纹理**。
# 应用的纸比稿子的纸平（实测高频噪声 0.5 对 5，同一块地方），所以只要 α 在纸面上
# 有一点点，纸上就会浮出一块「纹理不一样的矩形」：不是颜色不对，是质感不对。
#
# 于是 α 必须在纸面上**干净地等于 0**：亮度那条卡在 13~17（四个量级的窄坡），
# 纸的斑（多半在 ±10 之内）整片落在坡下面。
#
# 但只留亮度一条，淡彩就没了：水墨那幅远山只比纸暗十来级。所以补一条**冷暖**——
# 稿子的纸很暖（R−B ≈ 30），画要么更冷（蓝灰的枝、淡墨的远山、灰瓦），
# 要么更暖（粉花）。这一条量大的是**色相**，不是深浅，于是「只淡了一点、但颜色
# 明显不对」的地方照样能捞回来，而纸自己的斑（暖色上的深浅）在冷暖上几乎不动。
#
# 两条取大的那个。ART_COLOR_FLOOR 是反解的分母下限，卡的是「淡处放大多少倍」：
# 越小淡彩越足、纸的斑也越容易跟着浮起来；0.25 是量出来的拐点
# （远山还原到 ~100%，而纸面多出来的噪声不到 0.1/255）。

# (名字, 框)  框是**设计稿坐标**；插画框的两条纪律见各自的注释。
CROPS = {
    # 読む 的毛笔字：纸上最黑的墨。alpha = 墨的浓淡
    "ink-yomu.png": (140, 88, 242, 150),
    # 読む 右边那方朱印（訓読み）：最红的朱
    "seal-yomu.png": (240, 108, 260, 140),
    # 基本課文 身后的枯茶笔扫（带收尾的尾巴），三种标题共用这一枚
    "wash-label.png": (424, 204, 566, 246),
    # 选中的撕纸带（第1课那一行）：比纸暗一档的枯朱
    "band-select.png": (114, 202, 402, 262),
    # 课文页**右上那枝樱**（水墨 + 粉花）。稿上它跨着中缝长（实测 x 1015..1175、
    # y 140..285），所以按折缝 x 1088 切成两半：左边跟着课文页、右边跟着生词页
    # （两块纸各自会滑走，画也必须跟着各自那一页切——整块贴一边，另一边的门
    # 一关，画就少一截）。左右两半都以折缝 1088 为界，合起来正好接得上。
    "art-branch.png": (1006, 132, 1088, 292),
    # 生词页那半枝：**右缘收在 1132，不能跟到 1186**。1186 会把稿上折缝右侧那道
    # 「纸堆」（x 1138..1166 的竖条，见 App.css 的页堆）一起框进来——
    # 竖条在框里是**整条都在**，而框只有 160 行高，贴到生词页上就是一条上下都
    # 齐着断的亮带（生词页的折缝本来由 .vocab__inner 的渐变画）。画本身到 1115 就完了。
    "art-branch-vocab.png": (1088, 132, 1132, 292),
    # 目次页**右上那枝樱**：稿上它整个在目次页里（x 333..393）。**右缘收在 393**：
    # 394 往后是这一页的折缝（比邻纸暗 10~20/255 的一条），框进去就会在页缘上多出
    # 一截只有 60 行高的暗线——折缝由 .rail__inner 的渐变画，画里不该带。
    "art-branch-rail.png": (321, 92, 393, 152),
    # 课文页右下的水墨山水（这一半：远山、松、水）。右缘＝折缝 1088（与课文栏的右缘
    # 同一列）；下缘**收在 864**——稿上纸面到 864 就完了，865 起是撕口的断边，
    # 框进去就是画底下压着一条黑边。
    "art-sumi.png": (1000, 596, 1088, 864),
    # 生词页左下那一半（雪屋、屋前的水、那方朱印）。左缘＝折缝 1088，
    # 右缘收在 1140（同上：再往右是纸堆那条竖带），下缘同 864。
    "art-house.png": (1088, 596, 1140, 864),
}



def alpha_from_darkness(rgb: np.ndarray, box: tuple, lo: float = 150, hi: float = 40) -> np.ndarray:
    """墨：越黑 alpha 越高。lo＝完全透明，hi＝完全实心。"""
    x0, y0, x1, y1 = box
    lum = rgb[y0:y1, x0:x1].mean(axis=2)
    return np.clip((lo - lum) / (lo - hi), 0, 1)


def alpha_from_redness(rgb: np.ndarray, box: tuple, lo: float = 40, hi: float = 76) -> np.ndarray:
    """朱砂：R−B 越大越是印泥。

    **门槛必须卡在纸与朱之间**：这张和纸本身就很暖（#e4d7c5 的 R−B 有 31），
    门槛写成 6 会把整块纸都判成朱砂，抠出来是一方实心红砖，不是一枚印。
    这方小印的朱实测 R−B 44~79、纸 29~39，所以门槛放 40、上限 76。"""
    x0, y0, x1, y1 = box
    d = warm(rgb[y0:y1, x0:x1])
    return np.clip((d - lo) / (hi - lo), 0, 1)


def upsample_periodic(grid: np.ndarray, size: int) -> np.ndarray:
    """把小网格周期性地双线性放大到 size×size。

    「周期性」是关键：索引对网格取模、插值时首尾相接，所以放大的结果
    **四边天然对得上**——铺开的时候不会有接缝。
    """
    n = grid.shape[0]
    t = np.arange(size) * n / size
    i0 = np.floor(t).astype(int) % n
    i1 = (i0 + 1) % n
    f = t - np.floor(t)
    f = f * f * (3 - 2 * f)  # smoothstep：比线性更像云
    rows = grid[i0] * (1 - f)[:, None] + grid[i1] * f[:, None]
    return rows[:, i0] * (1 - f)[None, :] + rows[:, i1] * f[None, :]


def tileable_noise(size: int, rng: np.random.Generator) -> np.ndarray:
    """可无缝平铺的多倍频噪声（0..1）：大斑 + 中斑 + 小斑，逐层叠加。"""
    acc = np.zeros((size, size))
    total = 0.0
    for cells, amp in ((3, 1.0), (7, 0.5), (15, 0.26), (31, 0.13), (61, 0.07)):
        acc += upsample_periodic(rng.random((cells, cells)), size) * amp
        total += amp
    acc /= total
    acc -= acc.min()
    return acc / max(acc.max(), 1e-6)


def paper_mottle(size: int = 512) -> np.ndarray:
    """和纸肌：一张可平铺的灰度图（乘算用）。

    稿上的纸不是一块匀色——有**斑**（云斑、水渍）与**簀目**（抄纸帘留下的细竖纹）。
    这两样都是低频到中频的结构，用噪声 + 一层竖纹合成。

    输出是中灰到白的灰阶：贴上去用 `multiply`，只在斑处压暗，白色处纸色不动。
    """
    rng = np.random.default_rng(20260921)
    blot = tileable_noise(size, rng) ** 1.6  # 幂次让斑聚成块，不是一层雾
    fine = tileable_noise(size, rng)
    # 簀目：细密的竖纹（周期整除 size，才无缝）
    chain = 0.5 + 0.5 * np.sin(np.arange(size) * (2 * np.pi * 48 / size))
    chain = np.tile(chain, (size, 1))

    # 斑要**看得出块**，簀目只留一点点：稿上的纸是「云斑」为主、帘纹几乎看不见。
    # 帘纹给重了，整页会浮起一道道等距竖条——那是复印机，不是手抄纸。
    depth = 0.66 * blot + 0.26 * fine + 0.035 * (1 - chain)
    depth = np.clip(depth, 0, 1)
    grey = 255 - depth * 58  # 最深压到 197：乘完约暗 23%
    return np.clip(grey, 0, 255).round().astype(np.uint8)


def art_alpha(rgb: np.ndarray, box: tuple) -> tuple:
    """插画的覆盖率：这一像素里有几分之几是画。返回 (稿子, 局部纸色, alpha)。

    两条判据取大的那个（为什么是两条、为什么第一条卡得那么窄，见 ART_GATE_LO 上面）：

      · **亮度**：比局部纸暗多少，三通道取最大的那一档——墨、粉花的 B 通道、
        蓝灰枝的 R 通道都在里面；
      · **冷暖**：R−B 与纸的差。量的是**色相**，所以「只淡了一点、颜色却明显不对」
        的淡彩（远山、灰瓦、粉花）照旧捞得回来，而纸自己的斑在冷暖上几乎不动。

    「局部纸色」用一道大高斯估。它比画粗、比整页细：细了会把画本身当成纸色
    （画于是消失），粗到整页又会把大片的山水算进纸色里（同样消失）。
    """
    x0, y0, x1, y1 = box
    part = rgb[y0:y1, x0:x1]
    paper = np.dstack([ndimage.gaussian_filter(part[:, :, c], ART_PAPER_SIGMA) for c in range(3)])

    dev = np.max(paper - part, axis=2)
    warm_dev = np.abs((part[:, :, 0] - part[:, :, 2]) - (paper[:, :, 0] - paper[:, :, 2]))
    a = np.maximum(
        (dev - ART_GATE_LO) / (ART_GATE_HI - ART_GATE_LO),
        (warm_dev - ART_CHROMA_LO) / (ART_CHROMA_HI - ART_CHROMA_LO),
    )
    return part, paper, ndimage.gaussian_filter(np.clip(a, 0, 1), ART_ALPHA_BLUR)


def drop_rules(alpha: np.ndarray) -> np.ndarray:
    """抹掉**界栏**：稿子上「基本課文」那一道通栏发丝线。

    它横穿插画框，判据上是一条实心线——留在贴图里，画上就多一道不属于画的横线
    （应用里的界栏由 .sec__rule 自己画）。判据：某一行 75% 以上都是实心，
    而且连着不超过 ART_RULE_ROWS 行——那是线，不是画。
    """
    wide = (alpha > 0.5).mean(axis=1) > 0.75
    start = None
    for i in range(len(wide) + 1):
        on = i < len(wide) and wide[i]
        if on and start is None:
            start = i
        elif not on and start is not None:
            if i - start <= ART_RULE_ROWS:
                alpha[start:i] = 0.0
            start = None
    return alpha


def alpha_from_shade(rgb: np.ndarray, box: tuple, lo: float = 224, hi: float = 168) -> np.ndarray:
    """笔扫 / 撕纸带：比周围的纸暗一档的色块，深浅就是 alpha。

    两个坑：

    1. **色块里写了字**，字比色块更暗；按亮度取 alpha 会把字描一遍——
       那样得到不是「一张撕下来的纸」，而是「纸 + 字的鬼影」。
       所以先把色块的轮廓闭出来、填掉内部的孔（字、圆圈、花都在里面），
       轮廓之内的 alpha 一律走**模糊后的低频**（＝色块本身的深浅起伏，不含字），
       轮廓那一圈才保留按亮度算出来的渐变边。

    2. **纸本身不是一块匀色**（有纤维、水渍、噪点），按亮度算出来的 alpha
       在纸色上也有一两个百分点的值。整块贴图于是浮着一层**极淡的矩形**——
       贴在应用里，笔扫周围就会出现一个看得见的浅色方块。
       所以轮廓之外要把小值直接抹平（低于 0.45 的一律归零），只留毛边的过渡。
    """
    x0, y0, x1, y1 = box
    lum = rgb[y0:y1, x0:x1].mean(axis=2)
    a = np.clip((lo - lum) / (lo - hi), 0, 1)
    a = ndimage.grey_opening(a, size=(3, 3))

    core = a > 0.4
    silhouette = ndimage.binary_fill_holes(ndimage.binary_closing(core, structure=disk(4)))

    # 轮廓之内：抹掉字，只留色块自己的深浅
    inside = silhouette.astype(float)
    smear = ndimage.gaussian_filter(a * inside, 5) / np.maximum(
        ndimage.gaussian_filter(inside, 5), 1e-6
    )
    body = np.clip(smear * 1.15 + 0.1, 0, 1)
    # 轮廓之外：纸色上的渣一律归零，但**收笔那一截尾巴要留住**——
    # 门槛卡在 0.45 会把尾巴整条切掉，笔扫就成了一个圆疙瘩。
    # 纸的底色约 0.16、尾巴约 0.34、笔身约 0.6，所以门槛放 0.24。
    edge = np.clip((a - 0.24) / 0.45, 0, 1)
    out = np.where(silhouette, body, edge)
    # 最后再化一道，撕口的齿才不会是一圈硬台阶
    return np.clip(ndimage.gaussian_filter(out, 0.8), 0, 1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    # 只重写点名的那几枚（逗号分隔）。调一枚插画的框时不必把整套贴图重生成一遍，
    # 免得二进制资源出现无谓的改动。不写就是全部。
    parser.add_argument("--only", default="", help="例：--only art-branch.png,art-branch-vocab.png")
    args = parser.parse_args()

    only = {name.strip() for name in args.only.split(",") if name.strip()}

    def wanted(name: str) -> bool:
        return not only or name in only

    im = Image.open(SRC).convert("RGB")
    if im.size != (W, H):
        raise SystemExit(f"设计稿应当是 {W}×{H}，实际 {im.size}")
    rgb = np.asarray(im).astype(float)
    print(f"设计稿 {W}×{H}   宽高比 {W / H:.4f}")

    sheet = paper_mask(rgb)
    ys, xs = np.where(sheet)
    print(f"\n卷面（含纸卷、页签）  包围盒 x {xs.min()}..{xs.max()}  y {ys.min()}..{ys.max()}")
    print("  上缘（x → 纸面起始 y）:")
    for x in range(140, 1540, 120):
        col = np.where(sheet[:, x])[0]
        print(f"    x={x:>4}  y={col.min() if len(col) else '-'}")
    print("  下缘（x → 纸面终止 y）:")
    for x in range(140, 1540, 200):
        col = np.where(sheet[:885, x])[0]
        print(f"    x={x:>4}  y={col.max() if len(col) else '-'}")
    print("  右缘（y → 纸面终止 x）:")
    for y in range(100, 860, 120):
        row = np.where(sheet[y])[0]
        print(f"    y={y:>4}  x={row.max() if len(row) else '-'}")

    if not args.write:
        print("\n（只做分析。加 --write 才会写 public/）")
        return

    print("\n已写入 public/：")

    # 1. 和纸肌（可平铺的灰度图，CSS 里用 multiply 铺在整幅卷面上）
    if wanted("paper-mottle.png"):
        mottle = paper_mottle()
        Image.fromarray(mottle, "L").convert("RGBA").save(OUT / "paper-mottle.png", optimize=True)
        print(
            f"  {'paper-mottle.png':<20} {mottle.shape[1]}×{mottle.shape[0]}"
            f"  {(OUT / 'paper-mottle.png').stat().st_size / 1024:>7.1f} KB"
        )

    # 2. 卷面轮廓（左边切进纸卷）。**2× 超采样 → 平滑取等值线 → 3.4px 软过渡 + 高斯软边**：
    #    轮廓落在两倍细的网格上，再走一道 smooth_contour（见那个函数）——
    #    稿子那串「两三像素一个」的台阶在取等值线之前就被平均掉了，
    #    所以重采样到 1440 / 2160 都不会留下锯齿。最后那一道高斯见 soften()：
    #    它抹的是重采样本身带来的台阶，不是稿子的台阶（那个已经没了）。
    if wanted("edge-sheet.png"):
        cut = sheet.copy()
        cut[:, :ROLLER_CUT] = False
        cut = ndimage.binary_fill_holes(cut)
        cut = smooth_contour(supersample(cut, 2), CONTOUR_SIGMA)
        write_alpha(soften(antialias(cut, 3.4), EDGE_SOFTEN), "edge-sheet.png")

    # 3. 手作痕迹
    for name, box in CROPS.items():
        if not wanted(name):
            continue
        if name == "ink-yomu.png":
            a = alpha_from_darkness(rgb, box)
        elif name == "seal-yomu.png":
            a = alpha_from_redness(rgb, box)
        elif name.startswith("art-"):
            # 插画是彩色的（水墨淡彩）：粉花、蓝灰的枝、墨。
            # α 的判据与「局部纸色」见 art_alpha()，色由**反解**给出（见 ART_PAPER_SIGMA
            # 上面那段说明）。这里只剩两件收尾的事：抹掉界栏、写文件。
            part, paper, a = art_alpha(rgb, box)
            a = drop_rules(a)

            # 色 = paper + (稿子 − paper) / α。
            #   α 是「这一像素里有几分之几是画」，所以合成回去
            #   paper*(1−α) + 色*α 正好还原稿子上的那一像素：画该多深就多深。
            #   分母给一个下限（ART_COLOR_FLOOR）：α 很小时偏差会被放得很大，
            #   纸的斑会浮成一个色块——下限把放大倍数卡在 1/0.5。
            color = paper + (part - paper) / np.maximum(a, ART_COLOR_FLOOR)[:, :, None]
            color = np.clip(color, 0, 255)
            data = np.dstack([color.round().astype(np.uint8), (a * 255).round().astype(np.uint8)])
            Image.fromarray(data, "RGBA").save(OUT / name, optimize=True)
            print(f"  {name:<20} {data.shape[1]}×{data.shape[0]}  {(OUT / name).stat().st_size / 1024:>7.1f} KB")
            continue
        else:
            a = alpha_from_shade(rgb, box)
        write_alpha(a, name)


if __name__ == "__main__":
    main()
