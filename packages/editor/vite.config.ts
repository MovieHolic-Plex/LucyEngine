import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const server = process.env.AGE_SERVER ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.EDITOR_PORT ?? 5173),
    host: true,
    proxy: {
      "/api": server,
      "/assets": server,
      "/ws": { target: server, ws: true },
    },
  },
  // /assets 는 서버가 생성 그림을 내보내는 자리라 빌드 결과는 다른 곳에 둔다
  build: { chunkSizeWarningLimit: 2500, assetsDir: "static" },
});
