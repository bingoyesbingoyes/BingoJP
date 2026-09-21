/** 课程数据的载入与查询。两本 JSON 由 Vite 在构建期内联进 bundle——本地优先，不联网取数据。
 *
 * 用**具名导入**而不是默认导入：Vite 把大 JSON 编译成 `export const lessons = ...`，
 * 默认导入拿到的不是那个对象。
 */

import { lessons as rawLessons } from "../../data/lessons.json";
import { lessons as rawVocab } from "../../data/vocab.json";
import type { Lesson, Seg, VocabLesson } from "./types";

const allLessons = rawLessons as unknown as Lesson[];
const allVocab = rawVocab as unknown as VocabLesson[];

const lessonIndex = new Map(allLessons.map((lesson) => [lesson.id, lesson]));
const vocabIndex = new Map(allVocab.map((lesson) => [lesson.id, lesson]));

export function lessonById(id: number): Lesson {
  const lesson = lessonIndex.get(id);
  if (!lesson) throw new Error(`没有第 ${id} 课`);
  return lesson;
}

/** 本课生词表。数据里 48 课齐，查不到就是真出问题了。 */
export function vocabById(id: number): VocabLesson {
  const lesson = vocabIndex.get(id);
  if (!lesson) throw new Error(`第 ${id} 课没有生词表`);
  return lesson;
}

interface UnitGroup {
  part: "upper" | "lower";
  unit: number;
  lessons: Lesson[];
}

/** 课程地图：按单元分组，每组 4 课，顺序与教材一致。 */
export function lessonsByUnit(): UnitGroup[] {
  const groups = new Map<number, UnitGroup>();
  for (const lesson of allLessons) {
    let group = groups.get(lesson.unit);
    if (!group) {
      group = { part: lesson.part, unit: lesson.unit, lessons: [] };
      groups.set(lesson.unit, group);
    }
    group.lessons.push(lesson);
  }
  return [...groups.values()];
}

/** 片段序列 → 纯文本。朗读文本也用它（`ja` 里已经不含句首说话人）。 */
export function segText(segs: Seg[]): string {
  return segs.map((seg) => seg.t).join("");
}
