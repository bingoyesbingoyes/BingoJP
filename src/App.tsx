import { useCallback, useEffect, useMemo, useState } from "react";
// 全局样式放最前：组件 CSS 在它们之后加载，同权重的规则才能盖过 base.css 里的工具类。
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/paper.css";
import "./styles/App.css";
import { lessonById, lessonsByUnit, vocabById } from "./features/data";
import { usePrefs } from "./features/prefs";
import { useTts } from "./features/voice/useTts";
import { LessonRail } from "./components/LessonRail";
import { TopBar } from "./components/TopBar";
import { ReaderView } from "./components/ReaderView";
import { VocabPanel } from "./components/VocabPanel";
import { EdgeTab, ToolShard, UnitStepper } from "./components/ScrollChrome";

export default function App() {
  const [currentId, setCurrentId] = useState(1);
  const { prefs, update } = usePrefs();

  const tts = useTts({ voiceId: prefs.voiceId });
  const lesson = lessonById(currentId);
  const vocab = vocabById(currentId);

  const units = useMemo(() => lessonsByUnit(), []);
  const unitAt = units.findIndex((group) => group.lessons.some((item) => item.id === currentId));

  // 配色是固定的：一套，取自 2.png，写在 tokens.css 里。
  // 没有 data-style、没有切换、也没有要接进存档的状态。

  // 换课就别让上一课的声音继续响。缓存留着——切回来重播是秒开的。
  const stop = tts.stop;
  useEffect(() => {
    stop();
  }, [currentId, stop]);

  const selectLesson = useCallback((id: number) => setCurrentId(id), []);
  const toggleRail = useCallback(() => update({ railOpen: !prefs.railOpen }), [prefs.railOpen, update]);

  /** 单元步进：保住「单元里的第几课」，换单元比换课更像翻卷——位置不该跳。 */
  const stepUnit = useCallback(
    (delta: number) => {
      const to = unitAt + delta;
      if (unitAt < 0 || to < 0 || to >= units.length) return;
      const offset = units[unitAt].lessons.findIndex((item) => item.id === currentId);
      const target = units[to].lessons;
      setCurrentId(target[Math.min(Math.max(offset, 0), target.length - 1)].id);
    },
    [currentId, unitAt, units],
  );

  return (
    /* .makimono＝异形窗的整卷。从外到内四层：
       纸卷 → 卷面（撕裂纸边，轮廓由 edge-sheet.png 的 mask 给出） →
       版心 `.app` → 三枚纸片。卷面之外的像素全透明，桌面从缺口里透进来。

       data-tauri-drag-region="deep"：**整棵子树都能拖窗口**。
       Tauri 2.11 的 drag.js 是这么走的：从事件目标往上找这个属性，
       中途撞到 BUTTON / A / INPUT / SELECT / TEXTAREA / LABEL / SUMMARY
       或 role 是 button/link/option… 的元素就**停下并判定为不可拖**。
       所以这一条属性既让「非按钮的地方」都能拖动窗口，又不会把按钮吃掉。
       （代价：正文区按住拖动会拖窗口，不能框选文字——若要框选，
       给 .reader__inner 单独打 data-tauri-drag-region="false" 即可。） */
    <div className="makimono" data-tauri-drag-region="deep">
      {/* 投影：一层**静态剪影**（与纸同形、被纸整个盖住），两道 drop-shadow 挂在它身上。
          纸自己在滑动时纹丝不动，所以这层影子只算一次；挂在 .makimono 上会每帧
          重算整窗——「点展开按钮会抖」有一大半是它。见 App.css 的说明。 */}
      <i className="makimono__shadow" aria-hidden>
        <i className="makimono__shadow-sheet" />
        <i className="makimono__shadow-roller" />
        <i className="makimono__shadow-unit" />
        <i className="makimono__shadow-tools" />
      </i>

      {/* 左端那一卷纸：卷口与卷尾都是纸（2.png 没有木芯），所以一块元素就够。
          这一块是**从 2.png 上整块抠下来的贴图**（public/roller.png，见
          scripts/trace_roller.py）——锥度、肌理、卷口、卷尾全部照图，不是 CSS 描的。 */}
      <i className="makimono__roller" aria-hidden />

      <div className="makimono__sheet">
        {/* 撕裂口三层：断口旧纸 → 纤维 → 纸面。手撕的痕就在这一圈里 */}
        <i className="makimono__rim" aria-hidden />
        <i className="makimono__fibre" aria-hidden />
        <i className="makimono__face paper-bg" aria-hidden />

        <div className="app">
          <TopBar />

          {/* data-rail / data-vocab＝「这一页现在摊开着」。中缝是对折出来的：
              两页合着时，课文那一栏边上不该有半道来历不明的影。见 App.css。 */}
          <div
            className="app__body"
            data-rail={prefs.railOpen || undefined}
            data-vocab={prefs.vocabOpen || undefined}
          >
            <LessonRail
              currentId={currentId}
              onSelect={selectLesson}
              open={prefs.railOpen}
              onToggle={toggleRail}
            />

            <ReaderView lesson={lesson} prefs={prefs} speech={tts} />

            <VocabPanel
              open={prefs.vocabOpen}
              onToggle={() => update({ vocabOpen: !prefs.vocabOpen })}
              vocab={vocab}
              prefs={prefs}
              speech={tts}
            />
          </div>

          {/* 两枚常驻页签：面板滑走后，抓手留在卷面边缘，位置永不移动 */}
          <EdgeTab
            kind="rail"
            open={prefs.railOpen}
            onToggle={toggleRail}
            label="展开目次"
          />
          <EdgeTab
            kind="vocab"
            open={prefs.vocabOpen}
            onToggle={() => update({ vocabOpen: !prefs.vocabOpen })}
            label="展开生词表"
            count={vocab.declared_count}
          />
        </div>
      </div>

      {/* 两枚纸片：与卷面断开，浮在下面的水面上。2.png 版心正下方还有一枚
          「1 / 8」，但那是**写在水面上的**、底下没有纸；本应用底下是桌面，
          没有纸就一片糊，所以整块不做——课次切换交给目次页。 */}
      <UnitStepper
        unit={lesson.unit}
        total={units.length}
        canPrev={unitAt > 0}
        canNext={unitAt >= 0 && unitAt < units.length - 1}
        onStep={stepUnit}
      />
      <ToolShard prefs={prefs} update={update} speakers={tts.speakers} />
    </div>
  );
}
