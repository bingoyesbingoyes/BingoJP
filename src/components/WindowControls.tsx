/** 最小 / 最大化 / 关闭三颗，放在**窗口级**的位置（不是版心里的天头条）。

 *  设计稿上原本是两颗（圆 ⊖ 最小、方 ⊠ 关闭），在纸的右上角 x 1455..1502、y 72..89，
 *  也就是窗口的 (94.6% 右缘, 中心 y 8.08%)。这里按要求补成**三颗，功能对齐 mac**：
 *
 *     ⊖  最小化（minimize）      —— 稿上那一颗，形状不动
 *     ▢  最大化 / 还原            —— 新增。外框成笔的方＝摊满；双方＝回到窗口
 *     ⊠  关闭（close）           —— 稿上那一颗，形状不动
 *
 *  顺序按**右上角该有的次序**（Windows / 本例）：最小 → 最大 → 关闭。
 *  mac 的三颗在左上角、次序是 关/最小/缩放；这里只在**功能**上对齐
 *  （关闭窗口、最小化、最大化-还原），形状仍走稿子的毛笔朱印。

 *  这个位置**比版心的上边界还高**（版心让开撕口，从 9.4% 才开始），
 *  所以它不能待在 .app 里——那会逼着版心往下让，把课文的天地头吃掉。
 *  它是窗口的一部分，就挂在 .makimono 下面。见 App.tsx。

 *  形状照稿子：两枚留白成笔、起笔重收笔轻，收口处留一点没接上。所以这里不用
 *  <circle> / <rect>，用两段弧度略不同的弧拼一个「圈」，方框也一样是四笔。

 *  平时空心朱线，hover 才吃满朱砂、字翻成纸色。

 *  不在 Tauri 运行时里（例如浏览器直接开 vite preview）时静默忽略：
 *  连「最大化」那一枚的图形也不会翻成「还原」。
 */

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./WindowControls.css";

type WindowAction = "minimize" | "toggleMaximize" | "close";

export function WindowButtons() {
  /* 已经最大化了没有。拿不到（不在 Tauri 里）就一直是 false，图形不翻。 */
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    const read = () => {
      void getCurrentWindow()
        .isMaximized()
        .then((value) => {
          if (alive) setMaximized(value);
        })
        .catch(() => {});
    };
    try {
      read();
      void getCurrentWindow()
        .onResized(read)
        .then((fn) => {
          if (alive) unlisten = fn;
          else fn();
        })
        .catch(() => {});
    } catch {
      /* 不在 Tauri 里 */
    }
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  return (
    <div className="windots" data-tauri-drag-region="false">
      <button
        type="button"
        className="windots__dot"
        onClick={() => windowAction("minimize")}
        aria-label="最小化"
      >
        <svg className="windots__glyph" viewBox="0 0 20 20" fill="none" aria-hidden>
          {/* 圈：两段弧，接口留 1px 的缺口，像一笔没完全收拢的墨圈 */}
          <path
            d="M9.6 2.4a7.6 7.6 0 1 1-.9 15.2"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <path
            d="M8.7 17.6a7.6 7.6 0 0 1-6-9.9"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          {/* 中间那一横：比圈重，起笔略粗 */}
          <path d="M5.6 10h8.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      </button>

      <button
        type="button"
        className="windots__dot windots__dot--zoom"
        data-maximized={maximized || undefined}
        onClick={() => windowAction("toggleMaximize")}
        aria-label={maximized ? "还原窗口" : "最大化"}
      >
        <svg className="windots__glyph" viewBox="0 0 20 20" fill="none" aria-hidden>
          {maximized ? (
            /* 还原：前后错开的两个方——「回到窗口」 */
            <>
              <path
                d="M7.6 3.4h9v9"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3.4 7.6h9v9h-9z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </>
          ) : (
            /* 最大化：一只成笔的方——「摊满窗口」 */
            <path
              d="M3.5 3.4h13v13.2h-13z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </button>

      <button
        type="button"
        className="windots__dot windots__dot--close"
        onClick={() => windowAction("close")}
        aria-label="关闭"
      >
        <svg className="windots__glyph" viewBox="0 0 20 20" fill="none" aria-hidden>
          {/* 方框：四条边各自成笔，转角处略微出头，是手画的方 */}
          <path
            d="M4.2 3.3h11.6v13.4H4.2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M4.2 3.3h8.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          {/* 叉 */}
          <path
            d="M6.3 6.4l7.4 7.2M13.7 6.4l-7.4 7.2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

function windowAction(action: WindowAction) {
  try {
    const win = getCurrentWindow();
    if (action === "minimize") void win.minimize();
    else if (action === "toggleMaximize") void win.toggleMaximize();
    else void win.close();
  } catch {
    /* 不在 Tauri 里，什么也不做 */
  }
}
