import { useCallback, useEffect, useMemo, useState } from "react";
// 全局样式放最前：组件 CSS 在它们之后加载，同权重的规则才能盖过 base.css 里的工具类。
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/paper.css";
import "./styles/App.css";
import { lessonById, lessonsByUnit, vocabById } from "./features/data";
import { usePrefs } from "./features/prefs";
import { useRubyFit } from "./features/rubyFit";
import { useTts } from "./features/voice/useTts";
import { EdgeTab } from "./components/EdgeTab";
import { LessonRail } from "./components/LessonRail";
import { WindowButtons } from "./components/WindowControls";
import { ReaderView } from "./components/ReaderView";
import { VocabPanel } from "./components/VocabPanel";
import { ToolShard, UnitStepper } from "./components/ScrollChrome";

export default function App() {
  const [currentId, setCurrentId] = useState(1);
  const { prefs, update } = usePrefs();

  const tts = useTts({ voiceId: prefs.voiceId });
  const lesson = lessonById(currentId);
  const vocab = vocabById(currentId);

  const units = useMemo(() => lessonsByUnit(), []);
  const unitAt = units.findIndex((group) => group.lessons.some((item) => item.id === currentId));

  /* 注音比汉字宽的片段：把注音缩一档、多余的挂到两侧，别让它把左右两个字挤开。
     挂在这里（不是 ReaderView / VocabPanel 各挂一次）：课文、目次、生词表里的 ruby
     都在这一棵树下，一处收完；它的 layoutEffect 在子组件提交**之后**才跑，
     所以 DOM 已经在了。见 features/rubyFit.ts。 */
  useRubyFit();

  // 换课就别让上一课的声音继续响。缓存留着——切回来重播是秒开的。
  const stop = tts.stop;
  useEffect(() => {
    stop();
  }, [currentId, stop]);

  const selectLesson = useCallback((id: number) => setCurrentId(id), []);
  const railOpen = prefs.railOpen;
  const vocabOpen = prefs.vocabOpen;
  const toggleRail = useCallback(() => update({ railOpen: !railOpen }), [railOpen, update]);
  const toggleVocab = useCallback(() => update({ vocabOpen: !vocabOpen }), [vocabOpen, update]);

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
    /* .makimono＝整卷。从外到内：卷面（撕口轮廓由 edge-sheet.png 的 mask 给出）
       → 版心 .app → 两枚纸片。**窗口里没有整幅背景图**：纸之外是透明的，
       桌面从缺口里透进来——异形窗的轮廓就是靠这一点才立得住。

       data-tauri-drag-region="deep"：**整棵子树都能拖窗口**。
       Tauri 2.11 的 drag.js 是这么走的：从事件目标往上找这个属性，
       中途撞到 BUTTON / A / INPUT / SELECT / TEXTAREA / LABEL / SUMMARY
       或 role 是 button/link/option… 的元素就**停下并判定为不可拖**。
       所以这一条属性既让「非按钮的地方」都能拖动窗口，又不会把按钮吃掉。 */
    <div className="makimono" data-tauri-drag-region="deep">
      {/* 投影：一层**静态剪影**（与纸同形、被纸整个盖住），两道 drop-shadow 挂在它身上。
          纸自己在滑动时纹丝不动，所以这层影子只算一次；挂在 .makimono 上会每帧
          重算整窗——「点展开按钮会抖」有一大半是它。见 App.css 的说明。 */}
      <i className="makimono__shadow" aria-hidden>
        <i className="makimono__shadow-sheet" />
        <i className="makimono__shadow-roller" />
      </i>

      {/* 左端那一卷纸：卷口与卷尾都是纸。**这一块照旧不动**——
          仍是 2.png 上整块抠下来的贴图（public/roller.png，见 scripts/trace_roller.py）。 */}
      <i className="makimono__roller" aria-hidden />

      <div className="makimono__sheet">
        {/* 撕裂口三层：断口旧纸 → 纤维 → 纸面。手撕的痕就在这一圈里 */}
        <i className="makimono__rim" aria-hidden />
        <i className="makimono__fibre" aria-hidden />
        <i className="makimono__face" aria-hidden />

        {/* 和纸肌：铺在**整幅卷面**上，盖住三页的纸色（不然两栏那两页是平的）。
            见 App.css 的说明。 */}
        <i className="makimono__mottle" aria-hidden />

        {/* 目次页与生词页的**纸色**：铺满卷面整个高度，被卷面轮廓裁边。
            正文的版心让开撕口，纸不让——稿上这三页一直铺到撕口。
            所以底色单独一层，和版心分开（见 App.css 的说明）。 */}
        <div className="makimono__pages" aria-hidden>
          <i className="makimono__page makimono__page--rail" data-open={prefs.railOpen || undefined} />
          <i
            className="makimono__page makimono__page--vocab"
            data-open={prefs.vocabOpen || undefined}
          />
        </div>

        <div className="app">
          {/* data-rail / data-vocab＝「这一页现在摊开着」。中缝是对折出来的：
              两页合着时，课文那一栏边上不该有半道来历不明的影。见 App.css。 */}
          <div
            className="app__body"
            data-rail={prefs.railOpen || undefined}
            data-vocab={prefs.vocabOpen || undefined}
          >
            <LessonRail currentId={currentId} onSelect={selectLesson} open={prefs.railOpen} />

            <ReaderView lesson={lesson} prefs={prefs} speech={tts} />

            <VocabPanel
              open={prefs.vocabOpen}
              vocab={vocab}
              lesson={lesson}
              prefs={prefs}
              speech={tts}
            />
          </div>
        </div>
      </div>

      {/* 两枚常驻书签页签：面板滑走、滑回，位置都不动。
          它们钉在**窗口外缘**（纸卷左侧 / 纸边右侧），所以挂在 .makimono 上，
          不跟着版心排——版心让开了撕口，页签却要在撕口之外。 */}
      <EdgeTab side="rail" open={prefs.railOpen} onToggle={toggleRail} label="目次页：展开 / 收起" />
      <EdgeTab
        side="vocab"
        open={prefs.vocabOpen}
        onToggle={toggleVocab}
        label="生词表：展开 / 收起"
      />

      {/* 窗口的两颗朱印：位置比版心还高（贴着纸的右上角），所以也在窗口这一层 */}
      <WindowButtons />

      {/* 两枚纸片：与卷面断开，浮在下面的夜色上 */}
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
