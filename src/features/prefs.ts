/** 阅读与朗读偏好，逐字段回退默认值。
 *  默认：注音开（读物主线）、中文关（先看日语）、生词表展开、音色＝第一个可用。
 *  注音固定平假名、语速固定，所以没有这两个字段；
 *  配色只有一套（见 tokens.css），所以也没有这个字段。
 */

import { useCallback, useEffect, useState } from "react";
import type { Prefs } from "./types";

const KEY = "bingojp.prefs";

const DEFAULT_PREFS: Prefs = {
  showReading: true,
  showZh: false,
  voiceId: null,
  railOpen: true,
  vocabOpen: true,
};

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    // 逐字段取，不要整体展开：旧存档少字段时才能自动补上默认值。
    return {
      // 默认是 true，判断要反过来写：只有明确存成 false 才算关。
      showReading: parsed.showReading !== false,
      showZh: parsed.showZh === true,
      voiceId: typeof parsed.voiceId === "number" ? parsed.voiceId : null,
      // 默认展开：只有明确存成 false 才算收起。
      railOpen: parsed.railOpen !== false,
      // 默认展开：一进来就该看见本课的词，注音压在词上——这是这本读物的主线。
      vocabOpen: parsed.vocabOpen !== false,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* 隐私模式下写不了，不影响使用 */
    }
  }, [prefs]);

  const update = useCallback(
    (patch: Partial<Prefs>) => setPrefs((value) => ({ ...value, ...patch })),
    [],
  );

  return { prefs, update };
}
