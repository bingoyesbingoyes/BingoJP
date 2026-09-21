/** 卷面上的「附件」：两枚常驻页签、单元选择、以及右下那块设置区。
 *
 *  这几块都不属于三栏正文，而是**异形窗本身的一部分**：
 *   · 页签钉在卷面左右边缘，面板滑走、滑回都不动它——滑动的面板不能没有抓手；
 *   · 两枚纸片在卷面下方、和卷面之间隔着一道透明的水面，是 2.png 最鲜明的轮廓特征。
 *     （2.png 版心正下方还有一枚「1 / 8」，但那是写在水面上的、底下没有纸——
 *     本应用底下是桌面，没有纸就一片糊，所以整块不做：课次切换交给目次页。）
 *
 *  右下那块的形制严格照 2.png：五枚**花边朱印圆钮**（Seal.tsx 的 SealRing），
 *  图标压在印里、名称写在印下，字距松开。音色也是一颗同样的钮——
 *  点开才在上方升起一张小笺列音色，平时不占地方（见 VoiceTool）。
 *
 *  样式写在 styles/App.css（外壳样式表）里，与本目录其它组件各自带 CSS 的做法不同：
 *  它们画的是窗口的形状，不是面板的内容。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Prefs, Speaker } from "../features/types";
import { SealRing } from "./Seal";

/* ===========================================================================
   常驻页签
   =========================================================================== */

interface EdgeTabProps {
  /** rail＝左侧目次页；vocab＝右侧生词页。决定贴哪条边、长什么样。 */
  kind: "rail" | "vocab";
  open: boolean;
  onToggle: () => void;
  label: string;
  /** 生词页签上那枚词数角标。目次页签不传。 */
  count?: number;
}

export function EdgeTab({ kind, open, onToggle, label, count }: EdgeTabProps) {
  return (
    /* 页签是**被面板盖住的那一枚**：面板展开时它藏起来（收起的入口在面板里），
       面板滑走后才浮出来——所以它只在收起态可见、可点。 */
    <button
      type="button"
      className={`edge-tab edge-tab--${kind}`}
      data-shown={!open || undefined}
      onClick={onToggle}
      disabled={open}
      aria-expanded={open}
      aria-label={label}
    >
      {kind === "rail" ? (
        /* 目次：箭头指向「纸的方向」——点它就把目次页拉回来 */
        <>
          <Chevron dir="right" />
          <span className="edge-tab__word">目次</span>
        </>
      ) : (
        <>
          <ListIcon />
          <span className="edge-tab__word">単語</span>
          {typeof count === "number" ? <span className="edge-tab__count mono">{count}</span> : null}
        </>
      )}
    </button>
  );
}

/* ===========================================================================
   左下纸片 · 单元选择
   =========================================================================== */

interface UnitStepperProps {
  unit: number;
  /** 全册共几个单元。页脚那行小字「3 / 12」用。 */
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onStep: (delta: number) => void;
}

export function UnitStepper({ unit, total, canPrev, canNext, onStep }: UnitStepperProps) {
  return (
    /* 纸片本身就是按钮组，所以这里是 div：按钮只出现在箭头与标签上 */
    <div className="frag frag--unit paper-panel">
      <span className="frag__marks" aria-hidden />
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
          {/* 2.png 的字样：不是「第 N 单元」，而是这组控件的名字 */}
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
}

export function ToolShard({ prefs, update, speakers }: ToolShardProps) {
  return (
    <div className="frag frag--tools paper-panel">
      {/* 音色与旁边四枚**同一形制的小钮**：平时只占一颗钮的位置，点开才升起小笺 */}
      <VoiceTool voiceId={prefs.voiceId} speakers={speakers} onChange={update} />

      {/* 发丝缝：把「用什么声音读」和「怎么显示」分成两组 */}
      <span className="frag__seam" aria-hidden />

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
          onToggle={() => update({ vocabOpen: !prefs.vocabOpen })}
          label="生词"
          hint="生词表：本课词笺从右侧滑入 / 滑出"
        >
          <ListIcon />
        </Tool>

        <Tool
          on={prefs.railOpen}
          onToggle={() => update({ railOpen: !prefs.railOpen })}
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
 *  （原来那根浅色长条就是原生 select 的默认外观，既占地方又和纸面不合。）
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
     这里只把当前项提到第一位，其余**保持原来的顺序**——挑音色靠的是位置的记忆，
     换个排序法，每次都得重新找。 */
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
   `hint` **只给读屏**（aria-label）——界面上不再有 hover 才浮出来的说明文字：
   钮上已经写了名字（注音 / 中文 / 生词 / 目次），点了就是开关，不需要再解释一遍。 */
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
