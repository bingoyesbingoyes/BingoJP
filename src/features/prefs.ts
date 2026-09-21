/** 阅读与朗读偏好，存档带版本号、逐字段回退默认值。
 *  默认：注音开（读物主线）、中文关（先看日语）、生词表收起、音色＝第一个可用。
 *  注音固定平假名、语速固定，所以没有这两个字段；
 *  配色只有一套（取自 2.png，见 tokens.css），所以也没有这个字段。
 */

import { useCallback, useEffect, useState } from "react";
import type { Prefs } from "./types";

const KEY = "bingoreader.prefs";

/** 存档版本。**改了默认值就要 +1**，否则旧存档里的旧默认值会被当成用户的选择。
 *  v2：去掉 script / speechRate（这两个不再可调）。
 *  v3：深色主题改成品色三选一，新增 style（默认 mizu）。
 *  v4：三套浅色改成三套和纸（生成/桜/藍墨），旧键 mizu→kinari、sumi→aizumi。
 *  v5：目次页的展开状态入档（异形卷窗后它也会滑进滑出，值得记住）。
 *  v6：配色固定为 2.png 那一套，style 字段退场（旧存档里多出来的键会被忽略）。
 */
const PREFS_VERSION = 6;

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
    const parsed = JSON.parse(raw) as Partial<Prefs> & { version?: number };
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
      localStorage.setItem(KEY, JSON.stringify({ ...prefs, version: PREFS_VERSION }));
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
