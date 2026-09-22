import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* Tauri 的移动端 dev（`tauri android dev` / `ios dev`）会把 devUrl 的 host 换成**本机的
 * 局域网地址**——手机不是本机，`localhost` 在它那儿指的是手机自己。所以那一边的 dev
 * server 必须监听局域网接口，只绑 localhost 的 Vite 会让 CLI 一直等：
 *
 *     Warn Waiting for your frontend dev server to start on http://192.168.x.x:5275/…
 *     Error Could not connect to `http://192.168.x.x:5275/` after 180s.
 *
 * Tauri 会把探测到的那个地址塞进 `TAURI_DEV_HOST`，这里照它绑；桌面 `tauri dev` 没有
 * 这个变量（`false`＝只绑 localhost，与原来一样）。另外 `npm run dev:host` 里那个
 * `--host` 是同一个意思的兜底（`tauri.android.conf.json` 的 beforeDevCommand 用的就是它），
 * 命令行上的 `--host` 优先级更高，两条并存不冲突。
 */
const devHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  // Tauri 的 devUrl 固定端口。5273 归主项目 BingoJapan，这里错开一格；
  // 端口被占时直接失败比静默换端口好排查。
  server: { port: 5275, strictPort: true, host: devHost || false },
  build: {
    // 两本教材的 JSON 内联进 bundle 更省事：本来就不联网加载，也没有按需切分的意义。
    chunkSizeWarningLimit: 2000,
  },
});
