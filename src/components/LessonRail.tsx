/** 课程地图（目次）：上册 1–24（第 1–6 单元）/ 下册 25–48（第 7–12 单元）。
 *
 *  形制照 new_design.png 左页那一栏：
 *
 *   · 页头不是「目次」两个字，是**一枚毛笔写的「読む」**加一方小朱印。
 *     毛笔字没法用 CSS 或 SVG 写出来，所以那一块是从稿子上抠下来的 mask
 *     （public/ink-yomu.png，颜色仍由 --ink 给）；朱印同理（seal-yomu.png）。
 *
 *   · 「初級上冊 / 初級下冊」是一枚**可折的卷头**：压在一道枯茶笔扫上，
 *     右端一枚小箭头。稿子上画了这一枚，就让它真的能折——目次有 12 个单元
 *     48 课，能折起一册是有用的。
 *
 *   · 单元名（第 N 単元）压在同一道笔扫上，上面一条通栏发丝线。
 *
 *   · 每一课**一行**（只出日文课名；中文那行不出——目录一屏多看几课），
 *     左侧一枚课次圆环。三态照稿子：
 *       常态  细描边空圈 + 墨字
 *       悬停  淡朱底 + 圈线转朱
 *       选中  身后一条**手撕的暗朱红纸**（band-select.png 的 mask）+
 *             实心朱圆（纸色数字）+ 行首一朵朱梅
 *
 *  这里是读物，**48 课全部可点、没有上锁**——教材数据是齐的，不需要锁。 */

import { useState } from "react";
import { lessonsByUnit, segText } from "../features/data";
import type { Lesson } from "../features/types";
import { Blossom } from "./Seal";
import { JaText } from "./Segments";
import "./LessonRail.css";

const PART_LABEL: Record<Lesson["part"], string> = {
  upper: "初級上冊",
  lower: "初級下冊",
};

/** 列表里不必重复圆环上的课次，所以把标题开头的「第N課　」剥掉。
 *  中文课名不出——目录一屏多看几课。 */
function shortJa(lesson: Lesson): string {
  const text = segText(lesson.title_ja);
  const prefix = `第${lesson.id}課`;
  return (text.startsWith(prefix) ? text.slice(prefix.length) : text).replace(/^[\u3000 ]+/, "");
}

interface LessonRailProps {
  currentId: number;
  onSelect: (id: number) => void;
  /** 展开着没有。收起＝整页滑进纸卷（宽度归零），窗口外缘的书签页签负责拉回来。 */
  open: boolean;
}

export function LessonRail({ currentId, onSelect, open }: LessonRailProps) {
  /* 折起来的册。默认都摊开——一进来就该看见整册的课。 */
  const [folded, setFolded] = useState<Set<Lesson["part"]>>(new Set());

  const togglePart = (part: Lesson["part"]) =>
    setFolded((value) => {
      const next = new Set(value);
      if (next.has(part)) next.delete(part);
      else next.add(part);
      return next;
    });

  const groups = lessonsByUnit().map((group, index, all) => ({
    ...group,
    newPart: index === 0 || all[index - 1].part !== group.part,
  }));

  return (
    /* 外层只管「多宽」，内层只管「滑到哪」：宽度从当前值重新出发、
       位移也从当前值重新出发，中途打断既不跳也不回弹。 */
    <nav
      className="rail"
      data-panel="rail"
      data-open={open || undefined}
      aria-label="课程地图"
      inert={!open}
    >
      <div className="rail__inner">
        {/* 纸上的画：右上那枝樱（稿上它整个在目次页里，与 読む 那一行齐平，
            右端收在折缝前）。只是印在纸上的画：不进读屏、不吃指针、压在内容之下。 */}
        <span className="rail__art paper-art paper-art--branch-rail" aria-hidden />

        {/* 扉页头：毛笔「読む」+ 一方朱印。两枚都是从稿子上抠下来的 mask，
            颜色交给令牌（墨 / 朱砂）。 */}
        <header className="rail__head">
          <span className="rail__brand" role="img" aria-label="読む" />
          <span className="rail__seal" aria-hidden />
        </header>

        <div className="rail__scroll scroll">
          {groups.map((group) => {
            const isFolded = folded.has(group.part);
            return (
              <section className="rail__unit" key={group.unit}>
                {group.newPart ? (
                  <button
                    type="button"
                    className="rail__part"
                    aria-expanded={!isFolded}
                    onClick={() => togglePart(group.part)}
                  >
                    <span className="rail__part-slip">
                      <span className="rail__part-wash paper-wash paper-wash--wide" aria-hidden />
                      <span className="rail__part-text">{PART_LABEL[group.part]}</span>
                    </span>
                    <span className="rail__part-caret" aria-hidden>
                      <Caret up={!isFolded} />
                    </span>
                  </button>
                ) : null}

                {isFolded ? null : (
                  <>
                    <h2 className="rail__unit-name">
                      <span className="rail__unit-slip">
                        <span className="rail__unit-wash paper-wash" aria-hidden />
                        <span className="rail__unit-tag">第 {group.unit} 単元</span>
                      </span>
                    </h2>

                    <ul className="rail__list">
                      {group.lessons.map((lesson) => {
                        const current = lesson.id === currentId;
                        return (
                          <li key={lesson.id}>
                            <button
                              type="button"
                              className="lesson"
                              data-current={current || undefined}
                              aria-current={current ? "true" : undefined}
                              onClick={() => onSelect(lesson.id)}
                            >
                              {/* 选中的那一条：稿子在这一行身后垫了一条**手撕的暗朱红纸**，
                                  行首还压着一朵朱梅。两样都是装饰，所以 aria-hidden。 */}
                              {current ? (
                                <>
                                  <span className="lesson__band paper-band" aria-hidden />
                                  <span className="lesson__blossom" aria-hidden>
                                    <Blossom size={15} />
                                  </span>
                                </>
                              ) : null}

                              <Ring label={lesson.id} current={current} />
                              <span className="lesson__names">
                                <span className="lesson__ja jp">
                                  <JaText text={shortJa(lesson)} />
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/** 课程标识：课次圆环。
 *  常态＝一道细描边空圈 + 淡墨数字；
 *  选中＝实心朱圆 + 纸色数字（稿子「选中状态」那一档）。 */
function Ring({ label, current }: { label: number; current: boolean }) {
  return (
    <span className="ring" data-tone={current ? "current" : "idle"}>
      <span className="ring__label mono">{label}</span>
    </span>
  );
}

/** 折卷的小箭头。 */
function Caret({ up }: { up: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d={up ? "M3.4 10.2L8 5.6l4.6 4.6" : "M3.4 5.8L8 10.4l4.6-4.6"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
