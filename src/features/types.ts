/** BingoReader 的数据契约。字段名与 `reader/data/*.json` 一一对应（由
 *  `reader/scripts/extract_epub.py` 生成，`check_data.py` 把关）。
 *
 *  不引运行时 schema 校验：数据是构建期由本地脚本生成的，形状在生成时就验过，
 *  前端只声明类型、不再重复一遍。类型对不上时 `tsc -b` 会先报。
 */

/** 一段文本。`r` 有值＝这段带读音（会渲染成 `<ruby>`）。 */
export interface Seg {
  t: string;
  r?: string;
}

export interface Sentence {
  /** 日文正文（句首说话人已剥掉，见 `speaker`） */
  ja: Seg[];
  /** 中文译文（同样剥掉句首说话人） */
  zh: string;
  /** 「李」「Ａ　甲」这类句首说话人；没有就是 null */
  speaker: string | null;
}

interface Section {
  /** 节名，如「基本课文」「应用课文」 */
  title_ja: Seg[];
  /** 「应用课文」后面的小标题（如「出迎え」）；其余两节为 null */
  subtitle_ja: Seg[] | null;
  title_zh: string;
  sentences: Sentence[];
}

export interface Lesson {
  id: number;
  part: "upper" | "lower";
  unit: number;
  title_ja: Seg[];
  title_zh: string;
  sections: Section[];
}

/** 生词表假名栏的一段。`mark` 为 null＝不在声调块内。 */
interface KanaRun {
  t: string;
  mark: "accent" | "accent0" | null;
}

export interface VocabWord {
  word: Seg[];
  kana: string;
  kana_runs: KanaRun[];
  pos: string;
  zh: string;
}

export interface VocabLesson {
  id: number;
  /** 表头声明的词数，应与 words.length 一致 */
  declared_count: number;
  words: VocabWord[];
}

/** VOICEVOX 的一个可用音色（角色 + 风格平铺）。 */
export interface Speaker {
  id: number;
  name: string;
  style: string;
}

/** 注音固定用平假名，不提供切换——少一个按钮，也少一个要记的状态。 */

export interface Prefs {
  /** 汉字上方标读音。默认开——这是读物，注音是主线。 */
  showReading: boolean;
  /** 句下给一行中文译文。默认关：一上来就摆中文，眼睛就不会落在日语上。 */
  showZh: boolean;
  /** VOICEVOX speaker id；null＝用第一个可用音色 */
  voiceId: number | null;
  /** 目次页展开着没有。默认展开——一进来就该看见整册的课。 */
  railOpen: boolean;
  /** 生词表展开着没有。默认收起。 */
  vocabOpen: boolean;
}

/* 配色**不是偏好**：只有一套，取自 2.png，写在 tokens.css 里。
   它不进存档，也就没有「用户选了哪套」这个状态可记。 */

/** `starting` ＝ 正在拉起随包引擎（CPU 版加载模型要十几秒），不是错误状态。 */
export type TtsHealth = "unknown" | "starting" | "ready" | "offline";

/** 朗读这件事对界面的接口。课文与生词表都要，所以在类型层定一次。
 *  只暴露「谁在播 / 谁在合成 / 出没出错」——不再有播放进度：
 *  界面里不收进度条。 */
export interface SpeechControls {
  /** 正在播的 key（句子/词条各有一套 key） */
  playing: string | null;
  /** 正在合成的 key */
  pending: string | null;
  /** 引擎离线 / 合成失败的说明；null＝没问题 */
  notice: string | null;
  speak: (key: string, text: string) => Promise<void>;
  probe: () => Promise<boolean>;
  dismiss: () => void;
}

