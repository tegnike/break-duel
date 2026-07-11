import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const HUMAN_BATTLE_LOG_ENDPOINT = "/api/local-human-battle-logs";
const MAX_LOG_RECORD_BYTES = 2 * 1024 * 1024;

function localHumanBattleLogPlugin(): Plugin {
  return {
    name: "local-human-battle-log",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== HUMAN_BATTLE_LOG_ENDPOINT || request.method !== "POST") {
          next();
          return;
        }
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk: string) => {
          body += chunk;
          if (Buffer.byteLength(body, "utf8") > MAX_LOG_RECORD_BYTES) request.destroy();
        });
        request.on("end", async () => {
          try {
            const record = JSON.parse(body) as { session_id?: unknown };
            if (typeof record.session_id !== "string" || !record.session_id) throw new Error("session_id is required");
            const safeSessionId = record.session_id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 160);
            const date = safeSessionId.slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/)?.[0] ?? "unknown-date";
            const directory = path.resolve(process.cwd(), "tmp", "human-battle-logs", date);
            await mkdir(directory, { recursive: true });
            await appendFile(path.join(directory, `${safeSessionId}.jsonl`), `${JSON.stringify(record)}\n`, "utf8");
            response.statusCode = 204;
            response.end();
          } catch (error) {
            response.statusCode = 400;
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ error: error instanceof Error ? error.message : "invalid log record" }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localHumanBattleLogPlugin()],
  publicDir: false,
  build: {
    outDir: "web",
    // web/ は完全な生成物（アセットは全て src/ からの import）。
    // 古いハッシュ付きアセットの蓄積をデプロイに載せないため毎回クリーンする。
    emptyOutDir: true,
  },
});
