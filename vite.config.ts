import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Tauri 的 devUrl 固定端口。5273 归主项目 BingoJapan，这里错开一格；
  // 端口被占时直接失败比静默换端口好排查。
  server: { port: 5275, strictPort: true },
  build: {
    // 两本教材的 JSON 内联进 bundle 更省事：本来就不联网加载，也没有按需切分的意义。
    chunkSizeWarningLimit: 2000,
  },
});
