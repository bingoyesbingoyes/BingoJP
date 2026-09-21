/** 「已记住」标记：右键一条词划掉它，再右键恢复；存在 localStorage。
 *
 * 键按内容拼（课次 + 假名 + 写法）而不是行号：数据重抽后行序会变，行号会让标记串词。
 */

import { useCallback, useEffect, useState } from "react";
import type { VocabWord } from "./types";

const KEY = "bingoreader.memorized";

export function wordKey(lessonId: number, word: VocabWord): string {
  const text = word.word.map((seg) => seg.t).join("");
  return `${lessonId}|${word.kana}|${text}`;
}

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

export function useMemorized() {
  const [keys, setKeys] = useState<Set<string>>(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...keys]));
    } catch {
      /* 隐私模式下写不了，不影响本次会话 */
    }
  }, [keys]);

  const toggle = useCallback((key: string) => {
    setKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return { keys, toggle };
}
