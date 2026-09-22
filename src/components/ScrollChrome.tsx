/** 卷面上的「附件」：单元选择，以及右下那块设置区。
 *
 *  这两块都不属于三栏正文，而是**异形窗本身的一部分**：两枚纸片浮在卷面下方，
 *  和卷面之间隔着一道夜色。见 App.css 的 .frag。
 *
 *  两枚书签页签（左右两栏的滑入滑出）已经搬去 EdgeTab.tsx 了——
 *  它们钉在**窗口外缘**，不跟着版心排，所以和纸片不是一类东西。
 *
 *  样式写在 styles/App.css（外壳样式表）里，与本目录其它组件各自带 CSS 的做法不同：
 *  它们画的是窗口的形状，不是面板的内容。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Prefs, Speaker } from "../features/types";
import { Blossom, SealRing } from "./Seal";

/* ===========================================================================
   左下纸片 · 单元选择
   =========================================================================== */

interface UnitStepperProps {
  unit: number;
  /** 全册共几个单元。那行小字「3 / 12」用。 */
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onStep: (delta: number) => void;
}

/** 稿子上这一排的头一枚是一朵**朱梅花**，然后才是 ‹ 単元選択 › 与「2 / 12」。
 *  位置固定在卷面下方这块纸片上。 */
export function UnitStepper({ unit, total, canPrev, canNext, onStep }: UnitStepperProps) {
  return (
    /* 纸片本身就是按钮组，所以这里是 div：按钮只出现在箭头与标签上 */
    <div className="frag frag--unit paper-panel">
      <span className="frag__marks" aria-hidden>
        <Blossom size={22} />
      </span>
      <div className="unit-step">
        <button
          type="button"
          className="unit-step__btn"
          disabled={!canPrev}
          onClick={() => onStep(-1)}
          aria-label="上一个单元"
        >
          <Chevron dir="left" />
        </button>

        <span className="unit-step__label">
          {/* 稿子上的字样：不是「第 N 单元」，而是这组控件的名字 */}
          <span className="unit-step__word">単元選択</span>
          <span className="unit-step__now mono">
            {unit} <i>/</i> {total}
          </span>
        </span>

        <button
          type="button"
          className="unit-step__btn"
          disabled={!canNext}
          onClick={() => onStep(1)}
          aria-label="下一个单元"
        >
          <Chevron dir="right" />
        </button>
      </div>
    </div>
  );
}

/* ===========================================================================
   右下纸片 · 音色 + 四枚朱印圆钮
   =========================================================================== */

interface ToolShardProps {
  prefs: Prefs;
  update: (patch: Partial<Prefs>) => void;
  speakers: Speaker[];
  /** 这一版接不接朗读。不接（Android）时「音色」那枚钮整块不出现——
   *  音色只归朗读用（它选的是 VOICEVOX 的说话人），没有朗读就没有它。 */
  readAloud: boolean;
  /** 生词页 / 目次页的开合。**由外面给**，不在这里就地 update：
   *  紧凑版式里这两页是互斥的抽屉（开一个要顺带合上另一个），
   *  那条规矩属于 App 的版式逻辑，不属于这块纸片。 */
  onToggleVocab: () => void;
  onToggleRail: () => void;
}

export function ToolShard({
  prefs,
  update,
  speakers,
  readAloud,
  onToggleVocab,
  onToggleRail,
}: ToolShardProps) {
  return (
    <div className="frag frag--tools paper-panel">
      {/* 音色与旁边四枚**同一形制的小钮**：平时只占一颗钮的位置，点开才升起小笺 */}
      {readAloud ? (
        <>
          <VoiceTool voiceId={prefs.voiceId} speakers={speakers} onChange={update} />

          {/* 发丝缝：把「用什么声音读」和「怎么显示」分成两组 */}
          <span className="frag__seam" aria-hidden />
        </>
      ) : null}

      <div className="tool-row" role="group" aria-label="阅读设置">
        <Tool
          on={prefs.showReading}
          onToggle={() => update({ showReading: !prefs.showReading })}
          label="注音"
          hint="注音：汉字上方标读音（平假名）"
        >
          <FuriganaIcon />
        </Tool>

        <Tool
          on={prefs.showZh}
          onToggle={() => update({ showZh: !prefs.showZh })}
          label="中文"
          hint="中文对照：句子下方给一行译文"
        >
          <TranslateIcon />
        </Tool>

        <Tool
          on={prefs.vocabOpen}
          onToggle={onToggleVocab}
          label="生词"
          hint="生词表：本课词笺从右侧滑入 / 滑出"
        >
          <ListIcon />
        </Tool>

        <Tool
          on={prefs.railOpen}
          onToggle={onToggleRail}
          label="目次"
          hint="目次：课程地图从左侧滑入 / 滑出"
        >
          <BooksIcon />
        </Tool>
      </div>
    </div>
  );
}

/** 音色：与旁边四枚同形制的**小圆钮**。
 *
 *  需求：音色不要常驻一个下拉把自己摊在纸面上占体积——平时只留一颗钮，
 *  点开才在上方升起一张小笺列出可选音色，选完即收。
 *
 *  收起方式：选中一项 / 点笺外 / 按 Esc。 */
