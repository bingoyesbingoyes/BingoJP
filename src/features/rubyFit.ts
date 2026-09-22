/** 注音比汉字宽时，别让它把左右两个字挤开。
 *
 *  浏览器给 `<ruby>` 的宽度是 `max(汉字, 注音)`，汉字居中摆——注音比汉字宽多少，
 *  多出来的那一半就垫在汉字的左右两侧。`JC企画` 的注音是「じぇーシー」，比 `JC`
 *  本身宽 0.5em，于是 JC 与 企画 之间凭空多了一道空。全书 1160 个注音里有 159 个
 *  是这样（`350`→さんびゃくごじゅう、`JR`→ジェーアール、`私`→わたくし…）。
 *  用户报的「有些日语字之间距离太大」，主犯就是它。
 *
 *  为什么不能交给 CSS：
 *    · `ruby-align` 只决定**汉字在盒子里怎么摆**，盒子本身永远是 `max(汉字, 注音)`；
 *    · `rt { position: absolute }` 倒能让盒子缩回汉字宽，但注音一离流就**不参与行高**，
 *      整段的行距会跟着变——版面是按「1.28 + rt」定的（见 ReaderView.css）。
 *  所以只能量一次、写两个内联样式：
 *
 *    1. **缩注音**：缩到「汉字宽 + 2×--ruby-slack」放得下为止，下限 `--ruby-floor`
 *       （见 tokens.css。`じぇーシー` 正好缩到 0.30em，落在汉字两侧各 0.2em 内）。
 *    2. **挂出去**：缩完还多出来的，用负 margin 把 ruby 盒缩回汉字的宽度，注音就
 *       **挂**在两侧——日文排版里本来就这么干（掛かりルビ）。挂出的量封顶在
 *       `--ruby-slack`，宁可留一点空档，也不去压邻居的注音。
 *
 *  量的是**字体盒**不是墨迹：canvas 按同一套 `font` 串重算一遍。汉字与假名是等宽字，
 *  字框≈字面，够用；误差由 `--ruby-slack` 兜着。
 *
 *  **两条不能违反的纪律**（都是踩过的坑）：
 *
 *  1. **基准字号要单独记，不能现读。** 我们改的就是 rt 的字号——下一次再读它的
 *     计算值，读到的是自己写下去的那一档，于是算出「已经够窄了，不用收」，
 *     把内联字号清掉；再下一轮又收回去。两帧之间来回跳，截到哪一帧全看运气。
 *     口径定死：基准比例只在元素第一次被收时读一次（读之前先把内联字号摘掉）。
 *  2. **收过的元素按指纹跳过。** 指纹里**不含 rt 的字号**（那正是我们改的东西），
 *     只含「汉字 + 注音 + 汉字字体」。同一句重渲染多少次都不再量。
 *     换课、换字号会换指纹；字体晚到则由 `useRubyFit` 显式推翻重来。
 *
 *  这条修改必须发生在**首帧之前**（`useLayoutEffect`），否则会看到注音先撑开、
 *  下一帧再收回去的跳一下。
 */

import { useEffect, useLayoutEffect } from "react";

/** 一个注音片段量出来的结论。 */
interface Fit {
  /** 注音该用的字号（em，相对汉字）。null = 不用缩，交回 CSS 的 --rt-scale。 */
  size: number | null;
  /** 每侧要挂出去多少 px。0 = 不用挂。 */
  hang: number;
}

/** 注音比汉字宽不到这个数（px）就当它一样宽——省掉一堆没有意义的计算。 */
const SAME = 0.5;
/** 挂出去不到这个数（px）就别挂：写一个 0.05px 的负 margin 只会让 Chrome 多发一次布局。 */
const NEGLIGIBLE = 0.05;
/** 兜底比例：`--rt-scale`。只在量不到基准时用得上。 */
const FALLBACK_SCALE = 0.46;

/** 量过的就不再量。键把字宽真正依赖的东西全带上：两串文本 + 两套字体 + 两条闸门。 */
let measured = new Map<string, Fit>();
/** 每个 rt「CSS 给的那一档」比例（注音字号 ÷ 汉字字号）。见文件头纪律 1。 */
let baselines = new WeakMap<Element, number>();
/** 每个 rt 上一次是按什么指纹收的。见文件头纪律 2。 */
let fitted = new WeakMap<Element, string>();

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

/** canvas 只建一次。每条注音都要量两回，别在循环里创建元素。 */
function context(): CanvasRenderingContext2D | null {
  if (ctx) return ctx;
  canvas = document.createElement("canvas");
  ctx = canvas.getContext("2d");
  return ctx;
}

/** 一套计算样式 → canvas 的 `font` 串。`size` 给了就顶掉样式里的字号（按基准量注音）。 */
function fontOf(style: CSSStyleDeclaration, size?: number): string {
  const fontSize = size === undefined ? style.fontSize : `${size.toFixed(3)}px`;
  return `${style.fontStyle} ${style.fontWeight} ${fontSize} ${style.fontFamily}`;
}

/** 一段文本在给定字体下的推进宽度。`spacing` 是字距（px）。 */
function textWidth(text: string, font: string, spacing: number): number {
  const target = context();
  if (!target) return 0;
  target.font = font;
  // canvas 的 letterSpacing 是后加的（Chrome 99+）。每个字后面都算一份、**含末字**，
  // 与行内的推进宽度一致。没有这个属性就在结果上补一份。
  const spannable = target as CanvasRenderingContext2D & { letterSpacing?: string };
  if (typeof spannable.letterSpacing === "string") {
    spannable.letterSpacing = `${spacing}px`;
    return target.measureText(text).width;
  }
  return target.measureText(text).width + spacing * text.length;
}

