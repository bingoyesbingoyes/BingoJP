/** 中间主区：当前课的课文。三节按顺序渲染；每句是一个按钮，点一下朗读、再点停。
 *  朗读文本＝`ja` 拼起来的基础文本（抽取时已剥掉句首说话人，全角空格原样保留）。
 *
 *  **不接朗读的壳里（Android）句子不是按钮**：同一套 class、同一套 data-*、同一条入场
 *  动画，只是换成一段静态文字——版面一个像素都不差，但没有一枚按下去不出声的按钮。
 *  见 SentenceLine 的 LineShell。
 *
 *  版面上有四条纪律：
 *
 *  1. **标题不注音、不翻译**。卷头的「第 N 課　…」是标题，不是正文，
 *     标题行不必再挂一行中文。节名（基本課文 / 基本会話）同理——它们是结构，不是内容。
 *
 *  2. **节与节之间是一条通栏线 + 一朵朱梅，节名压在线下的枯茶笔扫上**。
 *     这是设计稿的做法（线在上、名在下），不是「名 + 线」并排。
 *
 *  3. **开关不抖**。注音关掉时 rt 只是被藏起来（Segments 的 data-off），
 *     中文关掉时那一行也**原地留着**（.line__zh 的 data-off）。
 *
 *  4. **句子按稿子缩进**：正文比标题让进一格（字下げ），
 *     说话人（Ａ／李）**回退到标题那一列**——稿子上「Ａ　田中：」的 Ａ 就顶在行首。
 */

import type { CSSProperties, ReactNode } from "react";
import { Blossom } from "./Seal";
import { Segments, JaText } from "./Segments";
import { segText } from "../features/data";
import type { Lesson, Prefs, Sentence, SpeechControls } from "../features/types";
import "./ReaderView.css";

/** 卷头水印的字：上册「上」、下册「下」。 */
const PART_MARK: Record<Lesson["part"], string> = {
  upper: "上",
  lower: "下",
};

interface ReaderViewProps {
  lesson: Lesson;
  prefs: Prefs;
  speech: SpeechControls;
}

