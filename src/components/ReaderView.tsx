/** 中间主区：当前课的课文。三节按顺序渲染；每句是一个按钮，点一下朗读、再点停。
 *  朗读文本＝`ja` 拼起来的基础文本（抽取时已剥掉句首说话人，全角空格原样保留）。
 *
 *  版面上有三条纪律（都来自 2.png）：
 *
 *  1. **课文标题不参与翻译与注音**。卷头的「第 N 課　…」是标题，不是正文：
 *     不出振り仮名、也不在下面挂中文。课名的中文在目次页里已经有了
 *     （那里一课两行：日文 + 中文），标题行不必再重复一遍。
 *     节名（基本課文 / 基本会話）同理——它们是结构，不是内容。
 *
 *  2. **开关不抖**。注音关掉时 rt 只是被藏起来（Segments 的 data-off），
 *     中文关掉时那一行也**原地留着**（.line__zh 的 data-off）——
 *     切开关只换字的显隐，行盒一个像素都不动。
 *
 *  3. **句子要密**。行距、内缩、句间隔都压到最小，一屏尽可能多地摊开课文。
 */

import type { CSSProperties } from "react";
import { Ornament } from "./Seal";
import { Segments } from "./Segments";
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
      <div className="reader__scroll scroll">
        <div className="reader__inner">
          <header className="reader__head">
            {/* 卷头水印：压在版心外缘（右侧）顶上，只是纸上的一个印子 */}
            <span className="reader__watermark" aria-hidden>
              {PART_MARK[lesson.part]}
            </span>

            {/* 课文标题：只出日文。**不注音、不翻译**——标题是标题，正文是正文。
                标题下面**不画界栏**、也不挂「第 N 単元 · 共 N 句」那行小字：
                标题与「基本課文」之间隔着的应该是纸，不是一条线 + 一行注。 */}
            <h1 className="reader__title jp">{segText(lesson.title_ja)}</h1>
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
                {/* 节标题＝一条分隔带：节名压在一道淡墨笔扫上（不是边框題簽），
                    后面接一条界栏细线 + 四瓣花。笔扫是**纸上的痕迹**，所以走伪元素。 */}
                <header className="sec__head">
                  <h2 className="sec__ja jp">
                    <span className="sec__kind">{segText(section.title_ja)}</span>
                    {section.subtitle_ja ? (
                      <span className="sec__title">
                        <Segments segs={section.subtitle_ja} reading={prefs.showReading} />
                      </span>
                    ) : null}
                  </h2>
                  <span className="sec__rule" aria-hidden>
                    <Ornament />
                  </span>
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
      <button
        type="button"
        className="line"
        data-playing={playing || undefined}
        data-pending={pending || undefined}
        /* --i 给逐行入场动画（每句错开 18ms） */
        style={{ "--i": String(sentenceIndex) } as CSSProperties}
        onClick={() => void speech.speak(key, text)}
        aria-label={`${playing ? "停止朗读" : "朗读"}：${text}`}
      >
        <span className="line__icon" aria-hidden>
          {playing ? <StopIcon /> : <SpeakerIcon />}
        </span>
        <span className="line__main">
          <span className="line__ja jp">
            {/* 说话人只出「Ａ　甲：」这一小截，颜色比正文淡一档 */}
            {sentence.speaker ? (
              <span className="line__speaker">{sentence.speaker}：</span>
            ) : null}
            <Segments segs={sentence.ja} reading={prefs.showReading} />
          </span>
          {/* 中文行**常驻**：关掉时只把字藏起来。行盒不动，开关就不抖。 */}
          <span className="line__zh" data-off={prefs.showZh ? undefined : true}>
            {sentence.zh}
          </span>
        </span>
      </button>
    </li>
  );
}

function SpeakerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 6.2h2.2L7.5 3.6v8.8L4.7 9.8H2.5a.7.7 0 0 1-.7-.7V6.9a.7.7 0 0 1 .7-.7Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M10 5.8a3.4 3.4 0 0 1 0 4.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M11.9 4a5.6 5.6 0 0 1 0 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.4" fill="currentColor" />
    </svg>
  );
}
