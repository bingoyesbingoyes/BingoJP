/** 朗读：走 Rust 侧的 VOICEVOX 代理。引擎的拉起与关闭都在 Rust，前端只在
 *  起不来时把**可读的原因**摆出来（不静默）。
 *
 * 与主项目 useTts 的差别：没有自动朗读（这里是点读）；语速固定 0.9、不做双重变速；
 * 提示不自动消失，配重试按钮；音频缓存只在内存里。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Speaker, TtsHealth } from "../types";

/** 固定语速。0.9 是「正常偏慢」——学语言听这个比听 1.0 舒服；不给用户调。 */
const SPEECH_RATE = 0.9;

/** base64 wav → 可播放的 object URL */
function toObjectUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useTts({ voiceId }: { voiceId: number | null }) {
  const [health, setHealth] = useState<TtsHealth>("unknown");
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  /** 引擎版本号。假的 VOICEVOX 会报 0.0.0-mock，设置里要显出来。 */
  const [version, setVersion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  /** 引擎起不来 / 合成失败的说明。不自动消失。 */
  const [notice, setNotice] = useState<string | null>(null);

  // speak / ensureEngine 会在 await 之后读这些值，state 闭包会过期，所以各留一份 ref
  const healthRef = useRef<TtsHealth>("unknown");
  const speakersRef = useRef<Speaker[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** 缓存键 → object URL。重播秒开，切课不清空。 */
  const cacheRef = useRef(new Map<string, string>());
  /** 每次请求发一个号，回来时对不上就丢弃——防止「快速连点，旧的盖住新的」。 */
  const tokenRef = useRef(0);
  /** 正在拉起引擎的那次 promise。挂载探活和「点的第一句」可能同时到，要合流。 */
  const startingRef = useRef<Promise<Speaker[] | null> | null>(null);

  /**
   * 确保引擎可用。已经在跑就直接给音色表；否则拉起随包引擎（Rust 侧等它 ready）。
   * 失败时返回 null 并把原因写进 notice。
   */
  const ensureEngine = useCallback(async (quiet = false): Promise<Speaker[] | null> => {
    if (healthRef.current === "ready") return speakersRef.current;
    if (startingRef.current) return startingRef.current;

    const task = (async () => {
      healthRef.current = "starting";
      setHealth("starting");
      try {
        const engineVersion = await invoke<string>("voicevox_start_engine");
        // 一起取，免得「显示可用但没有音色」这种半吊子状态
        const list = await invoke<Speaker[]>("voicevox_speakers");
        speakersRef.current = list;
        setSpeakers(list);
        setVersion(engineVersion);
        healthRef.current = "ready";
        setHealth("ready");
        setNotice(null);
        return list;
      } catch (error) {
        healthRef.current = "offline";
        setHealth("offline");
        setVersion("");
        // 启动时静默失败：用户还没要求出声，不该一开窗就顶一条错误；
        // 等他点句子 / 点重试时再把这个原因摆出来。
        if (!quiet) setNotice(`没能启动朗读引擎。${reason(error)}`);
        return null;
      } finally {
        startingRef.current = null;
      }
    })();

    startingRef.current = task;
    return task;
  }, []);

  // 启动就确保一次：引擎没开就自己拉起来，用户不用管。
  // quiet：启动阶段失败不弹提示，等用户真的要出声时再说。
  useEffect(() => {
    void ensureEngine(true);
  }, [ensureEngine]);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
    setPending(null);
  }, []);

  // 组件卸载时不该还有声音在响
  useEffect(() => () => stop(), [stop]);

  const speak = useCallback(
    async (key: string, text: string) => {
      if (!text.trim()) return;

      // 同一条正在播 → 再点就是停
      if (playing === key) {
        stop();
        return;
      }

      stop();
      const token = tokenRef.current;

      // 引擎没就绪就现场拉一次；期间界面显示「正在启动」
      const list = healthRef.current === "ready" ? speakersRef.current : await ensureEngine();
      if (!list) return;
      // 等引擎的时候用户又点了别的 → 让后来的那次说了算
      if (token !== tokenRef.current) return;

      const speaker = voiceId ?? list[0]?.id;
      if (speaker === undefined) {
        setNotice("VOICEVOX 里一个音色都没有。装上至少一个音声再试。");
        return;
      }

      const audio = new Audio();
      audioRef.current = audio;
      audio.addEventListener("ended", () =>
        setPlaying((current) => (current === key ? null : current)),
      );

      // 音色进缓存键：换了音色，旧音色的 wav 不能再被拿出来播。
      const cacheKey = `${key}#${speaker}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        audio.src = cached;
        setPlaying(key);
        void audio.play().catch(() => setPlaying(null));
        return;
      }

      setPending(key);
      try {
        const base64 = await invoke<string>("tts_speak", {
          text,
          speaker,
          speed: SPEECH_RATE,
        });
        if (token !== tokenRef.current) return;

        const url = toObjectUrl(base64);
        cacheRef.current.set(cacheKey, url);
        audio.src = url;
        setPlaying(key);
        setNotice(null);
        void audio.play().catch(() => setPlaying(null));
      } catch (error) {
        setNotice(`朗读失败：${reason(error)}`);
      } finally {
        if (token === tokenRef.current) setPending(null);
      }
    },
    [ensureEngine, playing, stop, voiceId],
  );

  const probe = useCallback(
    () => ensureEngine().then((list) => list !== null),
    [ensureEngine],
  );
  const dismiss = useCallback(() => setNotice(null), []);

  return {
    health,
    speakers,
    version,
    pending,
    playing,
    notice,
    probe,
    speak,
    stop,
    dismiss,
  };
}
