//! VOICEVOX 客户端。
//!
//! VOICEVOX 是本机另一个进程，我们只通过它的 REST 接口说话。合成要两步
//! （这是引擎的设计）：`POST /audio_query` 拿「怎么读」的参数表，
//! 改完语速再 `POST /synthesis` 换回 wav 字节。
//!
//! **排印空格不是读音。** 教材把全角空格（U+3000）放在文节之间——「李さんは　中国人です。」
//! ——那是给眼睛看的；VOICEVOX 却照它断句，每个空格配一次停顿（实测 0.3~0.4 秒），
//! 整句于是被读成一段一段的。所以文本要过两道：先按原文问一张表，再把空格收掉问一张；
//! 读数一样就用收掉空格那张（连贯），不一样才退回原文那张（把停顿压短）。见 `synthesize`。
//!
//! 不用 WebView2 的 `speechSynthesis`（语音列表恒为空）、也不用 Windows
//! 系统日语语音（要装语言包 + 管理员权限）——都实测过，走不通。

use serde::Deserialize;
use std::time::Duration;

use crate::voice::Speaker;

const DEFAULT_BASE: &str = "http://127.0.0.1:50021";

/// 健康检查要快：引擎没起来时界面得马上给出提示，不能让用户干等。
const PROBE_TIMEOUT_SECS: u64 = 3;
/// 合成本身慢一些，长句可能要几秒。
const SYNTH_TIMEOUT_SECS: u64 = 30;

/// 退回「原文（带排印空格）」那张参数表时，用来顶替停顿的长度（秒）。
///
/// 0.06 秒只是一口气：听不出「一段一段」，文节之间却还留着一条缝。
const SHORT_PAUSE_SECS: f64 = 0.06;

fn base_url() -> String {
    std::env::var("VOICEVOX_BASE_URL").unwrap_or_else(|_| DEFAULT_BASE.to_string())
}

fn client(secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(secs))
        .build()
        .map_err(|error| format!("建 HTTP 客户端失败：{error}"))
}

/// 教材排印用的空白（全角空格 U+3000、半角空格等）收掉之后的文本。
///
/// 教材拿空格分开文节——「今　市役所の　前を」——那是**给眼睛看的**，不是读音；
/// 交给引擎时留着，引擎会照着断句、每个空格配一次停顿，整句就成了「一段一段」。
fn without_layout_spaces(text: &str) -> String {
    text.chars().filter(|c| !c.is_whitespace()).collect()
}

/// 参数表里的读数：`kana` 去掉那几个**不是读音**的记号——
/// 停顿「、」、アクセント句边界「/」、アクセント核「'」、無声化「_」。
///
/// 只留假名本身。两张参数表比这个，才答得出「换个写法有没有把词读错」；
/// 语速、音高、句读都不该参与这个比较。
fn reading(query: &serde_json::Value) -> String {
    query["kana"]
        .as_str()
        .unwrap_or_default()
        .chars()
        .filter(|character| !matches!(character, '、' | '/' | '\'' | '_'))
        .collect()
}

/// 第一步：要一张参数表。第二步（合成）在 `synthesize` 里。
async fn audio_query(
    client: &reqwest::Client,
    text: &str,
    speaker: u32,
) -> Result<serde_json::Value, String> {
    client
        .post(format!("{}/audio_query", base_url()))
        .query(&[("text", text), ("speaker", &speaker.to_string())])
        .send()
        .await
        .map_err(|error| format!("连不上 VOICEVOX：{error}"))?
        .json()
        .await
        .map_err(|error| format!("解析 audio_query 失败：{error}"))
}

/// 把参数表里每一处停顿都压到 [`SHORT_PAUSE_SECS`]。
///
/// 这一步只在「收掉空格会读错词」时才走到（见 `synthesize`）。那几句里，标点的停顿
/// 会跟着空格一起变短——宁可少一点句读的顿挫，也不要每个空格一次 0.3 秒的大喘气。
fn with_short_pauses(mut query: serde_json::Value) -> serde_json::Value {
    if let Some(phrases) = query["accent_phrases"].as_array_mut() {
        for phrase in phrases {
            if let Some(pause) = phrase.get_mut("pause_mora") {
                if !pause.is_null() {
                    pause["vowel_length"] = serde_json::json!(SHORT_PAUSE_SECS);
                }
            }
        }
    }
    query
}

