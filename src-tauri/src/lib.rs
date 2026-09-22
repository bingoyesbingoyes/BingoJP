//! BingoJP 的 Tauri 后端。
//!
//! 两件事：
//!   · 把前端的朗读请求转发给**本机 VOICEVOX**（`tts.rs`）；
//!   · 连不上时把 reader 里随包带的那份引擎拉起来、退出时关掉（`engine.rs`）。
//!
//! 课程数据、注音、生词表、阅读偏好全在前端——那些本质上是内容，
//! 和数据放在一起才好改；Rust 这边不需要知道第几课、读了哪一句。
//!
//! **Android 版暂时不接朗读**：随包引擎是 Windows 的 `run.exe`，手机上跑不了。
//! 所以 `engine` / `tts` 两个模块只在桌面编译，命令面由 `voice.rs` 给一份
//! 「可读的拒绝」；reqwest / rustls / base64 也不进 Android 的依赖图（见 Cargo.toml）。
//! 前端在 Android 上整块不渲染朗读入口，这三条命令根本不会被调到。
//!
//! 与主项目 BingoJapan 的关系：这里**只用** TTS 那一小块，whisper / 语音输入 /
//! LLM 都不在。所以依赖表里没有 cpal / whisper-rs / vad-rs，也不需要 CUDA 环境。

#[cfg(not(target_os = "android"))]
mod engine;

#[cfg(not(target_os = "android"))]
pub mod tts;

pub mod voice;

/// 确保引擎可用：已经在跑就返回版本号，否则拉起随包引擎并等它 ready。
/// Android 上返回的是一句可读的「暂不支持」（见 `voice.rs`）。
#[tauri::command]
async fn voicevox_start_engine() -> Result<String, String> {
    voice::start_engine().await
}

/// 可用角色（name + style 平铺）。一个角色有多个风格，界面里是两级列表。
#[tauri::command]
async fn voicevox_speakers() -> Result<Vec<voice::Speaker>, String> {
    voice::speakers().await
}

/// 合成一段语音，返回 base64 的 wav。
///
/// 走 base64 而不是写临时文件：短句的 wav 只有几十 KB，编码开销可以忽略，
/// 前端拿到字节可以直接塞进 `<audio>` 播，不用配 asset 协议、不用管清理。
#[tauri::command]
async fn tts_speak(text: String, speaker: u32, speed: f32) -> Result<String, String> {
    voice::speak(&text, speaker, speed).await
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

    // 参数一律带下划线：Android 那一支整段 cfg 掉，`_handle` / `_event` 就都不曾被读，
    // 不带下划线会在交叉编译时冒出两条 unused warning（桌面分支照样读得到它们）。
    app.run(|_handle, _event| {
        // 只关我们自己拉起来的那个引擎进程；用户自己开着的全局 VOICEVOX 不碰。
        #[cfg(not(target_os = "android"))]
        if let tauri::RunEvent::Exit = _event {
            engine::shutdown();
        }
    });
}
