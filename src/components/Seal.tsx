/** 2.png 里反复出现的那两枚小记号，做成可以复用的几何体。
 *
 *  · `SealRing`  朱印圆钮的**花边圈**。2.png 的圆钮不是正圆——边上是细密的花瓣口
 *    （花辺印）。用一条二次贝塞尔的花瓣路径画出来，比贴图清晰，也比正圆更像印章。
 *  · `Ornament`  界栏横线中央那枚四瓣花（❖）。
 *
 *  两者都只吃 `currentColor`：颜色由「状态」决定，形状不由状态决定。
 */

interface SealRingProps {
  /** 花瓣数。2.png 大约 14–16 个，太密就成了齿轮。 */
  petals?: number;
  /** 花瓣高度（viewBox 单位）。 */
  amplitude?: number;
  /** 线宽（viewBox 单位）。100 的框缩到 34px 时，3.4 ≈ 1.16px。 */
  thickness?: number;
  /** 实心印：整枚填满 currentColor。目次里「当前课」那枚圆环用它。 */
  filled?: boolean;
}

/** 花边圆的路径。半径 43/50，留出线宽与外圈的空隙。 */
function sealPath(petals: number, amplitude: number): string {
  const outer = 43;
  const step = (Math.PI * 2) / petals;
  const start = -Math.PI / 2;
  const at = (radius: number, angle: number) =>
    `${(50 + Math.cos(angle) * radius).toFixed(2)} ${(50 + Math.sin(angle) * radius).toFixed(2)}`;

  const parts = [`M${at(outer, start)}`];
  for (let i = 0; i < petals; i += 1) {
    const from = start + i * step;
    // 控制点放到更外侧：二次贝塞尔的顶点落在半径的 1/2 处，
    // 所以控制点半径要乘 2.1，花瓣才鼓得起来。
    parts.push(`Q${at(outer + amplitude * 2.1, from + step / 2)} ${at(outer, from + step)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

export function SealRing({
  petals = 16,
  amplitude = 3.6,
  thickness = 3.4,
  filled = false,
}: SealRingProps) {
  return (
    <svg className="seal-ring" viewBox="0 0 100 100" fill="none" aria-hidden focusable="false">
      <path
        d={sealPath(petals, amplitude)}
        fill={filled ? "currentColor" : "none"}
        stroke={filled ? "none" : "currentColor"}
        strokeWidth={thickness}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 界栏中央的四瓣花。凹边 + 中心一个小孔，远看就是一枚 ❖。 */
export function Ornament({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M8 0.9c1.55 2.2 4.9 5.35 7.1 6.9-2.2 1.55-5.55 4.7-7.1 6.9-1.55-2.2-4.9-5.35-7.1-6.9C3.1 6.25 6.45 3.1 8 0.9Zm0 5.15a1.85 1.85 0 1 0 0 3.7 1.85 1.85 0 0 0 0-3.7Z"
      />
    </svg>
  );
}