/// 引擎版本号。
///
/// 假引擎（形如 `0.0.0-mock`）长得和真的完全一样——界面显示「可用」、音色列表也有，
/// 只是合成出来是一声提示音。把版本号摆到界面上，一眼就知道在跟谁说话。
pub async fn version() -> Result<String, String> {
    let response = client(PROBE_TIMEOUT_SECS)?
        .get(format!("{}/version", base_url()))
        .send()
        .await
        .map_err(|error| format!("连不上 VOICEVOX：{error}"))?;

    if !response.status().is_success() {
        return Err(format!("VOICEVOX 返回 {}", response.status()));
    }

    response
        .json::<String>()
        .await
        .map_err(|error| format!("解析版本号失败：{error}"))
}

/// 引擎在不在。连不上就是不在，不是错误——界面靠这个决定显示哪套引导。
pub async fn health() -> bool {
    let Ok(client) = client(PROBE_TIMEOUT_SECS) else {
        return false;
    };
    matches!(
        client.get(format!("{}/version", base_url())).send().await,
        Ok(response) if response.status().is_success()
    )
}

#[derive(Deserialize)]
struct RawStyle {
    name: String,
    id: u32,
}

#[derive(Deserialize)]
struct RawSpeaker {
    name: String,
    styles: Vec<RawStyle>,
}

/// 列出可用角色。一个角色有多个风格，界面里是平铺的两级列表。
pub async fn speakers() -> Result<Vec<Speaker>, String> {
    let response = client(PROBE_TIMEOUT_SECS)?
        .get(format!("{}/speakers", base_url()))
        .send()
        .await
        .map_err(|error| format!("连不上 VOICEVOX：{error}"))?;

    if !response.status().is_success() {
        return Err(format!("VOICEVOX 返回 {}", response.status()));
    }

    let raw: Vec<RawSpeaker> = response
        .json()
        .await
        .map_err(|error| format!("解析角色列表失败：{error}"))?;

    Ok(raw
        .into_iter()
        .flat_map(|speaker| {
            speaker
                .styles
                .into_iter()
                .map(move |style| Speaker {
                    id: style.id,
                    name: speaker.name.clone(),
                    style: style.name,
                })
        })
        .collect())
}

/// 合成。返回 wav 字节。
pub async fn synthesize(text: &str, speaker: u32, speed: f32) -> Result<Vec<u8>, String> {
    let client = client(SYNTH_TIMEOUT_SECS)?;

    // ── 第一步：要参数表 ──
    //
    // 要两张：一张按原文问，一张把排印空格收掉再问。
    //
    // 空格不是读音，但引擎照着它断句、每个空格配一次停顿（实测 0.3~0.4 秒），
    // 「李さんは　JC企画の　社員です。」就被读成三段。所以**默认用收掉空格那张**：
    // 引擎自己分词、句读交给标点，整句是连贯的，标点的停顿一个不少。
    //
    // 敢用它的前提是「没有把词读错」：两张表的读数（`kana` 里的假名）一样才行。
    // 教材带空格的 560 句里 553 句一样；剩下的那几句，空格其实在替引擎分词
    // （「今　市役所」离了空格读成 いまいちやくしょ、「今　日本の」读成 こんにっぽん、
    // 「課長は　何と」读成 なにと）——那就退回原文那张表，读音照旧，只把停顿压短。
    let mut query = {
        let spaced = audio_query(&client, text, speaker).await?;
        let flat_text = without_layout_spaces(text);

        if flat_text == text {
            spaced
        } else {
            // 第二张问不到（理论上不会）就照原文念：宁可这一句多几处停顿，
            // 也不能因为它读不出来。读数对不上同样退回原文那张。
            match audio_query(&client, &flat_text, speaker).await {
                Ok(flat) if reading(&spaced) == reading(&flat) => flat,
                _ => with_short_pauses(spaced),
            }
        }
    };

    // ── 中间：改语速 ──
    // 学习者听的是「正常偏慢」，所以默认比引擎慢一档（0.9）。
    // 语速只在参数表里有意义，合成开始后就改不了了。
    query["speedScale"] = serde_json::json!(speed);

    // ── 第二步：合成 ──
    let response = client
        .post(format!("{}/synthesis", base_url()))
        .query(&[("speaker", &speaker.to_string())])
        .header("Content-Type", "application/json")
        .body(serde_json::to_vec(&query).map_err(|error| error.to_string())?)
        .send()
        .await
        .map_err(|error| format!("合成请求失败：{error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        return Err(format!("合成失败 {status}：{}", detail.trim()));
    }

    Ok(response
        .bytes()
        .await
        .map_err(|error| format!("读取音频失败：{error}"))?
        .to_vec())
}
