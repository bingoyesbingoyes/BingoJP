//! 朗读的**平台分派**。一套名字，两种实现：
//!
//!   · 桌面（Windows / macOS / Linux）：把朗读请求转发给本机 VOICEVOX（`tts.rs`），
//!     连不上时把随包引擎拉起来（`engine.rs`）。
//!   · Android：**整块暂不做**。随包引擎是 Windows 的 `run.exe`，手机上跑不了；
//!     手机自带的 TTS 又是另一套接口（要另立一条 `tts_*` 契约），不该混在这里。
//!
//! 命令名两边完全一致（命令本身在 `lib.rs`），前端不用按平台分支——Android 上真被
//! 调到，拿到的也是一句可读的说明（不静默、不是 panic）。前端在 Android 上不会调它：
//! 朗读入口整块不渲染（见 `src/features/voice/useTts.ts` 的 `enabled`）。
//!
//! 为什么整块 cfg 掉而不是让 `engine.rs` 在 Android 上跑：那一块做的事是
//! 「找 run.exe、`Command::spawn`、轮询端口」，在 Android 上每一条都是死路，
//! 留着只是把 reqwest / rustls / ring 一起拖进 APK 里编（几 MB 与几分钟）。
//!
//! 命令为什么留在 `lib.rs` 的根部、而不放在这里的子模块里：`#[tauri::command]` 会在
//! **函数所在的那个模块**里生成两个隐藏条目（`__cmd__*` / `__tauri_command_name_*`），
//! 而 `tauri::generate_handler![模块::函数]` 按同一路径去找它们。命令藏进子模块后
//! 再 `pub use` 出来，隐藏条目没有被一起带出来，展开时就找不到——所以命令一律在根部。

use serde::Serialize;

/// 一个可用音色：角色 + 风格平铺（VOICEVOX 一个角色有多个风格，界面里是两级列表）。
#[derive(Debug, Clone, Serialize)]
pub struct Speaker {
    /// 传给 `/synthesis` 的 speaker 参数
    pub id: u32,
    /// 角色名，如「四国めたん」
    pub name: String,
    /// 风格名，如「ノーマル」「あまあま」
    pub style: String,
}

#[cfg(not(target_os = "android"))]
mod imp {
    use super::Speaker;

    /// 确保引擎可用：已经在跑就返回版本号，否则拉起随包引擎并等它 ready。
    ///
    /// 前端启动 / 点重试 / 点句子时都会走这里；这是「不静默」的关键一步——
    /// 拉不起来时返回的是**可读的**失败原因（找过哪些路径、进程退出的状态码）。
    pub async fn start_engine() -> Result<String, String> {
        crate::engine::start_and_wait().await
    }

    /// 可用角色（name + style 平铺）。
    pub async fn speakers() -> Result<Vec<Speaker>, String> {
        crate::tts::speakers().await
    }

    /// 合成一段语音，返回 base64 的 wav。
    ///
    /// 走 base64 而不是写临时文件：短句的 wav 只有几十 KB，编码开销可以忽略，
    /// 前端拿到字节可以直接塞进 `<audio>` 播，不用配 asset 协议、不用管清理。
    pub async fn speak(text: &str, speaker: u32, speed: f32) -> Result<String, String> {
        use base64::Engine as _;

        let bytes = crate::tts::synthesize(text, speaker, speed).await?;
        Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
    }
}

#[cfg(target_os = "android")]
mod imp {
    use super::Speaker;

    /// Android 版暂无朗读。把「为什么」和「以后怎么接」一次说清，
    /// 免得用户看到的是一句查不动的「command not found」。
    ///
    /// 前端在 Android 上不会调到这里（朗读入口整块不渲染），这一份是给
    /// DevTools 里手敲 `invoke("tts_speak")` 的人看的。
    const NO_TTS: &str =
        "Android 版暂未接入朗读。桌面版读的是随包的 VOICEVOX 引擎（Windows 的 run.exe），\
         手机上没有这一份；后续可以改接系统 TTS，或把一份轻量语音模型打进 APK。";

    pub async fn start_engine() -> Result<String, String> {
        Err(NO_TTS.to_string())
    }

    pub async fn speakers() -> Result<Vec<Speaker>, String> {
        Err(NO_TTS.to_string())
    }

    pub async fn speak(_text: &str, _speaker: u32, _speed: f32) -> Result<String, String> {
        Err(NO_TTS.to_string())
    }
}

pub use imp::{speak, speakers, start_engine};