export function ReaderView({ lesson, prefs, speech }: ReaderViewProps) {
  return (
    <article className="reader">
      {/* 纸上的两幅画：右上那枝花、右下那幅水墨。
          它们和正文**不在同一层**——是印在纸上的，所以不跟着正文滚，
          也不参与交互（pointer-events: none）、不进读屏（aria-hidden）。
          图是从设计稿上整块抠下来的（public/art-*.png，见 trace_design.py）。 */}
      <span className="reader__art reader__art--branch paper-art paper-art--branch" aria-hidden />
      <span className="reader__art reader__art--sumi paper-art paper-art--sumi" aria-hidden />

      <div className="reader__scroll scroll">
        <div className="reader__inner">
          <header className="reader__head">
            {/* 卷头水印：压在版心外缘（右侧）顶上，只是纸上的一个印子 */}
            <span className="reader__watermark" aria-hidden>
              {PART_MARK[lesson.part]}
            </span>

            {/* 课文标题：只出日文。下面那行中文**不采纳**（见文件头第 1 条）。 */}
            <h1 className="reader__title jp">
              <JaText text={segText(lesson.title_ja)} />
            </h1>
          </header>

          {speech.notice ? (
            <div className="notice" role="status">
              <span className="notice__text">{speech.notice}</span>
              <button type="button" className="notice__retry" onClick={() => void speech.probe()}>
                重试
              </button>
              <button
                type="button"
                className="notice__close"
                onClick={speech.dismiss}
                aria-label="关闭提示"
              >
                ×
              </button>
            </div>
          ) : null}

          {lesson.sections.map((section, sectionIndex) => {
            return (
              <section className="sec" key={sectionIndex}>
                {/* 节头：**通栏线在上、节名在下**。
                    线正中压一朵朱梅（稿子上每一道通栏线的中心都是它）；
                    节名压在枯茶笔扫上（paper-wash，从稿子抠下来的那一枚）。 */}
                <header className="sec__head">
                  <span className="sec__rule" aria-hidden>
                    <span className="sec__blossom">
                      <Blossom size={15} />
                    </span>
                  </span>

                  <h2 className="sec__ja jp">
                    <span className="sec__name">
                      <span className="sec__wash paper-wash" aria-hidden />
                      <span className="sec__kind">
                        <JaText text={segText(section.title_ja)} />
                      </span>
                    </span>
                    {section.subtitle_ja ? (
                      <span className="sec__title">
                        <Segments segs={section.subtitle_ja} reading={prefs.showReading} />
                      </span>
                    ) : null}
                  </h2>
                </header>

                <ol className="lines">
                  {section.sentences.map((sentence, sentenceIndex) => (
                    <SentenceLine
                      key={sentenceIndex}
                      lessonId={lesson.id}
                      sectionIndex={sectionIndex}
                      sentenceIndex={sentenceIndex}
                      sentence={sentence}
                      prefs={prefs}
                      speech={speech}
                    />
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      </div>
    </article>
  );
}

interface SentenceLineProps {
  lessonId: number;
  sectionIndex: number;
  sentenceIndex: number;
  sentence: Sentence;
  prefs: Prefs;
  speech: SpeechControls;
}

function SentenceLine({
  lessonId,
  sectionIndex,
  sentenceIndex,
  sentence,
  prefs,
  speech,
}: SentenceLineProps) {
  const key = `l${lessonId}s${sectionIndex}n${sentenceIndex}`;
  const text = segText(sentence.ja);
  const playing = speech.playing === key;
  const pending = speech.pending === key;

  return (
    <li>
      <LineShell
        speakable={speech.enabled}
        label={`${playing ? "停止朗读" : "朗读"}：${text}`}
        onActivate={() => void speech.speak(key, text)}
        playing={playing}
        pending={pending}
        /* --i 给逐行入场动画（每句错开 18ms） */
        style={{ "--i": String(Math.min(sentenceIndex, 12)) } as CSSProperties}
      >
        {/* 朗读中的记号：稿子的三态里没有「播放中」，所以这里用**同一套设计元素**
            里最轻的一件——行首一朵朱梅，压在文字外的缩进里，不占布局。 */}
        {playing || pending ? (
          <span className="line__mark" aria-hidden>
            {playing ? <Blossom size={13} filled /> : <Blossom size={13} />}
          </span>
        ) : null}

        <span className="line__main">
          <span className="line__ja jp">
            {/* 说话人（Ａ／李）**回退到标题那一列**——稿子上就是这样：正文让进一格，
                说话人顶在行首。用负 margin 而不是另开一层：说话的还是同一行。
                说话人里那枚全角空格（「Ａ　甲」）也走 JaText：它跟正文里的空格是同一个
                符号，宽度得一样，否则行首那一格比别处宽。 */}
            {sentence.speaker ? (
              <span className="line__speaker">
                <JaText text={sentence.speaker} />：
              </span>
            ) : null}
            <Segments segs={sentence.ja} reading={prefs.showReading} />
          </span>
          {/* 中文行**常驻**：关掉时只把字藏起来。行盒不动，开关就不抖。 */}
          <span className="line__zh" data-off={prefs.showZh ? undefined : true}>
            {sentence.zh}
          </span>
        </span>
      </LineShell>
    </li>
  );
}

interface LineShellProps {
  /** 能不能点读。不能时出静态文字（同一个壳、同一套 class）。 */
  speakable: boolean;
  label: string;
  onActivate: () => void;
  playing: boolean;
  pending: boolean;
  style: CSSProperties;
  children: ReactNode;
}

/** 句子的外壳。两种形态共用同一条「行」的样式与状态属性：
 *
 *    · 能读（桌面）→ `<button className="line">`，点一下朗读、再点停；
 *    · 不能读（Android）→ `<div className="line">`，一模一样的一行，只是点不动。
 *
 *  为什么不沿用按钮、只把 onClick 摘掉：读屏会照旧把它报成按钮（「朗读：…」），
 *  键盘也能聚焦到一枚按下去什么都不会发生的钮上。外壳换掉，语义才跟着干净。
 *  样式这边不吃亏：`.line` 的排版本来就与元素类型无关（ReaderView.css 里没有
 *  `button.line` 这类选择器）。 */
function LineShell({
  speakable,
  label,
  onActivate,
  playing,
  pending,
  style,
  children,
}: LineShellProps) {
  const shared = {
    className: "line",
    "data-playing": playing || undefined,
    "data-pending": pending || undefined,
    style,
  };

  if (!speakable) return <div {...shared}>{children}</div>;

  return (
    <button type="button" {...shared} onClick={onActivate} aria-label={label}>
      {children}
    </button>
  );
}
