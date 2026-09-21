/** 顶部条 · 卷面的天头
 *
 *  2.png 的卷面最上方几乎是**空的**：左边什么都不摆（書名「読む」在目次页里，
 *  见 LessonRail），右端并列着两枚朱印——最小 / 关闭。
 *
 *  所以这一条只做两件事：给窗口留一条可拖的空白，和最右上角那两颗钮。
 *  课名不在这里：它已经回到课文版心里当标题了（ReaderView 的 .reader__title），
 *  而且**不注音、不翻译**。
 *
 *  音色也不在这里。需求 5：音色切换挪到卷面下方那块设置区
 *  （ScrollChrome 的 ToolShard），顶栏那条浅色下拉长条彻底去掉。 */

import { WindowButtons } from "./WindowControls";
import "./TopBar.css";

export function TopBar() {
  return (
    <header className="topbar" data-tauri-drag-region>
      <span className="topbar__grip" data-tauri-drag-region />
      <WindowButtons />
    </header>
  );
}