function VoiceTool({
  voiceId,
  speakers,
  onChange,
}: {
  voiceId: number | null;
  speakers: Speaker[];
  onChange: (patch: Partial<Prefs>) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = voiceId ?? speakers[0]?.id ?? null;
  const picked = speakers.find((speaker) => speaker.id === current) ?? null;

  /* 正在用的那一枚**排在最上面**。VOICEVOX 一装几十条，列表本来就是按引擎的
     顺序给的：当前音色常常要滚到中段才找得到，选中之后也看不出选了什么。
     这里只把当前项提到第一位，其余**保持原来的顺序**——挑音色靠的是位置的记忆。 */
  const ordered = useMemo(() => {
    if (current == null) return speakers;
    const at = speakers.findIndex((speaker) => speaker.id === current);
    if (at <= 0) return speakers;
    return [speakers[at], ...speakers.slice(0, at), ...speakers.slice(at + 1)];
  }, [speakers, current]);

  // 点笺外 / Esc 就收起来。只在展开时挂监听，收起来就卸掉。
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="voice-tool" ref={box}>
      <button
        type="button"
        className="tool"
        data-on={open || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        aria-label={picked ? `音色：${picked.name} · ${picked.style}` : "音色"}
      >
        <span className="tool__seal">
          <span className="tool__ring" aria-hidden>
            <SealRing />
          </span>
          <span className="tool__glyph">
            <VoiceIcon />
          </span>
        </span>
        <span className="tool__label">音色</span>
      </button>

      {/* 小笺上的 data-tauri-drag-region="false"：整卷是 deep 可拖区，小笺得自己
          退出来。否则按住笺上的空白（标题、内边距）会把窗口拖走，而且 Tauri 的
          mousedown 处理会 stopImmediatePropagation——菜单也不会因为「点到外面」收起。 */}
      {open ? (
        <div
          className="voice-menu paper-panel"
          role="listbox"
          aria-label="音色"
          data-tauri-drag-region="false"
        >
          <p className="voice-menu__head">読み手</p>
          {speakers.length === 0 ? (
            <p className="voice-menu__empty">没有可用音色</p>
          ) : (
            <ul className="voice-menu__list scroll">
              {ordered.map((speaker) => {
                const active = speaker.id === current;
                return (
                  <li key={speaker.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className="voice-menu__item"
                      data-current={active || undefined}
                      onClick={() => {
                        onChange({ voiceId: speaker.id });
                        setOpen(false);
                      }}
                    >
                      {/* 选中态左端那朵朱梅（稿子的「选中状态」示意里就是它） */}
                      {active ? (
                        <span className="voice-menu__mark" aria-hidden>
                          <Blossom size={13} />
                        </span>
                      ) : null}
                      <span className="voice-menu__name">{speaker.name}</span>
                      {active ? (
                        <span className="voice-menu__tick" aria-hidden>
                          <CheckIcon />
                        </span>
                      ) : (
                        <span className="voice-menu__style">{speaker.style}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* 一枚朱印小钮。
   `hint` **只给读屏**（aria-label）——界面上不再有 hover 才浮出来的说明文字。 */
function Tool({
  on,
  onToggle,
  label,
  hint,
  children,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="tool"
      data-on={on || undefined}
      aria-pressed={on}
      onClick={onToggle}
      aria-label={hint}
    >
      <span className="tool__seal">
        <span className="tool__ring" aria-hidden>
          <SealRing />
        </span>
        <span className="tool__glyph">{children}</span>
      </span>
      <span className="tool__label">{label}</span>
    </button>
  );
}

/* ===========================================================================
   图标
   =========================================================================== */

/** 折角箭头。方向和面板在窗口的哪一侧有关，由调用方决定。 */
function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d={dir === "left" ? "M10 3.5L5.5 8L10 12.5" : "M6 3.5L10.5 8L6 12.5"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 当前音色后面那枚勾。 */
function CheckIcon() {
  return (
    <svg className="voice-menu__check" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.2 8.6l3.1 3.1L12.8 4.4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 音色：一枚小喇叭（两条声波）。与旁边四枚图标同一套线宽与尺寸。 */
function VoiceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 6.2h2.2L7.5 3.6v8.8L4.7 9.8H2.5a.7.7 0 0 1-.7-.7V6.9a.7.7 0 0 1 .7-.7Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M10.1 5.9a3.3 3.3 0 0 1 0 4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M12.2 4.1a5.6 5.6 0 0 1 0 7.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** 注音：汉字块上方三小笔，代表振假名 */
function FuriganaIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.6" y="6.6" width="8.8" height="6.2" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M4.4 4.2h1.5M7.25 4.2h1.5M10.1 4.2h1.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 中文对照：地球（语言 / 翻译的通用符号） */
function TranslateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.7" stroke="currentColor" strokeWidth="1.25" />
      <ellipse cx="8" cy="8" rx="2.5" ry="5.7" stroke="currentColor" strokeWidth="1.25" />
      <path d="M2.7 6.1h10.6M2.7 9.9h10.6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

/** 生词表：三条带点的横线 */
function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 4.2h7M6 8h7M6 11.8h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="3.2" cy="4.2" r="1" fill="currentColor" />
      <circle cx="3.2" cy="8" r="1" fill="currentColor" />
      <circle cx="3.2" cy="11.8" r="1" fill="currentColor" />
    </svg>
  );
}

/** 目次：两本并立的卷册 */
function BooksIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2.4 3.4h3.2v9.2H2.4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7.6 2.6h3.2v10H7.6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M12.6 4.2h1.4v8.4h-1.4z" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
