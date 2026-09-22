/** 卷面外缘那两枚**短冊页签**。设计稿的「滑入滑出区域」画的正是它：
 *
 *        ╱▔▔╲        一张短冊（书签）：**外缘是一条直线**（整个身高），
 *       │ ✿ │       内缘短一截，收成一道缓坡——稿上就是一只「旗」的形状。
 *       │ ‹ │       册面上压着两枚记号：**描边朱梅** + **深墨箭头**。
 *        ╲ ╱
 *         ▔▔         箭头指的方向＝按下之后纸会往哪边走。
 *
 *  形制按稿子上**真实的那两枚页签**量（不是图例那一格：图例画的是空册面 +
 *  外侧 ‹ ›）。1579×996 的稿上：册面 x 41..61、y 350..457，中心 y 403.5
 *  → 窗口高的 40.5%；左页签外缘 41/1579＝2.597%、右页签外缘 (1579−1536)/1579。
 *  尺寸与位置令牌都在 tokens.css，轮廓与记号的位置在 EdgeTab.css。
 *
 *  四条纪律：
 *
 *  1. **常驻**。面板开着它也在（让在纸卷/纸边外面，不挡正文），
 *     关着它还在原处——位置一个像素都不动。于是「纸滑走了」这件事永远有抓手，
 *     不需要在面板里再摆一枚「收起」。
 *
 *  2. **箭头跟着状态翻向**：纸摊开时箭头朝**窗外**（按下去＝推回去），
 *     纸收起时箭头朝**窗内**（按下去＝拉回来）。方向永远等于「按下之后会发生什么」。
 *
 *  3. **可以拉**。按住页签左右拖，纸跟着手指 1:1 走（不是等拖完再播一段动画）；
 *     松手时把手速接过去，按惯性投影决定「归位还是抽出来」。
 *     拖完把内联样式清掉，交回 CSS 过渡——于是中途打断既不跳也不回弹。
 *
 *  4. 册面窄（19×98），所以**命中区另算**：按钮本身比册面宽一圈、高一圈，
 *     免得这么窄一条要瞄着点。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Blossom } from "./Seal";
import "./EdgeTab.css";

type Side = "rail" | "vocab";

interface EdgeTabProps {
  /** rail＝左（目次页）；vocab＝右（生词页）。决定贴哪条边、往哪边滑。 */
  side: Side;
  open: boolean;
  onToggle: () => void;
  /** 无障碍名称。视觉上只有一朵花加一枚箭头，名字走 aria-label。 */
  label: string;
}

/** 面板根元素的钩子。两个面板各给自己的根打一个 data-panel，页签按它去找。 */
const PANEL_ATTR: Record<Side, string> = {
  rail: "rail",
  vocab: "vocab",
};

/** 拖多少像素才算「拖」而不是「点」。太小会把手指的抖动认成拖动；
 *  太大又会让「想轻轻拉一下」变成一次误触。4px 是拇指在鼠标上不动的自然抖动。 */
const DRAG_SLOP = 4;

/** 惯性投影。Apple 的那条指数衰减式，不是 v²/(2a)：
 *  松手之后还会滑多远。decelerationRate 0.998 是常规滚动的感觉。 */
function project(velocity: number, rate = 0.998): number {
  return (velocity / 1000) * (rate / (1 - rate));
}

/** 面板完全摊开时有多宽。收起时量不到（宽度是 0），所以读令牌。 */
function panelWidth(side: Side): number {
  const name = side === "rail" ? "--rail-w" : "--coach-w";
  const root = getComputedStyle(document.documentElement);
  const raw = root.getPropertyValue(name).trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) return 260;
  return raw.endsWith("rem") ? value * Number.parseFloat(root.fontSize) : value;
}

interface PullState {
  active: boolean;
  startX: number;
  /** 按下那一刻的进度：摊开＝1，收起＝0。 */
  from: number;
  width: number;
  moved: number;
  samples: [number, number][];
  panel: HTMLElement | null;
  inner: HTMLElement | null;
}

