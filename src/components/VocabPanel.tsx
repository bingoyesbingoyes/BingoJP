/** 生词表。排在**卷面右栏**，和目次页对称：整页会**滑入滑出**——
 *  展开时从右侧滑进来，收起时宽度收到 0、内容向右滑出卷面，
 *  抓手是卷面右缘那枚常驻页签（见 ScrollChrome 的 EdgeTab）。
 *
 *  一行两个按钮（不是按钮套按钮）：左键朗读、右侧勾选「已记住」。
 *  勾选在 hover 时才露出来，平时不抢视线；右键仍作为加速器保留。
 *
 *  注音（振り仮名）：读音以 `<ruby>` 压在**该汉字正上方**，不做「单词／假名／中文」
 *  三列——右边的注音永远在单词上方，中文再靠最右。
 */

import type { CSSProperties } from "react";
import { Segments } from "./Segments";
import { useMemorized, wordKey } from "../features/memorized";
import type { Prefs, SpeechControls, VocabLesson } from "../features/types";
import "./VocabPanel.css";

interface VocabPanelProps {
  open: boolean;
  onToggle: () => void;
  vocab: VocabLesson;
  prefs: Prefs;
  speech: Pick<SpeechControls, "playing" | "pending" | "speak">;
}

export function VocabPanel({ open, onToggle, vocab, prefs, speech }: VocabPanelProps) {
  const { keys, toggle } = useMemorized();

  return (
    /* 与目次页同一套：外层管宽度、内层管位移。 */
    <aside
      className="vocab"
      data-open={open || undefined}
      aria-label="本课生词表"
      inert={!open}
    >
      <div className="vocab__inner">
        <header className="vocab__head">
          <h2 className="vocab__title slip">
            単語 · {vocab.declared_count} 词
          </h2>
        </header>

        <ol className="vocab__list scroll">
          {vocab.words.map((word, index) => {
            const key = `v${vocab.id}w${index}`;
            const playing = speech.playing === key;
            const pending = speech.pending === key;
            const memorized = keys.has(wordKey(vocab.id, word));

            return (
              <li key={index}>
                <div
                  className="vrow"
                  data-playing={playing || undefined}
                  data-pending={pending || undefined}
                  data-memorized={memorized || undefined}
                  /* --i 供逐行入场动画（前 24 行有错峰） */
                  style={{ "--i": String(Math.min(index, 24)) } as CSSProperties}
                  onContextMenu={(event) => {
                    // 右键不弹系统菜单，直接改标记；再右键就是恢复
                    event.preventDefault();
                    toggle(wordKey(vocab.id, word));
                  }}
                >
                  <button
                    type="button"
                    className="vrow__speak"
                    onClick={() => void speech.speak(key, ttsText(word.kana))}
                    aria-label={`${playing ? "停止朗读" : "朗读"}：${word.kana}`}
                  >
                    {/* 读音以 ruby 压在汉字上方；中文在行的最右端 */}
                    <span className="vrow__ja jp">
                      <Segments segs={word.word} reading={prefs.showReading} />
                    </span>
                    <span className="vrow__zh">{word.zh}</span>
                  </button>

                  <button
                    type="button"
                    className="vrow__mark"
                    role="checkbox"
                    aria-checked={memorized}
                    aria-label={memorized ? "取消已记住" : "标记为已记住"}
                    onClick={() => toggle(wordKey(vocab.id, word))}
                  >
                    <CheckIcon />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>

        {/* 页脚：与目次页**同一枚**「收起」。两栏的键都落在纸的最下沿、
            都靠课文那一侧（这一页在右，所以贴左端），样式共用 App.css 的
            .panel-foot —— 一上一下两套样式的日子结束了。 */}
        <footer className="panel-foot vocab__foot">
          <button
            type="button"
            className="panel-foot__btn"
            onClick={onToggle}
            aria-label="收起生词表"
          >
            <ChevronRightIcon />
          </button>
        </footer>
      </div>
    </aside>
  );
}

/** 合成用的文本。
 *
 *  词表里有两个「两说并列」的词条——`ううん ∕ いや`（22 课）、`それでは/それじゃ`（30 课）。
 *  把斜杠原样交给引擎会读出奇怪的东西，所以只念第一个说法；显示的一个字不动。
 */
function ttsText(kana: string): string {
  return kana.split(/[∕/]/)[0]?.trim() || kana;
}

/** 「已记住」的勾 */
function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.4 8.6l3 3 6.2-7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6 3.5L10.5 8L6 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
