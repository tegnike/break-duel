import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const HUMAN_BATTLE_LOG_ENDPOINT = "/api/local-human-battle-logs";
const MAX_LOG_RECORD_BYTES = 2 * 1024 * 1024;
const HUMAN_BATTLE_LOG_TYPES = new Set(["match_start", "state_transition", "match_end", "match_abandoned"]);
const HUMAN_BATTLE_RESULTS = new Set(["human_win", "cpu_win", "draw", "abandoned"]);

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isCard(value: unknown): boolean {
  return isObject(value)
    && typeof value.id === "string"
    && (value.status === "active" || value.status === "inactive");
}

function isCardArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(isCard);
}

function isPlayerSnapshot(value: unknown): boolean {
  if (!isObject(value)) return false;
  const booleanKeys = [
    "is_human", "set_defense_used_this_turn", "played_ai_this_turn", "pipeline_used",
    "accelerator_used", "war_banner_used", "echo_urn_used", "charge_used",
    "attack_charge_compensation_used", "next_attack_unblockable",
  ];
  const numberKeys = [
    "life", "cards_drawn", "turns_started", "hand_defenses_used", "attacks_this_turn",
    "sandbox_shield", "turn_global_attack_bonus",
  ];
  const cardArrayKeys = ["deck", "hand", "known_hand_cards", "field", "discard"];
  const indexArrayKeys = ["spent_field_indexes", "charge_guarded_field_indexes", "recovery_delayed_field_indexes"];
  return typeof value.name === "string"
    && typeof value.deck_name === "string"
    && (value.ai_profile === "beginner" || value.ai_profile === "challenger")
    && booleanKeys.every((key) => typeof value[key] === "boolean")
    && numberKeys.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]))
    && cardArrayKeys.every((key) => isCardArray(value[key]))
    && indexArrayKeys.every((key) => Array.isArray(value[key]) && (value[key] as unknown[]).every(Number.isInteger))
    && Array.isArray(value.field_stacks)
    && value.field_stacks.every(isCardArray)
    && (value.memory === null || isCard(value.memory))
    && (value.set_defense_card === null || isCard(value.set_defense_card))
    && Array.isArray(value.turn_field_attack_bonuses)
    && value.turn_field_attack_bonuses.every((entry) => Array.isArray(entry) && entry.length === 2 && entry.every(Number.isFinite));
}

function isBattleSnapshot(value: unknown): boolean {
  if (!isObject(value)) return false;
  return Number.isInteger(value.seed)
    && Number.isInteger(value.turn)
    && (value.active_player_index === 0 || value.active_player_index === 1)
    && Number.isInteger(value.actions_remaining)
    && Number.isInteger(value.charged_actions_remaining)
    && (value.winner === null || value.winner === 0 || value.winner === 1)
    && typeof value.draw === "boolean"
    && (value.selected === null || isObject(value.selected))
    && (value.pending_attack === null || isObject(value.pending_attack))
    && (value.pending_target === null || isObject(value.pending_target))
    && (value.siege_lead_streaks === null
      || (Array.isArray(value.siege_lead_streaks) && value.siege_lead_streaks.length === 2 && value.siege_lead_streaks.every(Number.isInteger)))
    && Array.isArray(value.players)
    && value.players.length === 2
    && value.players.every(isPlayerSnapshot)
    && isStringArray(value.visible_log);
}

function isHumanBattleLogRecord(value: unknown): value is JsonObject & { session_id: string; sequence: number } {
  if (!isObject(value)) return false;
  if (value.schema_version !== 1
    || typeof value.session_id !== "string"
    || value.session_id.length === 0
    || value.session_id.length > 200
    || !Number.isInteger(value.sequence)
    || (value.sequence as number) < 0
    || typeof value.recorded_at !== "string"
    || Number.isNaN(Date.parse(value.recorded_at))
    || typeof value.type !== "string"
    || !HUMAN_BATTLE_LOG_TYPES.has(value.type)
    || !(value.actor === null || value.actor === "human" || value.actor === "cpu")
    || !isStringArray(value.new_log_entries)
    || !isBattleSnapshot(value.state)) return false;
  if (value.type === "match_start" && !isObject(value.rules)) return false;
  if ((value.type === "match_end" || value.type === "match_abandoned")
    && (typeof value.result !== "string" || !HUMAN_BATTLE_RESULTS.has(value.result))) return false;
  return true;
}

function sendJson(response: { statusCode: number; setHeader(name: string, value: string): void; end(body?: string): void }, status: number, error: string): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ error }));
}

function localHumanBattleLogPlugin(): Plugin {
  const persistedRecordKeys = new Set<string>();
  const writeQueues = new Map<string, Promise<void>>();
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
          let record: JsonObject & { session_id: string; sequence: number };
          try {
            const candidate: unknown = JSON.parse(body);
            if (!isHumanBattleLogRecord(candidate)) {
              sendJson(response, 400, "invalid human battle log record");
              return;
            }
            record = candidate;
          } catch {
            sendJson(response, 400, "invalid human battle log record");
            return;
          }
          try {
            const safeSessionId = record.session_id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 160);
            const date = safeSessionId.slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/)?.[0] ?? "unknown-date";
            const directory = path.resolve(process.cwd(), "tmp", "human-battle-logs", date);
            const filePath = path.join(directory, `${safeSessionId}.jsonl`);
            const recordKey = `${safeSessionId}:${record.sequence}`;
            const previousWrite = (writeQueues.get(filePath) ?? Promise.resolve()).catch(() => undefined);
            const currentWrite = previousWrite.then(async () => {
              if (persistedRecordKeys.has(recordKey)) return;
              await mkdir(directory, { recursive: true });
              await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
              persistedRecordKeys.add(recordKey);
            });
            writeQueues.set(filePath, currentWrite);
            await currentWrite;
            response.statusCode = 204;
            response.end();
          } catch {
            sendJson(response, 500, "human battle log could not be persisted");
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
