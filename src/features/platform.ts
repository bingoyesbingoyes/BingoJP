/** 运行环境判定。这里只回答两个问题，别的一概不答：
 *
 *  1. **版式要不要用紧凑那一套**（`useCompact`）——按**宽度**判，不按平台判。
 *     桌面版自己不会窄到这条线以内（`tauri.conf.json` 的 `minWidth: 1120`），
 *     所以「< 1120」就等于「这是手机 / 平板竖屏」。这一条同时是 CSS 的判据，
 *     两边必须用同一个数（见 styles/compact.css 顶部）。
 *
 *  2. **这一版有没有朗读**（`readAloudAvailable`）——按**平台**判。
 *     Android 版暂不接朗读（随包的 VOICEVOX 是 Windows 的 run.exe，见
 *     src-tauri/src/voice.rs），所以朗读入口整块不渲染：一句点不动的句子
 *     比一枚按下去不出声的按钮诚实。
 *
 *  两件事为什么要分开：桌面版窗口被拖窄时版式要跟着收，但朗读仍然可用；
 *  手机上哪怕横过来（宽 > 1120）也还是没有朗读。合成一个判据就会出现
 *  「横屏的安卓突然冒出朗读按钮」这种假象。
 */

import { useEffect, useState } from "react";

/** 紧凑版式的宽度闸门。CSS 里每一处 `@media` 都用这个数，改这里也要改那边。 */
export const COMPACT_MAX = 1119;
const COMPACT_QUERY = `(max-width: ${COMPACT_MAX}px)`;

/** 当前视口是不是紧凑版式。窗口缩放时会跟着变（比 CSS 的媒体查询晚一帧）。 */
export function useCompact(): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia(COMPACT_QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY);
    const sync = () => setCompact(query.matches);
    // 首帧之后可能已经错过一次变化（比如方向键转屏），挂上监听先对齐一次
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return compact;
}

/** 这个壳里有没有朗读。桌面（Windows / macOS / Linux）有；Android 这一版没有。
 *
 *  判据是 UA 里的 `Android`：Tauri 的 Android WebView 一定带（系统 WebView 报的就是
 *  它的 UA），而桌面上的 WebView2 / WKWebView / 浏览器都不带。不去问 Tauri 的 OS 插件：
 *  为这一个布尔值引一个插件（前端 + Rust 两边都要注册）不划算，而且浏览器里直接看
 *  这一版时要按「桌面」走——那儿本来也没有引擎。
 */
export function readAloudAvailable(): boolean {
  return typeof navigator === "undefined" || !/Android/i.test(navigator.userAgent);
}
