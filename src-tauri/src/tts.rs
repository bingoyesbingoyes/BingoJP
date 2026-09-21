//! VOICEVOX 客户端。
//!
//! VOICEVOX 是本机另一个进程，我们只通过它的 REST 接口说话。合成要两步
//! （这是引擎的设计）：`POST /audio_query` 拿「怎么读」的参数表，
//! 改完语速再 `POST /synthesis` 换回 wav 字节。
//!
//! 不用 WebView2 的 `speechSynthesis`（语音列表恒为空）、也不用 Windows
//! 系统日语语音（要装语言包 + 管理员权限）——都实测过，走不通。

use serde::{Deserialize, Serialize};
use std::time::Duration;

const DEFAULT_BASE: &str = "http://127.0.0.1:50021";

/// 健康检查要快：引擎没起来时界面得马上给出提示，不能让用户干等。
const PROBE_TIMEOUT_SECS: u64 = 3;
/// 合成本身慢一些，长句可能要几秒。
const SYNTH_TIMEOUT_SECS: u64 = 30;

#[derive(Debug, Clone, Serialize)]
pub struct Speaker {
    /// 传给 `/synthesis` 的 speaker 参数
    pub id: u32,
    /// 角色名，如「四国めたん」
    pub name: String,
    /// 风格名，如「ノーマル」「あまあま」
    pub style: String,
}

fn base_url() -> String {
    std::env::var("VOICEVOX_BASE_URL").unwrap_or_else(|_| DEFAULT_BASE.to_string())
}

fn client(secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(secs))
        .build()
        .map_err(|error| format!("建 HTTP 客户端失败：{error}"))
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
    let query: serde_json::Value = client
        .post(format!("{}/audio_query", base_url()))
        .query(&[("text", text), ("speaker", &speaker.to_string())])
        .send()
        .await
        .map_err(|error| format!("连不上 VOICEVOX：{error}"))?
        .json()
        .await
        .map_err(|error| format!("解析 audio_query 失败：{error}"))?;

    // ── 中间：改语速 ──
    // 学习者听的是「正常偏慢」，所以默认比引擎慢一档（0.9）。
    // 语速只在参数表里有意义，合成开始后就改不了了。
    let mut query = query;
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