/** 读一条无单位的设计令牌（`--ruby-slack` / `--ruby-floor`）。读不到就用兜底值。 */
function token(style: CSSStyleDeclaration, name: string, fallback: number): number {
  const raw = Number.parseFloat(style.getPropertyValue(name));
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/** rt 在 CSS 下的基准比例。**只在第一次读**，读之前先摘掉我们自己写进去的内联字号。 */
function baselineScale(rt: HTMLElement, em: number): number {
  const known = baselines.get(rt);
  if (known !== undefined) return known;

  const inline = rt.style.fontSize;
  if (inline) rt.style.fontSize = "";
  const size = Number.parseFloat(getComputedStyle(rt).fontSize);
  if (inline) rt.style.fontSize = inline;

  const scale = em > 0 && Number.isFinite(size) ? size / em : FALLBACK_SCALE;
  baselines.set(rt, scale);
  return scale;
}

/** 量一条：汉字自然宽、注音在**基准**字号下的自然宽，据此定「缩到多少 / 挂多少」。 */
function computeFit(
  key: string,
  baseStyle: CSSStyleDeclaration,
  rtStyle: CSSStyleDeclaration,
  baseText: string,
  rtText: string,
  em: number,
  scale: number,
  slackRate: number,
  floorRate: number,
): Fit {
  const baseSpacing = Number.parseFloat(baseStyle.letterSpacing);
  const baseW = textWidth(
    baseText,
    fontOf(baseStyle),
    Number.isFinite(baseSpacing) ? baseSpacing : 0,
  );

  // 注音按**基准**字号量（不是它此刻的字号），字距也跟着一起缩
  const rtSize = Number.parseFloat(rtStyle.fontSize);
  const rtSpacing = Number.parseFloat(rtStyle.letterSpacing);
  const rtRate = rtSize > 0 && Number.isFinite(rtSpacing) ? rtSpacing / rtSize : 0.04;
  const rtW = textWidth(rtText, fontOf(rtStyle, em * scale), rtRate * em * scale);

  let fit: Fit = { size: null, hang: 0 };
  if (em > 0 && Number.isFinite(scale) && rtW > baseW + SAME) {
    const slack = slackRate * em;
    let next = scale;
    if (rtW > baseW + 2 * slack) {
      next = Math.max(floorRate, (scale * (baseW + 2 * slack)) / rtW);
    }
    const shrunk = (rtW * next) / scale;
    const over = Math.max(0, (shrunk - baseW) / 2);
    fit = {
      size: next < scale - 1e-4 ? next : null,
      hang: Math.min(over, slack),
    };
  }
  measured.set(key, fit);
  return fit;
}

function apply(ruby: HTMLElement, rt: HTMLElement, fit: Fit): void {
  const size = fit.size === null ? "" : `${fit.size.toFixed(3)}em`;
  if (rt.style.fontSize !== size) rt.style.fontSize = size;
  const margin = fit.hang > NEGLIGIBLE ? `-${fit.hang.toFixed(2)}px` : "";
  if (ruby.style.marginInline !== margin) ruby.style.marginInline = margin;
}

/** 把一棵子树里的 `<ruby>` 全收一遍。
 *
 *  `fresh` 为真时把两条缓存全部推翻重来——字体晚一步到（明朝体 fallback → 真字体）时
 *  字宽会变，但字体串没变、指纹认不出来，只能显式重算。 */
function fitRuby(root: ParentNode, fresh = false): void {
  if (fresh) {
    measured = new Map();
    baselines = new WeakMap();
    fitted = new WeakMap();
  }

  // `getComputedStyle` 只认 Element，传 document 进去会直接抛——令牌得从 <html> 上读
  const scope = root instanceof Element ? root : document.documentElement;
  if (!scope) return;
  const tokens = getComputedStyle(scope);
  const slack = token(tokens, "--ruby-slack", 0.2);
  const floor = token(tokens, "--ruby-floor", 0.3);

  for (const node of root.querySelectorAll("ruby")) {
    const ruby = node as HTMLElement;
    const base = ruby.firstChild;
    if (!base || base.nodeType !== Node.TEXT_NODE) continue;
    const rt = ruby.querySelector("rt") as HTMLElement | null;
    if (!rt) continue;

    const baseStyle = getComputedStyle(ruby);
    // 指纹**不含 rt 的字号**：那正是我们要写的东西，写进去再拿来当指纹就永远认不出来
    const fingerprint = `${(base as Text).data}\u0000${rt.textContent}\u0000${fontOf(baseStyle)}`;
    if (fitted.get(rt) === fingerprint) continue;

    const em = Number.parseFloat(baseStyle.fontSize);
    const scale = baselineScale(rt, em);
    const key = [fingerprint, scale, slack, floor].join("\u0000");
    const fit =
      measured.get(key) ??
      computeFit(
        key,
        baseStyle,
        getComputedStyle(rt),
        (base as Text).data,
        rt.textContent ?? "",
        em,
        scale,
        slack,
        floor,
      );

    apply(ruby, rt, fit);
    fitted.set(rt, fingerprint);
  }
}

/** 全页收一遍。挂一次就够——注音宽度只跟「文本 + 字体 + 令牌」有关，与开关无关。 */
export function useRubyFit(): void {
  // 首帧之前：晚了会看到注音先撑开、再收回去
  useLayoutEffect(() => {
    fitRuby(document);
  });

  // 字体晚一步到（明朝体 fallback → 真字体）时字宽会变，到齐之后推翻重算一遍
  useEffect(() => {
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) fitRuby(document, true);
    });
    return () => {
      alive = false;
    };
  }, []);
}
