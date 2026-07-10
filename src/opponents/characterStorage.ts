import type {
  OpponentCharacterDefinition,
  OpponentPortraitKind,
  OpponentVoiceCue,
  SavedOpponentCharacter,
} from "./types";

const DATABASE_NAME = "break-duel-character-admin";
const DATABASE_VERSION = 1;
const STORE_NAME = "characters";

export const OPPONENT_VOICE_CUES: readonly OpponentVoiceCue[] = [
  "match_start",
  "rival_turn_start",
  "play_summon",
  "upgrade",
  "memory",
  "charge",
  "attack",
  "field_defense",
  "hand_defense",
  "damage_taken",
  "command",
  "cutin_trump",
  "cutin_finisher",
  "victory",
  "defeat",
];

export const OPPONENT_VOICE_CUE_LABELS: Record<OpponentVoiceCue, string> = {
  match_start: "対戦開始",
  rival_turn_start: "相手ターン開始",
  play_summon: "召喚",
  upgrade: "アップグレード",
  memory: "メモリー設置",
  charge: "チャージ",
  attack: "攻撃",
  field_defense: "盤面防御",
  hand_defense: "手札防御",
  damage_taken: "被ダメージ",
  command: "コマンド使用",
  cutin_trump: "切札カットイン",
  cutin_finisher: "とどめカットイン",
  victory: "勝利",
  defeat: "敗北",
};

export const OPPONENT_PORTRAIT_LABELS: Record<OpponentPortraitKind, string> = {
  default: "通常立ち絵",
  hurt: "被弾",
  delight: "喜び",
  cutInTrump: "切札カットイン",
  cutInFinisher: "とどめカットイン",
};

export const OPPONENT_PORTRAIT_ASPECT_RATIOS: Record<OpponentPortraitKind, string> = {
  default: "1:1（正方形）",
  hurt: "1:1（正方形）",
  delight: "1:1（正方形）",
  cutInTrump: "3:2（横長）",
  cutInFinisher: "3:2（横長）",
};

export function createEmptySavedOpponentCharacter(): SavedOpponentCharacter {
  return {
    version: 1,
    id: "",
    defaultDisplayName: "",
    deckSelection: { kind: "random" },
    aiProfile: "challenger",
    portraits: { default: "" },
    lines: {},
    assetNames: { portraits: {}, audio: {} },
    updatedAt: new Date().toISOString(),
  };
}

export function savedCharacterToDefinition(character: SavedOpponentCharacter): OpponentCharacterDefinition {
  return {
    id: character.id,
    defaultDisplayName: character.defaultDisplayName,
    deckSelection: character.deckSelection,
    aiProfile: character.aiProfile,
    portraits: { ...character.portraits },
    lines: Object.fromEntries(
      Object.entries(character.lines).filter(([, line]) => Boolean(line?.text.trim())),
    ) as OpponentCharacterDefinition["lines"],
  };
}

export function validateSavedOpponentCharacter(character: SavedOpponentCharacter): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(character.id)) {
    errors.push("キャラクターIDは2〜32文字の半角英小文字・数字・ハイフンで入力してください");
  }
  if (!character.defaultDisplayName.trim()) errors.push("表示名を入力してください");
  if (!character.portraits.default) errors.push("通常立ち絵を登録してください");
  return errors;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("ファイルを読み込めませんでした"));
    reader.readAsDataURL(file);
  });
}

function openCharacterDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("このブラウザはキャラクター保存に対応していません"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("キャラクター保存領域を開けませんでした"));
  });
}

export async function loadSavedOpponentCharacters(): Promise<SavedOpponentCharacter[]> {
  const database = await openCharacterDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as SavedOpponentCharacter[]).filter((character) => character.version === 1));
    request.onerror = () => reject(request.error ?? new Error("キャラクターを読み込めませんでした"));
    transaction.oncomplete = () => database.close();
  });
}

export async function saveSavedOpponentCharacter(character: SavedOpponentCharacter): Promise<void> {
  const errors = validateSavedOpponentCharacter(character);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const database = await openCharacterDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ ...character, updatedAt: new Date().toISOString() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("キャラクターを保存できませんでした"));
    transaction.onabort = () => reject(transaction.error ?? new Error("キャラクター保存が中断されました"));
  });
  database.close();
}

export async function deleteSavedOpponentCharacter(characterId: string): Promise<void> {
  const database = await openCharacterDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(characterId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("キャラクターを削除できませんでした"));
  });
  database.close();
}
