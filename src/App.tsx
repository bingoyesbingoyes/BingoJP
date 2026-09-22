import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// 全局样式放最前：组件 CSS 在它们之后加载，同权重的规则才能盖过 base.css 里的工具类。
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/paper.css";
import "./styles/App.css";
import { lessonById, lessonsByUnit, vocabById } from "./features/data";
import { usePrefs } from "./features/prefs";
import { readAloudAvailable, useCompact } from "./features/platform";
import { useRubyFit } from "./features/rubyFit";
import { useTts } from "./features/voice/useTts";
import { EdgeTab } from "./components/EdgeTab";
import { LessonRail } from "./components/LessonRail";
import { WindowButtons } from "./components/WindowControls";
import { ReaderView } from "./components/ReaderView";
import { VocabPanel } from "./components/VocabPanel";
import { ToolShard, UnitStepper } from "./components/ScrollChrome";
// 紧凑版式（手机 / 平板竖屏）的覆盖层放**最后**：整篇都是「压过前面那几条规则」的，
// 顺序反了就得处处写 !important——App.css 与各组件 CSS 在它之前，规则由它收口。
import "./styles/compact.css";

/** 这一版接不接朗读。**壳的属性**，整个会话里不变，所以在组件外算一次：
 *  Android 上没有随包引擎可拉（见 src-tauri/src/voice.rs），朗读入口整块不渲染。
 *  与 `useCompact` 分开：桌面窗口拖窄了版式要收，但朗读仍然可用。 */
const READ_ALOUD = readAloudAvailable();

export default function App() {
  const [currentId, setCurrentId] = useState(1);
  const { prefs, update } = usePrefs();
  const compact = useCompact();

  const tts = useTts({ voiceId: prefs.voiceId, enabled: READ_ALOUD });
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

  /* 紧凑版式一进来先看课文：手机上没有「一卷摊开」这回事，目次页与生词页都是盖在
     正文上的抽屉，两个默认开着就等于一进来先看见目录页。只在**第一次**进入紧凑版式
     时收一次——之后用户开哪个是哪个（prefs 里存着，桌面版那边不受影响）。 */
  const collapsed = useRef(false);
  useEffect(() => {
    if (!compact || collapsed.current) return;
    collapsed.current = true;
    if (prefs.railOpen || prefs.vocabOpen) update({ railOpen: false, vocabOpen: false });
  }, [compact, prefs.railOpen, prefs.vocabOpen, update]);

  /* 选课。紧凑版式里选完就把目次页推回去：抽屉盖着正文，而「选好了」这个动作本身
     就是「我要读这一课」——不推回去，用户还得自己再按一次页签。
     桌面版两页并排，选完课目录留在原处是合理的（下一页就在手边）。 */
  const selectLesson = useCallback(
    (id: number) => {
      setCurrentId(id);
      if (compact) update({ railOpen: false });
    },
    [compact, update],
  );

  /* 两页的开合。桌面版各开各的：两页并排，画面上互不相干。
     紧凑版式里两页是同一个位置上的抽屉——开一个得合上另一个，否则「开来开去总有
     一页压在底下」，那枚页签也说不清指的是哪一页。 */
  const railOpen = prefs.railOpen;
  const vocabOpen = prefs.vocabOpen;
  const toggleRail = useCallback(() => {
    update(
      compact ? { railOpen: !railOpen, vocabOpen: false } : { railOpen: !railOpen },
    );
  }, [compact, railOpen, update]);
  const toggleVocab = useCallback(() => {
    update(
      compact ? { vocabOpen: !vocabOpen, railOpen: false } : { vocabOpen: !vocabOpen },
    );
  }, [compact, vocabOpen, update]);

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
       → 版心 .app → 两枚纸片。**窗口里没有整幅背景图**：桌面版纸之外是透明的，
       桌面从缺口里透进来——异形窗的轮廓就是靠这一点才立得住；紧凑版式（手机）
       没有桌面可透，铺的是设计稿上那层夜色（见 styles/compact.css）。

       data-rail / data-vocab＝「哪一页摊开着」。桌面版只用来开关课文那一栏的
       半道缝影（见 App.css）；紧凑版式里还要靠它藏掉对面那枚页签（抽屉是互斥的）。

       data-tauri-drag-region="deep"：**整棵子树都能拖窗口**。
       Tauri 2.11 的 drag.js 是这么走的：从事件目标往上找这个属性，
       中途撞到 BUTTON / A / INPUT / SELECT / TEXTAREA / LABEL / SUMMARY
       或 role 是 button/link/option… 的元素就**停下并判定为不可拖**。
       所以这一条属性既让「非按钮的地方」都能拖动窗口，又不会把按钮吃掉。

       **紧凑版式里这一条要给掉**（undefined＝不出这个属性）：手机上「拖窗口」
       这件事不存在（Tauri 的 startDragging 在 Android 上没有意义），而且整屏
       都能拖会让手指划动正文时误触。 */
    <div
      className="makimono"
      data-rail={railOpen || undefined}
      data-vocab={vocabOpen || undefined}
      data-tauri-drag-region={compact ? undefined : "deep"}
    >
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
            所以底色单独一层，和版心分开（见 App.css 的说明）。
            紧凑版式里这一层不画：两页那时是整幅的抽屉，各自铺自己的纸色。 */}
        <div className="makimono__pages" aria-hidden>
          <i className="makimono__page makimono__page--rail" data-open={railOpen || undefined} />
          <i className="makimono__page makimono__page--vocab" data-open={vocabOpen || undefined} />
        </div>

        <div className="app">
          {/* data-rail / data-vocab＝「这一页现在摊开着」。中缝是对折出来的：
              两页合着时，课文那一栏边上不该有半道来历不明的影。见 App.css。 */}
          <div
            className="app__body"
            data-rail={railOpen || undefined}
            data-vocab={vocabOpen || undefined}
          >
            <LessonRail currentId={currentId} onSelect={selectLesson} open={railOpen} />

            <ReaderView lesson={lesson} prefs={prefs} speech={tts} />

            <VocabPanel
              open={vocabOpen}
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
          不跟着版心排——版心让开了撕口，页签却要在撕口之外。
          紧凑版式里它们仍是两页的开关（位置改到纸的边缘，见 compact.css）。 */}
      <EdgeTab side="rail" open={railOpen} onToggle={toggleRail} label="目次页：展开 / 收起" />
      <EdgeTab
        side="vocab"
        open={vocabOpen}
        onToggle={toggleVocab}
        label="生词表：展开 / 收起"
      />

      {/* 窗口的两颗朱印：位置比版心还高（贴着纸的右上角），所以也在窗口这一层。
          最小 / 最大化 / 关闭是**窗口**那一套，手机上不成立——紧凑版式里整块不画。 */}
      {compact ? null : <WindowButtons />}

      {/* 两枚纸片：与卷面断开，浮在下面的夜色上 */}
      <UnitStepper
        unit={lesson.unit}
        total={units.length}
        canPrev={unitAt > 0}
        canNext={unitAt >= 0 && unitAt < units.length - 1}
        onStep={stepUnit}
      />
      <ToolShard
        prefs={prefs}
        update={update}
        speakers={tts.speakers}
        readAloud={READ_ALOUD}
        onToggleRail={toggleRail}
        onToggleVocab={toggleVocab}
      />
    </div>
  );
}
