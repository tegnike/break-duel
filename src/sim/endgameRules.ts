import { CONFIG } from "../game";

export type EndgameRulePackage =
  | "current"
  | "c0p1"
  | "p1"
  | "p2a"
  | "p2b"
  | "p2c"
  | "p3"
  | "p4a";

export type EndgameRuleOptions = {
  handLimit?: number;
  siegeConsecutiveTurns?: number;
};

type EndgameConfigSnapshot = {
  handDefenseLimit: typeof CONFIG.handDefenseLimit;
  handLimit: typeof CONFIG.handLimit;
  turnLimitResult: typeof CONFIG.turnLimitResult;
  deckOutFatigueDamage: typeof CONFIG.deckOutFatigueDamage;
  drawOnAttackDamage: typeof CONFIG.drawOnAttackDamage;
  attackDamageChargeCompensation: typeof CONFIG.attackDamageChargeCompensation;
  attackDamageChargeCompensationOncePerTurn: typeof CONFIG.attackDamageChargeCompensationOncePerTurn;
  siegeDamage: typeof CONFIG.siegeDamage;
  siegeConsecutiveTurns: typeof CONFIG.siegeConsecutiveTurns;
};

const ENDGAME_CONFIG_KEYS = [
  "handDefenseLimit",
  "handLimit",
  "turnLimitResult",
  "deckOutFatigueDamage",
  "drawOnAttackDamage",
  "attackDamageChargeCompensation",
  "attackDamageChargeCompensationOncePerTurn",
  "siegeDamage",
  "siegeConsecutiveTurns",
] as const;

export function snapshotEndgameConfig(): EndgameConfigSnapshot {
  return Object.fromEntries(ENDGAME_CONFIG_KEYS.map((key) => [key, CONFIG[key]])) as EndgameConfigSnapshot;
}

export function restoreEndgameConfig(snapshot: EndgameConfigSnapshot): void {
  ENDGAME_CONFIG_KEYS.forEach((key) => {
    (CONFIG[key] as EndgameConfigSnapshot[typeof key]) = snapshot[key];
  });
}

export function parseEndgameRulePackage(raw: string): EndgameRulePackage[] {
  if (raw === "current") return ["current"];
  const modules = raw.split("+").map((part) => part.trim()).filter(Boolean);
  if (modules.length === 0) return ["current"];
  const valid = new Set(["c0p1", "p1", "p2a", "p2b", "p2c", "p3", "p4a"]);
  modules.forEach((module) => {
    if (!valid.has(module)) {
      throw new Error(`--endgame-package が不正です: ${raw}（候補: current, c0p1, p2a, p2b, p2c, p3, p4a または + 結合）`);
    }
  });
  return modules as EndgameRulePackage[];
}

export function applyEndgameRulePackage(raw: string | undefined, options: EndgameRuleOptions = {}): string {
  const packageName = raw ?? "current";
  const modules = parseEndgameRulePackage(packageName);
  if (modules.includes("current")) return "current";

  CONFIG.turnLimitResult = "life_judgement";
  CONFIG.handLimit = options.handLimit ?? 6;
  CONFIG.deckOutFatigueDamage = 1;

  if (modules.some((module) => module === "p2a" || module === "p2b" || module === "p2c")) {
    CONFIG.drawOnAttackDamage = "event";
  }
  if (modules.some((module) => module === "p2b" || module === "p2c")) {
    CONFIG.attackDamageChargeCompensation = true;
    CONFIG.attackDamageChargeCompensationOncePerTurn = modules.includes("p2c");
  }
  if (modules.includes("p3")) {
    CONFIG.siegeDamage = 1;
    CONFIG.siegeConsecutiveTurns = options.siegeConsecutiveTurns ?? 1;
  }
  if (modules.includes("p4a")) {
    CONFIG.handDefenseLimit = 0;
  }

  return modules.join("+");
}
