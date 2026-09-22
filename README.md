# BingoJP

> 可点读的离线日语读物，《新版中日交流标准日本语》初级上下册。
> An offline, tap-to-listen reader for the *New Standard Japanese* beginner textbooks.

**中文**　48 课 / 2000+ 词条，点句子即读（本机 VOICEVOX）、汉字注音、可开关中文译文、按课生词表。
界面取自和纸古卷：无边框透明异形窗，目次 / 课文 / 生词三栏如卷轴般滑入滑出。

**English**　48 lessons and 2,000+ words: tap a sentence to hear it (local VOICEVOX), furigana over
kanji, a toggleable Chinese translation, and a per-lesson vocabulary list. The UI borrows the look of a
washi scroll — a borderless, transparent, non-rectangular window whose three panels (contents / text /
vocabulary) slide in and out like an unrolling scroll.

**中文**　另有 **Android 版**（Tauri 2 的 Android 目标，同一套前端）：手机上三栏折成一栏，目次与生词表
变成盖在正文上的抽屉，卷面、撕口、页签、两枚纸片都留着；**这一版暂不接朗读**（随包引擎是 Windows 的
`run.exe`），见下面「Android」一节。

**English**　There is also an **Android build** (Tauri 2's Android target, same frontend): on a phone the
three columns fold into one, with the contents and vocabulary pages becoming drawers over the text while
the paper, its torn edges, the bookmarks and the two paper scraps stay. **Read-aloud is left out of this
one** (the bundled engine is a Windows `run.exe`) — see the Android section below.

## 环境要求 · Requirements

- 中文：Node 20.19+ 或 22.12+（Vite 7 要求；本仓库用 22）与 Rust stable
  EN: Node 20.19+ or 22.12+ (required by Vite 7; this repo uses 22) and Rust stable
- 中文：Tauri 2 依赖——Windows 需 MSVC Build Tools + WebView2（Win11 自带）
  EN: Tauri 2 prerequisites — on Windows, MSVC Build Tools + WebView2 (bundled with Win11)
- 中文：VOICEVOX 引擎（随包，见下）　EN: a VOICEVOX engine (bundled, see below)
- 中文：Python 3.11 + `lxml`，仅在重建课程数据时用到
  EN: Python 3.11 + `lxml`, only needed to rebuild the lesson data
- 中文：**只在打 Android 包时需要**——Android SDK（platform 36 + build-tools）、NDK、JDK 17+，
  以及四个 Rust 目标 `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`
  EN: **only needed to build for Android** — the Android SDK (platform 36 + build-tools), the NDK, JDK 17+,
  and the four Rust targets `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`

## 快速开始 · Quick start

```bash
npm install
npm run app        # tauri dev：拉起桌面应用 / launch the desktop app
```

| 命令 Command | 作用 Purpose |
| --- | --- |
| `npm run app` / `npm run app:build` | Tauri 开发 / 打包（NSIS）· dev / bundle (NSIS) |
| `npm run dev` | 只跑 Vite（http://localhost:5275）· Vite only |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run android:debug` | Android 调试包（调试密钥自动签，直接能装）· debug APK, installable as-is |
| `npm run android` | Android 发布包（需签名配置，见下）· release APK (needs the signing config below) |
| `npm run data` | 从 EPUB 重建 `data/*.json` · rebuild data from EPUB |
| `npm run check` | 校验课程数据 · validate the lesson data |

## Android

**中文**　同一套前端 + Tauri 2 的 Android 目标，工程在 `src-tauri/gen/android`（已入库，`tauri android
init` 生成）。三处与桌面版不同，都是**版式与平台**的差异，不是另一套应用：

1. **窗口不是异形窗**。手机上没有「桌面」可透，纸之外铺的是设计稿的演示底（夜色 `#1d2b3a`）；
   窗口键（最小 / 最大化 / 关闭）与「拖窗口」在手机上不成立，紧凑版式里整块不画。
2. **三栏 → 一栏**。宽度 ≤ 1119px（＝桌面窗口的最小宽度 1120）时走 `src/styles/compact.css`：
   正文整幅，目次页与生词页变成盖在正文上的抽屉，抓手仍是那两枚页签（左右各一、互斥）。
3. **暂不接朗读**。随包引擎是 Windows 的 `run.exe`，手机上跑不了；`src-tauri/src/voice.rs` 在
   Android 上只保留命令名、返回一句可读的说明，前端则整块不渲染朗读入口（句子不是按钮、
   词条没有朗读键、设置区里没有「音色」）。要接的话，两条路：系统 TTS，或往 APK 里塞一份轻量模型。
4. **模拟器上 WebView 退回软件栅格**。宿主 GL 通道有问题时（emulator 日志刷 `gfxstream …
   GLESv2Imp error 0x502`），普通 App 照常显示、只有走 Chromium 合成的 WebView 整块白屏——
   `MainActivity` 认到模拟器就把 WebView 切成 `LAYER_TYPE_SOFTWARE`（真机不动，仍硬件加速）。

```bash
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"   # 或 ANDROID_SDK_ROOT；Tauri 会自己找 NDK
npm run android:debug     # → src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
npm run android           # 发布包，产物在 .../apk/universal/release/
```

**改代码即时生效**（开发模式）：

```bash
emulator -avd Pixel_5_Edited_API_34 -gpu swiftshader_indirect   # 先起一台**有窗口**的模拟器
yarn tauri android dev Pixel_5_Edited_API_34                    # 不带参数会弹列表让你选设备
```

移动端 dev 会把 `build.devUrl` 的 host 换成**本机局域网地址**（手机不是本机），所以 dev server
必须监听局域网接口——`vite.config.ts` 按 Tauri 给的 `TAURI_DEV_HOST` 绑，另有 `npm run dev:host`
（`tauri.android.conf.json` 的 beforeDevCommand 用它）兜底。若日志里出现
`Waiting for your frontend dev server to start on http://192.168.x.x:5275/`，就是这一步没绑上。

- 中文：`gen/android/local.properties` 的 `sdk.dir` **优先于** `ANDROID_HOME`；它必须指向装了
  build-tools 35 / platform 36 / NDK 的那份 SDK（本机有两份，指错会报 `Failed to find Build Tools
  revision 35.0.0`）。这文件机器相关、不入库。
  EN: `local.properties`'s `sdk.dir` wins over `ANDROID_HOME`; point it at the SDK that has
  build-tools 35 / platform 36 / the NDK.
- 中文：**模拟器上 dev 模式要求设备真的有网**（`adb shell ip -4 addr show eth0` 要看得到 `state UP`）。
  eth0 DOWN 时设备连不上 `192.168.x.x:5275`，界面会是空的加一行 `Failed to request …`——`adb reverse`
  救不了，因为 dev 用的是局域网地址而不是 `127.0.0.1`。只想看界面就装包直开（前端已打进包，不依赖 dev server）。
  EN: mobile dev needs the device to reach your LAN; a networkless emulator will show a blank screen plus
  `Failed to request http://192.168.x.x:5275/`.

- 中文：`--target aarch64` 只出 arm64 一个 ABI（真机够用）；模拟器加 `--target x86_64`，
  两个都要就 `--target aarch64 x86_64`，或者 `--split-per-abi` 分开出包。
  EN: `--target aarch64` builds the arm64 ABI only (enough for real phones); add `x86_64` for emulators,
  or pass `--split-per-abi`.
- 中文：**发布包要签名**才装得上。生成一份本地密钥（口令自定），再写 `src-tauri/gen/android/keystore.properties`：

  ```bash
  keytool -genkeypair -v -keystore src-tauri/gen/android/bingojp-release.jks \
    -alias bingojp -keyalg RSA -keysize 2048 -validity 10000
  ```

  ```properties
  storeFile=bingojp-release.jks     # 相对 src-tauri/gen/android/
  storePassword=…
  keyAlias=bingojp
  keyPassword=…
  ```

  密钥与 `keystore.properties` 都**不进库**（已在 `gen/android/.gitignore` 里挡住）。没有这个文件时
  release 构建照样跑完，只是产物未签名——开发时装 `npm run android:debug` 那份就够了。
  EN: the release APK must be signed to install. Generate a local key and write `keystore.properties` as
  above; both are gitignored. Without it, the release build still runs but yields an unsigned APK.
- 中文：**两处模板补丁**（都写在文件顶部的注释里，`tauri android init` 会覆盖回去）：
  `buildSrc/.../BuildTask.kt` 把 `node tauri android …` 改成 CLI 入口的绝对路径
  （node 不做名字解析，否则报 `Cannot find module '…\src-tauri\tauri'`）；
  `app/build.gradle.kts` 里加了读 `keystore.properties` 的签名段。
  EN: two template patches (documented in-file, lost on `tauri android init`): `BuildTask.kt` points at the
  local CLI entry instead of `tauri`, and `app/build.gradle.kts` reads `keystore.properties` for signing.
- 中文：安全区交给原生的 `MainActivity`（把 systemBars + 刘海的高度作为内边距加在 content 上），
  不靠 WebView 的 `env(safe-area-inset-*)`——那一套在 Android 上各版本报得不一样。
  EN: window insets are handled natively in `MainActivity` rather than via `env(safe-area-inset-*)`,
  whose Android support varies by version.
- 中文：**字体**沿用系统的 `serif` 回退（桌面清单里的 Yu Mincho 在 Android 上都没有）。手机上多半落到
  思源宋体，气质与桌面版接近但不完全相同；要一模一样就得把明朝体裁成一个子集打进包里（还没做）。
  EN: Japanese text falls back to the system `serif` (none of the desktop font list exists on Android);
  bundling a subset of a Minchō face would be needed for an exact match — not done yet.

## VOICEVOX 配置 · VOICEVOX configuration

- 中文：引擎放在 `VOICEVOX/vv-engine/run.exe`（相对工程根目录）。该目录体积大，**不入库**。
  EN: the engine lives at `VOICEVOX/vv-engine/run.exe` (relative to the project root). It is large and
  **not committed**.
- 中文：获取（Windows CPU 版 0.25.2，含断点续传）
  EN: fetch it (Windows CPU build 0.25.2, resumable download)

  ```bash
  bash VOICEVOX/download-voicevox.sh --extract
  ```

- 中文：启动参数 `--host 127.0.0.1 --port 50021`；前端经 Rust 代理走同一地址。
  EN: launched with `--host 127.0.0.1 --port 50021`; the frontend reaches it through a Rust proxy.
- 中文：环境变量（可选）　EN: environment variables (optional)

  | 变量 Variable | 说明 Description |
  | --- | --- |
  | `VOICEVOX_ENGINE_PATH` | 指向 `run.exe` 或其所在目录 · path to `run.exe` or its directory |
  | `VOICEVOX_BASE_URL` | 覆盖引擎地址，默认 `http://127.0.0.1:50021` · override the base URL |

- 中文：已在 `50021` 上运行的引擎会被直接复用；应用只负责关闭**自己拉起**的进程。
  EN: an engine already running on `50021` is reused; the app only shuts down the process **it started**.
- 中文：超时——探活 3s、合成 30s、等待引擎就绪 45s（每 0.5s 轮询）。
  EN: timeouts — probe 3s, synthesis 30s, engine-ready wait 45s (polled every 0.5s).
- 中文：语速固定 0.9；音色在界面右下角「音色」里选，选择会记住。
  EN: speech rate is fixed at 0.9; pick a voice from the "音色" menu (bottom-right) — the choice is saved.

## 数据与配置 · Data & settings

- 中文：课程数据 `data/lessons.json`、`data/vocab.json`；EPUB 源在 `data/epub/`。
  EN: lesson data in `data/lessons.json` and `data/vocab.json`; EPUB sources in `data/epub/`.
- 中文：偏好与「已记住」标记存 `localStorage`：`bingojp.prefs`、`bingojp.memorized`。
  EN: preferences and "memorized" marks live in `localStorage` under `bingojp.prefs` / `bingojp.memorized`.
- 中文：**Android 与桌面各存各的**：两边 `identifier` 相同，但 WebView 的那份 localStorage 与桌面
  WebView2 的那一份互不相通——手机上调的注音 / 中文 / 已记住不会同步回桌面，这是预期行为。
  EN: Android and desktop keep separate local storage (same identifier, different WebView stores), so
  preferences and "memorized" marks do not sync between them — expected.
- 中文：Tauri `identifier` 为 `com.bingoyes.bingojp`；窗口 1440×908、无边框、透明
  （这套窗口选项在 Android 上不成立，由 `src-tauri/tauri.android.conf.json` 覆盖）。
  EN: Tauri `identifier` is `com.bingoyes.bingojp`; window is 1440×908, borderless and transparent
  (not applicable on Android, overridden by `src-tauri/tauri.android.conf.json`).
- 中文：贴图在 `public/`，由 `scripts/trace_*.py`、`make_washi.py` 生成；重跑需要根目录设计稿
  `new_design.png` / `2.png`（不入库），依赖 `numpy`、`Pillow`、`scipy`、`scikit-image`。
  EN: textures in `public/` are generated by `scripts/trace_*.py` and `make_washi.py`; regenerating
  them needs the design drafts `new_design.png` / `2.png` at the repo root (not committed) plus
  `numpy`, `Pillow`, `scipy` and `scikit-image`.
- 中文：应用图标由 `scripts/make_icon.py` 用**已有的三样素材**拼成（和纸肌 + 毛笔「読む」+ 一方朱印），
  源图写到 `src-tauri/icons/source/`，再 `npx tauri icon src-tauri/icons/source/manifest.json`
  分发到桌面与 Android（`mipmap-*/ic_launcher*`）。
  EN: the app icon is composed by `scripts/make_icon.py` from three existing assets (the washi texture, the
  brush 「読む」 and the seal) into `src-tauri/icons/source/`, then distributed to desktop and Android with
  `npx tauri icon src-tauri/icons/source/manifest.json`.

