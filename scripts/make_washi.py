"""生成和纸肌理贴图 · public/washi.png（可无缝平铺）

    python scripts/make_washi.py --write

为什么要一张贴图，而不是继续堆 CSS 渐变
------------------------------------------------
2.png 的纸卷与撕口上，肌理是**两层随机**叠出来的：

    · 低频云斑——纸浆厚薄不匀留下的深浅，尺度几十像素
    · 高频竖丝——簀目与纸纤维，尺度三五像素，而且**时断时续**

CSS 的 repeating-linear-gradient 只能画等距的线：一放大就成了一把梳子
（这一版之前就是这样，纸卷看着像塑料柱）。而低频+高频的随机叠加正是
贴图最擅长的事，所以这一步改用一张可平铺的灰度图。

图为什么是灰度、以白为底
------------------------------------------------
CSS 侧统一用 `mix-blend-mode: multiply` 叠在纸色上：
255＝干净，越暗纤维越重。multiply 与底色无关，所以三套和纸配色
（生成 / 桜 / 藍墨）共用这一张图，不必各出一版。

噪声用**频域**生成：`np.fft.ifft2` 出来的场天生是周期的，
四边拼起来严丝合缝，不必再做接缝处理。
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

# 512 出图、CSS 里按 256px 显示：降一半看，纤维边缘是柔的，不像像素点阵
SIZE = 512
DISPLAY = 256
SEED = 20260921


def periodic_noise(size: int, fx: float, fy: float, rng: np.random.Generator) -> np.ndarray:
    """频域噪声。fx / fy 是 x / y 方向的特征频率（1/像素）。

    各向异性的频率范围就是「拉丝」：fx 大 fy 小 → 竖着的丝。
    结果天然周期，可以无缝平铺。
    """
    freq = np.fft.fftfreq(size)
    grid_x, grid_y = np.meshgrid(freq, freq)
    amplitude = np.exp(-((grid_x / fx) ** 2 + (grid_y / fy) ** 2))
    phase = rng.uniform(0, 2 * np.pi, (size, size))
    field = np.real(np.fft.ifft2(amplitude * np.exp(1j * phase)))
    return (field - field.mean()) / (field.std() + 1e-9)


def build() -> np.ndarray:
    rng = np.random.default_rng(SEED)

    # 低频云斑：纸浆厚薄。两个尺度，免得一张图只有一个节奏。
    blotch_big = periodic_noise(SIZE, 0.009, 0.011, rng)
    blotch_small = periodic_noise(SIZE, 0.028, 0.032, rng)

    # 中频絮：一小片一小片的结块
    flake = periodic_noise(SIZE, 0.055, 0.06, rng)

    # 高频竖丝：x 方向每 ~2.4px 一根，y 方向 ~55px 才变一次 → 拉成竖条
    fibre = periodic_noise(SIZE, 0.42, 0.018, rng)

    # 丝要**时断时续**：拿一层低频遮罩把它切断，否则还是一片均匀的条纹
    fibre_gate = periodic_noise(SIZE, 0.02, 0.045, rng)
    fibre_gate = np.clip(0.72 + 0.6 * fibre_gate, 0, 1)

    # 极细的尘点，防止大面上出现「糊」的渐变带
    dust = periodic_noise(SIZE, 0.34, 0.34, rng)

    # 权重偏「丝」：云斑只负责让大面不平，主角是那一根根纤维。
    # 上一版云斑拿得太多，纸卷上就只剩一片一片的脏，看不出是纸。
    field = (
        0.26 * blotch_big
        + 0.15 * blotch_small
        + 0.14 * flake
        + 0.52 * fibre * fibre_gate
        + 0.05 * dust
    )
    field = (field - field.mean()) / (field.std() + 1e-9)

    # 压成「以白为底」的灰度。两个要求：
    #   · 均值要贴近 255——乘上去之后纸的**整体亮度不能掉**，否则整卷发灰；
    #   · 暗部只落在少数像素上（幂次 >1）——纤维是线，不是一片灰。
    # 所以映射刻意左偏：field=0（也就是大多数像素）只压下去 4/255。
    darkness = np.clip((field + 1.1) / 4.6, 0, 1) ** 1.8
    value = 255 - 72 * darkness
    return np.clip(value, 0, 255)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="真的写文件（默认只报统计）")
    args = parser.parse_args()

    value = build()
    print(f"尺寸      {SIZE}×{SIZE}（CSS 里按 {DISPLAY}px 显示）")
    print(f"灰度范围  {value.min():.0f} .. {value.max():.0f}   均值 {value.mean():.1f}")

    # 接缝检查：左右 / 上下两边的差，应当和「图内部任意相邻两列」一个量级
    for name, a, b in (
        ("左右接缝", value[:, -1], value[:, 0]),
        ("上下接缝", value[-1, :], value[0, :]),
        ("随机相邻", value[:, SIZE // 3], value[:, SIZE // 3 + 1]),
    ):
        print(f"{name}  平均差 {np.abs(a - b).mean():.2f}")

    if not args.write:
        print("\n（只做了统计。加 --write 才会写 public/washi.png）")
        return

    out = Path(__file__).resolve().parent.parent / "public" / "washi.png"
    Image.fromarray(value.astype(np.uint8), "L").save(out, optimize=True)
    print(f"\n已写入 {out}  ({out.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