export function EdgeTab({ side, open, onToggle, label }: EdgeTabProps) {
  const [dragging, setDragging] = useState(false);
  /* 一次指针交互里攒下的位移与手速。用 ref 不用 state：每帧都写 state 会白渲染。 */
  const pull = useRef<PullState>({
    active: false,
    startX: 0,
    from: 0,
    width: 0,
    moved: 0,
    samples: [],
    panel: null,
    inner: null,
  });
  /* 刚拖完的那一下，浏览器还会补一个 click。它不能再触发一次开合，
     否则「拖开」会立刻又被「点」合上。键盘的 click 前面没有 pointerup，不受影响。 */
  const swallowClick = useRef(false);

  /** 左右两侧的「正方向」不一样：左栏向右拖是拉出来，右栏向左拖是拉出来。 */
  const sign = side === "rail" ? 1 : -1;

  /** 拉的时候直接写内联样式——过渡必须先关掉，否则纸会追着手指跑，
   *  手感就成了「拖一根有延迟的橡皮筋」。 */
  const paint = useCallback(
    (progress: number) => {
      const state = pull.current;
      if (!state.panel) return;
      state.panel.style.width = `${state.width * progress}px`;
      if (state.inner) {
        state.inner.style.transform = `translateX(${
          sign > 0 ? -(1 - progress) * 100 : (1 - progress) * 100
        }%)`;
      }
    },
    [sign],
  );

  /** 撒手：把内联样式全撤掉，让 data-open 与 CSS 过渡接手。
   *  同一帧里撤样式 + 切状态，过渡就从**此刻屏幕上那个宽度**出发——
   *  所以拖到一半松手不会跳，中途再抓也不会回弹。 */
  const release = useCallback(() => {
    const state = pull.current;
    if (state.panel) {
      state.panel.style.transition = "";
      state.panel.style.width = "";
    }
    if (state.inner) {
      state.inner.style.transition = "";
      state.inner.style.transform = "";
    }
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);

      const panel = document.querySelector<HTMLElement>(`[data-panel="${PANEL_ATTR[side]}"]`);
      const inner = (panel?.firstElementChild as HTMLElement | null) ?? null;
      pull.current = {
        active: true,
        startX: event.clientX,
        from: open ? 1 : 0,
        width: panelWidth(side),
        moved: 0,
        samples: [[event.clientX, event.timeStamp]],
        panel,
        inner,
      };
      swallowClick.current = false;
      setDragging(true);
    },
    [open, side],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = pull.current;
      if (!state.active) return;
      const dx = (event.clientX - state.startX) * sign;
      state.moved = Math.max(state.moved, Math.abs(dx));
      state.samples.push([event.clientX, event.timeStamp]);
      if (state.samples.length > 8) state.samples.shift();
      if (state.moved < DRAG_SLOP) return; // 还没过阈值：先不接线，免得按一下就抖

      // 第一次真的开始拉：把过渡关掉，纸从此跟手
      if (state.panel && state.panel.style.transition !== "none") {
        state.panel.style.transition = "none";
        if (state.inner) state.inner.style.transition = "none";
      }

      // 拖出边界时**渐进阻尼**，不是硬停：拉到底还有一点点余味
      const raw = state.from + dx / state.width;
      const slack = raw < 0 ? raw * 0.25 : raw > 1 ? 1 + (raw - 1) * 0.25 : raw;
      paint(Math.min(Math.max(slack, -0.06), 1.06));
    },
    [paint, sign],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = pull.current;
      if (!state.active) return;
      state.active = false;
      setDragging(false);

      // 几乎没动＝这一下是「点」。开合交给 onClick（键盘也走那一条路），
      // 这里不自己切——否则鼠标会切两次（pointerup 一次、随后的 click 一次）。
      if (state.moved < DRAG_SLOP) return;

      swallowClick.current = true;

      // 手速（px/s，取最近几个采样点）。松手时的速度要接到动画上，
      // 否则拖与滑之间会有一道看不见的接缝。
      const [fx, ft] = state.samples[0];
      const [lx, lt] = state.samples[state.samples.length - 1];
      const dt = Math.max(lt - ft, 1);
      const velocity = ((lx - fx) / dt) * 1000 * sign;

      const here = state.from + ((event.clientX - state.startX) * sign) / state.width;
      // 落点不是「现在在哪」，而是「照这个速度滑下去会停在哪」
      const projected = here + project(velocity) / state.width;

      release();
      if ((projected >= 0.5) !== open) onToggle();
    },
    [onToggle, open, release, sign],
  );

  const onClick = useCallback(() => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    onToggle();
  }, [onToggle]);

  /* 拖到一半指针被系统收走（失焦、窗口切走）时别把纸卡在半路上 */
  useEffect(() => {
    if (!dragging) return;
    const stop = () => {
      if (!pull.current.active) return;
      pull.current.active = false;
      setDragging(false);
      release();
    };
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
    };
  }, [dragging, release]);

  return (
    <button
      type="button"
      className={`edge-tab edge-tab--${side}`}
      data-open={open || undefined}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
      aria-expanded={open}
      aria-label={label}
      /* 整卷是 deep 可拖区，页签得自己退出来，否则按住它就变成拖窗口 */
      data-tauri-drag-region="false"
    >
      {/* 短冊：外缘一条直线、内缘收成缓坡的那张书签。轮廓交给 CSS 的 clip-path，
          这一层只负责装东西——折痕、朱梅、箭头。 */}
      <span className="edge-tab__slip" aria-hidden>
        <span className="edge-tab__crease" />
        <span className="edge-tab__mark">
          {/* 稿上真实页签的上半压着一朵**描边朱梅**（和目次页选中行左端、
              节头那里是同一枚花，只是淡一档）。位置见 EdgeTab.css 的 35.4%。 */}
          <Blossom size={13} />
        </span>
        <span className="edge-tab__arrow">
          {/* 纸摊开时箭头朝外（按下去＝推回去）；收起时朝内（按下去＝拉回来） */}
          <Chevron dir={chevronDir(side, open)} />
        </span>
      </span>
    </button>
  );
}

function chevronDir(side: Side, open: boolean): "left" | "right" {
  if (side === "rail") return open ? "left" : "right";
  return open ? "right" : "left";
}

/** 册面下半那枚深墨箭头。尺寸按稿子量：11×16（窗口 px），
 *  笔画 2px 上下——所以画在 13×16 的框里。
 *  颜色由 CSS 给（--ink，悬停转朱）。 */
function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="13" height="16" viewBox="0 0 13 16" fill="none" aria-hidden>
      <path
        d={dir === "left" ? "M10.6 1.7L3.4 8l7.2 6.3" : "M2.4 1.7L9.6 8l-7.2 6.3"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
