/** 设计稿「设计元素」那一栏里的几枚记号，做成可以复用的几何体。
 *
 *  · `Blossom`  梅花纹。稿子上凡是「当前 / 选中 / 标题」的位置都压着这一朵：
 *                节名的分隔线上、选中那一行的左端、単元選択那一排的开头、
 *                単語 的笔扫左下角，以及**窗口外缘那两枚页签的册面上**
 *                （页签上那朵是同一个形状，只是淡一档）。
 *                五瓣、花瓣有凹口、中间一圈花心。
 *  · `SealRing` 花边圆（花辺印）。朱印圆钮那一圈细密的花瓣口，用来画纸片上的圆钮。
 *
 *  全部只吃 `currentColor`：颜色由「状态」决定，形状不由状态决定。
 *
 *  为什么用 SVG 而不是从稿子上抠图：这几枚在稿子上只有 20~30px，抠出来一放大就糊，
 *  而且没法换色（朱红 / 纸色 / 淡墨三档都要用同一枚形状）。它们是几何形，
 *  重画一遍比搬像素更清楚。真正手作的那几样（読む 的毛笔字、朱印、笔扫、撕纸带、
 *  水墨插画、和纸肌）才走 scripts/trace_design.py 抠图那条路。
 */

interface BlossomProps {
  size?: number;
  /** 实心：整朵吃满 currentColor（选中行左端那一朵）。 */
  filled?: boolean;
}

/** 五瓣梅。
 *
 *  花瓣的形状用「两条对称的弧」拼：从花心出发，先向外鼓（c 曲线），
 *  到瓣尖**收一个凹口**（梅花与樱花的分界就在这个凹口），再鼓回来。
 *  半径取 0.30 / 0.46：内圈是花瓣的根，外圈是瓣尖。 */
function blossomPath(): string {
  const cx = 50;
  const cy = 50;
  const inner = 18; // 花瓣根
  const outer = 45; // 瓣尖
  const notch = 30; // 凹口
  const step = (Math.PI * 2) / 5;
  const start = -Math.PI / 2;
  const at = (radius: number, angle: number) => ({
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  });
  const round = (v: number) => v.toFixed(2);

  const parts: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const a = start + i * step;
    const half = step / 2;
    const root = at(inner, a);
    const tipL = at(outer, a - half * 0.62);
    const tipR = at(outer, a + half * 0.62);
    const dip = at(notch, a);
    // 瓣的左半：根 → 瓣尖（外鼓）
    const c1 = at(outer + 12, a - half * 1.15);
    const c2 = at(outer + 4, a - half * 0.95);
    // 凹口 → 右半的瓣尖
    const c3 = at(outer + 2, a + half * 0.98);
    const c4 = at(outer + 10, a + half * 1.2);

    if (i === 0) parts.push(`M${round(root.x)} ${round(root.y)}`);
    parts.push(
      `C${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(tipL.x)} ${round(tipL.y)}`,
      `Q${round(dip.x)} ${round(dip.y)} ${round(tipR.x)} ${round(tipR.y)}`,
      `C${round(c3.x)} ${round(c3.y)} ${round(c4.x)} ${round(c4.y)} ${round(
        at(inner, a + step).x,
      )} ${round(at(inner, a + step).y)}`,
    );
  }
  parts.push("Z");
  return parts.join(" ");
}

export function Blossom({ size = 16, filled = false }: BlossomProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden focusable="false">
      <path
        d={blossomPath()}
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 7}
        strokeLinejoin="round"
      />
      <circle
        cx="50"
        cy="50"
        r="7"
        fill={filled ? "var(--seal-ink)" : "none"}
        stroke={filled ? "none" : "currentColor"}
        strokeWidth={filled ? 0 : 5}
      />
    </svg>
  );
}

/** 花边圆（花辺印）的路径与参数。半径 43/50，留出线宽与外圈的空隙。
 *  花瓣 16 个（稿子上约 14–16，太密就成了齿轮）；线宽 3.4——100 的框缩到 34px 时约 1.16px。 */
const SEAL_PETALS = 16;
const SEAL_AMPLITUDE = 3.6;
const SEAL_THICKNESS = 3.4;

function sealPath(): string {
  const outer = 43;
  const step = (Math.PI * 2) / SEAL_PETALS;
  const start = -Math.PI / 2;
  const at = (radius: number, angle: number) =>
    `${(50 + Math.cos(angle) * radius).toFixed(2)} ${(50 + Math.sin(angle) * radius).toFixed(2)}`;

  const parts = [`M${at(outer, start)}`];
  for (let i = 0; i < SEAL_PETALS; i += 1) {
    const from = start + i * step;
    // 控制点放到更外侧：二次贝塞尔的顶点落在半径的 1/2 处，
    // 所以控制点半径要乘 2.1，花瓣才鼓得起来。
    parts.push(`Q${at(outer + SEAL_AMPLITUDE * 2.1, from + step / 2)} ${at(outer, from + step)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

export function SealRing() {
  return (
    <svg className="seal-ring" viewBox="0 0 100 100" fill="none" aria-hidden focusable="false">
      <path d={sealPath()} stroke="currentColor" strokeWidth={SEAL_THICKNESS} strokeLinejoin="round" />
    </svg>
  );
}
