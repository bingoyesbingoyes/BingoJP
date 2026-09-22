/** 生词表。排在**卷面右栏**，和目次页对称：整页会**滑入滑出**——
 *  展开时从右侧滑进来，收起时宽度收到 0、内容向右滑出卷面，
 *  抓手是窗口右缘那枚常驻书签页签（EdgeTab.tsx）。这一页里不再摆「收起」键。
 *
 *  页头：一枚压在枯茶笔扫上的「単語」，笔扫左下角挑出一枝朱梅，
 *  右端一枚细茶线圆角小牌写着「第 N 単元・第 M 課」（词数在 aria-label 里，不占版面）。
 *
 *  一行两个按钮（不是按钮套按钮）：左键朗读、右侧勾选「已记住」。
 *  勾选在 hover 时才露出来，平时不抢视线；右键仍作为加速器保留。
 *
 *  注音（振り仮名）：读音以 `<ruby>` 压在**该汉字正上方**，不做「单词／假名／中文」
 *  三列——右边的注音永远在单词上方，中文再靠最右。 */

import type { CSSProperties } from "react";
import { Blossom } from "./Seal";
import { Segments } from "./Segments";
import { useMemorized, wordKey } from "../features/memorized";
import type { Lesson, Prefs, SpeechControls, VocabLesson } from "../features/types";
import "./VocabPanel.css";

interface VocabPanelProps {
  open: boolean;
  vocab: VocabLesson;
  /** 当前课。页头那枚小牌要写「第 N 単元・第 M 課」，单元号在课上。 */
  lesson: Lesson;
  prefs: Prefs;
  speech: Pick<SpeechControls, "playing" | "pending" | "speak">;
}

export function VocabPanel({ open, vocab, lesson, prefs, speech }: VocabPanelProps) {
  const { keys, toggle } = useMemorized();

  return (
    /* 与目次页同一套：外层管宽度、内层管位移。 */
    <aside
      className="vocab"
      data-panel="vocab"
      data-open={open || undefined}
      aria-label={`第 ${lesson.unit} 单元 第 ${lesson.id} 课 生词表，共 ${vocab.declared_count} 词`}
      inert={!open}
    >
      <div className="vocab__inner">
        {/* 纸上的两幅画：右上那枝樱的**右半**（跨着中缝长，按折缝切开）、
            左下那幅水墨的右半（雪屋）。都在 .vocab__inner 里，跟着这一页一起滑走。
            只是印在纸上的画：不进读屏、不吃指针、压在正文之下。 */}
        <span className="vocab__art vocab__art--branch paper-art paper-art--branch-vocab" aria-hidden />
        <span className="vocab__art vocab__art--house paper-art paper-art--house" aria-hidden />

        <header className="vocab__head">
          {/* 単語：压在一道枯茶笔扫上，笔扫左下挑出一枝朱梅（稿子的形制）。
              笔扫是独立一层，pointer-events: none。 */}
          <h2 className="vocab__title">
            <span className="vocab__wash paper-wash paper-wash--wide" aria-hidden />
            <span className="vocab__blossom" aria-hidden>
              <Blossom size={13} />
            </span>
            <span className="vocab__word">単語</span>
          </h2>

          <span className="vocab__badge slip" aria-hidden>
            第 {lesson.unit} 単元・第 {lesson.id} 課
          </span>
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
                    {/* 朗读中的朱梅：压在行首，绝对定位，不占布局 */}
                    {playing || pending ? (
                      <span className="vrow__mark" aria-hidden>
                        <Blossom size={11} filled={playing} />
                      </span>
                    ) : null}
                    {/* 读音以 ruby 压在汉字上方；中文在行的最右端 */}
                    <span className="vrow__ja jp">
                      <Segments segs={word.word} reading={prefs.showReading} />
                    </span>
                    <span className="vrow__zh">{word.zh}</span>
                  </button>

                  <button
                    type="button"
                    className="vrow__mark-btn"
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
