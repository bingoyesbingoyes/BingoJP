/** 最小 / 关闭两颗，放在卷面最右上缘（顶栏的最右端），2.png 的朱印风。
 *
 *  窗口是 `decorations: false`，这两颗由前端画。只有两颗——2.png 的右上角就是
 *  「−」与「×」并列，不摆最大化：这是一卷读物，不需要铺满屏幕。
 *
 *  形状不是正圆，而是**花边圆**（花辺印，见 Seal.tsx 的 SealRing）：
 *  2.png 里这两颗、右下角那四颗、目次里「当前课」那枚圆环，是同一族的印。
 *  平时空心朱圈落在纸上不抢视线，hover 才填满朱砂。
 *
 *  不在 Tauri 运行时里（例如浏览器直接开 vite preview）时静默忽略。
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { SealRing } from "./Seal";
import "./WindowControls.css";

export function WindowButtons() {
  return (
    <div className="windots">
      <button
        type="button"
        className="windots__dot"
        onClick={() => windowAction("minimize")}
        aria-label="最小化"
      >
        <span className="windots__ring" aria-hidden>
          <SealRing petals={16} amplitude={3.8} thickness={4.4} />
        </span>
        <MinimizeGlyph />
      </button>

      <button
        type="button"
        className="windots__dot windots__dot--close"
        onClick={() => windowAction("close")}
        aria-label="关闭"
      >
        <span className="windots__ring" aria-hidden>
          <SealRing petals={16} amplitude={3.8} thickness={5.2} />
        </span>
        <CloseGlyph />
      </button>
    </div>
  );
}

function windowAction(action: "minimize" | "close") {
  try {
    const win = getCurrentWindow();
    if (action === "minimize") void win.minimize();
    else void win.close();
  } catch {
    /* 不在 Tauri 里，什么也不做 */
  }
}

function CloseGlyph() {
  return (
    <svg className="windots__glyph" width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
      <path d="M1.2 1.2l5.6 5.6M6.8 1.2L1.2 6.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function MinimizeGlyph() {
  return (
    <svg className="windots__glyph" width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
      <path d="M1.1 4h5.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
