//! 随包 VOICEVOX 引擎的探测、拉起与关闭。
//!
//! reader 是自足的：`reader/VOICEVOX/` 里带着一整份引擎。启动 / 点重试时先看
//! `127.0.0.1:50021` 通不通；不通就按候选路径找到 `vv-engine/run.exe`，把它拉起来
//! 再等它 ready。
//!
//! 只关**我们自己拉起的**那个进程：用户全局装了一个正开着的 VOICEVOX 时，
//! 探活直接成功，我们根本不会走到拉分支，自然也不会去杀别人的进程。

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use crate::tts;

/// 自足包里引擎相对 reader 根目录的位置。
const ENGINE_REL: &str = "VOICEVOX/vv-engine/run.exe";

/// 拉起来之后最多等这么久。CPU 版要加载几个模型，十几秒是常态。
const READY_TIMEOUT: Duration = Duration::from_secs(45);
const POLL_INTERVAL: Duration = Duration::from_millis(500);

struct Managed {
    exe: PathBuf,
    child: Child,
}

static MANAGED: OnceLock<Mutex<Option<Managed>>> = OnceLock::new();

fn slot() -> &'static Mutex<Option<Managed>> {
    MANAGED.get_or_init(|| Mutex::new(None))
}

/// 引擎候选路径，按优先级排。
///
/// 为什么不写死一个绝对路径：`reader/` 要能整个拷到别处直接用，
/// 所以按「可执行文件往上找 → 工作目录往上找 → 编译期路径兜底」的顺序来。
fn candidates() -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();

    // 1) 环境变量：允许给 run.exe，也允许给目录
    if let Ok(value) = std::env::var("VOICEVOX_ENGINE_PATH") {
        let value = value.trim();
        if !value.is_empty() {
            let path = PathBuf::from(value);
            out.push(if path.is_dir() { path.join("run.exe") } else { path });
        }
    }

    // 2) dev / 便携运行：从 exe 所在目录往上找
    //    dev 时 exe 在 reader/src-tauri/target/debug/，往上第四层就是 reader/
    if let Ok(exe) = std::env::current_exe() {
        for ancestor in exe.ancestors().skip(1) {
            out.push(ancestor.join(ENGINE_REL));
        }
    }

    // 3) 从当前工作目录往上找（用户可能就在 reader/ 下敲 npm run app）
    if let Ok(cwd) = std::env::current_dir() {
        for ancestor in cwd.ancestors() {
            out.push(ancestor.join(ENGINE_REL));
        }
    }

    // 4) 编译期记下的路径。只有在本仓库里开发时才有意义，装到别处不会命中。
    if let Some(reader) = Path::new(env!("CARGO_MANIFEST_DIR")).parent() {
        out.push(reader.join(ENGINE_REL));
    }

    let mut seen = HashSet::new();
    out.retain(|path| seen.insert(path.clone()));
    out
}

pub fn find_engine() -> Option<PathBuf> {
    candidates().into_iter().find(|path| path.is_file())
}

fn searched() -> String {
    candidates()
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join("\n  ")
}

fn spawn(exe: &Path) -> Result<(), String> {
    let mut command = Command::new(exe);
    command
        .args(["--host", "127.0.0.1", "--port", "50021"])
        .current_dir(exe.parent().unwrap_or_else(|| Path::new(".")))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    // 不弹控制台窗口。引擎自己会往 stderr 打日志，上面已经接到 null 了。
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let child = command
        .spawn()
        .map_err(|error| format!("拉起 {} 失败：{error}", exe.display()))?;

    *slot().lock().expect("引擎状态锁中毒") = Some(Managed {
        exe: exe.to_path_buf(),
        child,
    });
    Ok(())
}

/// 之前拉起过的进程如果已经退出，就把句柄清掉，免得拦着下一次重启。
fn clear_dead() {
    let mut guard = slot().lock().expect("引擎状态锁中毒");
    let dead = match guard.as_mut() {
        Some(managed) => matches!(managed.child.try_wait(), Ok(Some(_)) | Err(_)),
        None => false,
    };
    if dead {
        *guard = None;
    }
}

/// 确保引擎可用：已经在跑就直接返回版本号，否则拉起随包引擎并等它 ready。
pub async fn start_and_wait() -> Result<String, String> {
    // 外部已经开着一个（全局安装的，或我们上次拉起后没退的）
    if tts::health().await {
        return tts::version().await;
    }

    clear_dead();

    let need_spawn = slot().lock().expect("引擎状态锁中毒").is_none();
    if need_spawn {
        let exe = find_engine().ok_or_else(|| {
            format!(
                "没找到随包的 VOICEVOX 引擎。找过这些位置：\n  {}\n\
                 也可以设环境变量 VOICEVOX_ENGINE_PATH 指向 vv-engine/run.exe。",
                searched()
            )
        })?;
        spawn(&exe)?;
    }

    let steps = (READY_TIMEOUT.as_millis() / POLL_INTERVAL.as_millis()) as usize;
    for _ in 0..steps {
        tokio::time::sleep(POLL_INTERVAL).await;

        if tts::health().await {
            return tts::version().await;
        }

        // 进程起来就秒退（比如端口被占、模型缺失）时别干等到超时
        let dead = {
            let mut guard = slot().lock().expect("引擎状态锁中毒");
            match guard.as_mut() {
                Some(managed) => match managed.child.try_wait() {
                    Ok(Some(status)) => Some((managed.exe.display().to_string(), status.to_string())),
                    _ => None,
                },
                None => None,
            }
        };
        if let Some((exe, status)) = dead {
            *slot().lock().expect("引擎状态锁中毒") = None;
            return Err(format!("VOICEVOX 引擎（{exe}）起来后立刻退出了：{status}"));
        }
    }

    Err(format!(
        "VOICEVOX 引擎已经拉起来了，但 {} 秒内没准备好。",
        READY_TIMEOUT.as_secs()
    ))
}

/// 退出时把随包引擎关掉。用户自己开着的引擎不归我们管，`slot()` 里没有它。
pub fn shutdown() {
    let Some(mutex) = MANAGED.get() else {
        return;
    };
    let Ok(mut guard) = mutex.lock() else {
        return;
    };
    if let Some(mut managed) = guard.take() {
        let _ = managed.child.kill();
        let _ = managed.child.wait();
    }
}
