//! BingoReader 的 Tauri 后端。
//!
//! 两件事：
//!   · 把前端的朗读请求转发给**本机 VOICEVOX**（`tts.rs`）；
//!   · 连不上时把 reader 里随包带的那份引擎拉起来、退出时关掉（`engine.rs`）。
//!
//! 课程数据、注音、生词表、阅读偏好全在前端——那些本质上是内容，
//! 和数据放在一起才好改；Rust 这边不需要知道第几课、读了哪一句。
//!
//! 与主项目 BingoJapan 的关系：这里**只用** TTS 那一小块，whisper / 语音输入 /
//! LLM 都不在。所以依赖表里没有 cpal / whisper-rs / vad-rs，也不需要 CUDA 环境。

mod engine;
pub mod tts;

use base64::Engine;

/// 确保引擎可用：已经在跑就返回版本号，否则拉起随包引擎并等它 ready。
///
/// 前端启动 / 点重试 / 点句子时都会走这里；这是「不静默」的关键一步——
/// 拉不起来时返回的是**可读的**失败原因（找过哪些路径、进程退出的状态码）。
#[tauri::command]
async fn voicevox_start_engine() -> Result<String, String> {
    engine::start_and_wait().await
}

/// 可用角色（name + style 平铺）。一个角色有多个风格，界面里是两级列表。
#[tauri::command]
async fn voicevox_speakers() -> Result<Vec<tts::Speaker>, String> {
    tts::speakers().await
}

/// 合成一段语音，返回 base64 的 wav。
///
/// 走 base64 而不是写临时文件：短句的 wav 只有几十 KB，编码开销可以忽略，
/// 前端拿到字节可以直接塞进 `<audio>` 播，不用配 asset 协议、不用管清理。
#[tauri::command]
async fn tts_speak(text: String, speaker: u32, speed: f32) -> Result<String, String> {
    let bytes = tts::synthesize(&text, speaker, speed).await?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            voicevox_start_engine,
            voicevox_speakers,
            tts_speak,
        ])
        .build(tauri::generate_context!())
        .expect("启动 Tauri 失败");

    app.run(|_handle, event| {
        // 只关我们自己拉起来的那个引擎进程；用户自己开着的全局 VOICEVOX 不碰。
        if let tauri::RunEvent::Exit = event {
            engine::shutdown();
        }
    });
}

