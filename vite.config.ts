import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: "web",
    // web/ は完全な生成物（アセットは全て src/ からの import）。
    // 古いハッシュ付きアセットの蓄積をデプロイに載せないため毎回クリーンする。
    emptyOutDir: true,
  },
});
