/** 课程地图（目次）：上册 1–24（第 1–6 单元）/ 下册 25–48（第 7–12 单元）。
 *
 *  它是**扉页**：摊在卷面左侧、贴着木轴的缝。2.png 里这一页最上方不是「目次」
 *  两个字，而是一枚大字**読む**加一方小朱印（訓読み）。整页会滑入滑出——
 *  收起时宽度收到 0、内容向左滑进木轴里，卷面就整幅让给课文；
 *  抓手不在这页上，而是卷面左缘那枚常驻页签（见 ScrollChrome 的 EdgeTab）。
 *
 *  课程标识（圆环 + 课名两行）也照 2.png：
 *   · 当前课＝**实心朱砂圆**（白字）＋ 身后一道淡朱笔扫；
 *   · 其余课＝一道细描边空心圆。
 *
 *  这里是读物，**48 课全部可点、没有上锁**——教材数据是齐的，不需要锁。 */

import { lessonsByUnit, segText } from "../features/data";
import type { Lesson } from "../features/types";
import { SealRing } from "./Seal";
import "./LessonRail.css";

const PART_LABEL: Record<Lesson["part"], string> = {
  upper: "初級上",
  lower: "初級下",
};

/** 列表里不必重复圆环上的课次，所以把标题开头的「第N課　」剥掉。 */
function shortJa(lesson: Lesson): string {
  const text = segText(lesson.title_ja);
  const prefix = `第${lesson.id}課`;
  return (text.startsWith(prefix) ? text.slice(prefix.length) : text).replace(/^[\u3000 ]+/, "");
}

function shortZh(lesson: Lesson): string {
  const prefix = `第${lesson.id}课`;
  const text = lesson.title_zh.startsWith(prefix) ? lesson.title_zh.slice(prefix.length) : lesson.title_zh;
  return text.replace(/^[\u3000 ]+/, "");
}

interface LessonRailProps {
  currentId: number;
  onSelect: (id: number) => void;
  /** 展开着没有。收起＝整页滑进木轴（宽度归零），卷面左缘的页签负责拉回来。 */
  open: boolean;
  /** 收起这一页。入口在页脚——页签只在收起后才出现。 */
  onToggle: () => void;
}

export function LessonRail({ currentId, onSelect, open, onToggle }: LessonRailProps) {
  const groups = lessonsByUnit().map((group, index, all) => ({
    ...group,
    newPart: index === 0 || all[index - 1].part !== group.part,
  }));

  return (
    /* 外层只管「多宽」，内层只管「滑到哪」：宽度从当前值重新出发、
       位移也从当前值重新出发，中途打断既不跳也不回弹。 */
    <nav className="rail" data-open={open || undefined} aria-label="课程地图" inert={!open}>
      <div className="rail__inner">
        {/* 扉页头：一枚大字書名 + 一方帶读法的朱印（2.png 的「読む / 訓読み」） */}
        <header className="rail__head">
          <span className="rail__brand jp">読む</span>
          <span className="rail__seal" aria-hidden>
            <span className="rail__seal-text jp">訓読み</span>
          </span>
        </header>

        <div className="rail__scroll scroll">
          {groups.map((group) => (
            <section className="rail__unit" key={group.unit}>
              {group.newPart ? <p className="rail__part t-label">{PART_LABEL[group.part]}</p> : null}

              <h2 className="rail__unit-name">
                <span className="rail__unit-tag">第 {group.unit} 単元</span>
                <span className="rail__unit-rule" aria-hidden />
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
                        <Ring label={lesson.id} current={current} />
                        <span className="lesson__names">
                          <span className="lesson__ja jp">{shortJa(lesson)}</span>
                          <span className="lesson__zh">{shortZh(lesson)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {/* 页脚：只剩「收起」一枚。与生词页那一枚是**同一件东西**——
            同高、同宽、同一套 hover（样式在 App.css 的 .panel-foot），
            两枚键于是并排落在纸的最下沿。 */}
        <footer className="panel-foot rail__foot">
          <button
            type="button"
            className="panel-foot__btn"
            onClick={onToggle}
            aria-label="收起目次"
          >
            <ChevronLeftIcon />
          </button>
        </footer>
      </div>
    </nav>
  );
}

/** 课程标识：课次圆环。
 *  当前课＝实心朱砂圆 + 白字（花边外圈与 2.png 的朱印同族）；
 *  其余课＝一道细描边空心圆 + 淡墨数字。 */
function Ring({ label, current }: { label: number; current: boolean }) {
  const size = 27;

  return (
    <span className="ring" data-tone={current ? "current" : "idle"} style={{ width: size, height: size }}>
      {current ? (
        <span className="ring__seal" aria-hidden>
          <SealRing filled petals={14} amplitude={2.2} />
        </span>
      ) : null}
      <span className="ring__label mono">{label}</span>
    </span>
  );
}

/** 收起：目次页在左，收起＝向左滑走，所以箭头指向左。 */
function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M10 3.5L5.5 8L10 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
