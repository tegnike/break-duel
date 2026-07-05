import { describe, expect, it } from "vitest";
import {
  CONFIG,
  finishTurn,
  playCost,
  stackUpgradeCard,
  upgradeCost,
  type Card,
  type GameState,
  type PlayerState,
} from "../game";
import {
  afterAction,
  applyPlayEffects,
  beginAttackInDraft,
  chargeHandCardInDraft,
  performAiActionInDraft,
  resolveDefenseInDraft,
  strikeInDraft,
  useCommandAtInDraft,
} from "./actions";
import { createTutorialGame, currentTutorialStep, tutorialForcedAiAction } from "../tutorial";

function handIndexOf(player: PlayerState, cardId: string): number {
  const index = player.hand.findIndex((card) => card.id === cardId);
  expect(index, `hand should contain ${cardId}`).toBeGreaterThanOrEqual(0);
  return index;
}

function fieldIndexOf(player: PlayerState, cardId: string): number {
  const index = player.field.findIndex((card) => card.id === cardId);
  expect(index, `field should contain ${cardId}`).toBeGreaterThanOrEqual(0);
  return index;
}

function selectHand(game: GameState, cardId: string): void {
  game.selected = { zone: "hand", ownerIndex: 0, index: handIndexOf(game.players[0], cardId) };
}

function selectField(game: GameState, cardId: string): void {
  game.selected = { zone: "field", ownerIndex: 0, index: fieldIndexOf(game.players[0], cardId) };
}

// App.tsx の playSelectedAi と同じ手順で人間のAI召喚を実行する
function humanPlayAi(game: GameState, cardId: string): void {
  const player = game.players[0];
  const index = handIndexOf(player, cardId);
  const card = player.hand[index];
  const cost = playCost(card, game);
  expect(cost).toBeLessThanOrEqual(game.actionsRemaining);
  player.hand.splice(index, 1);
  player.field.push(card);
  player.playedAiThisTurn = true;
  applyPlayEffects(game, player, card, player.field.length - 1, cost);
  game.selected = null;
  if (!game.pendingTarget) afterAction(game, cost);
}

// App.tsx の playSelectedMemory と同じ手順
function humanPlayMemory(game: GameState, cardId: string): void {
  const player = game.players[0];
  const index = handIndexOf(player, cardId);
  const card = player.hand[index];
  expect(card.type).toBe("memory");
  player.hand.splice(index, 1);
  if (player.memory) player.discard.push(player.memory);
  player.memory = card;
  game.selected = null;
  afterAction(game);
}

function humanCommand(game: GameState, cardId: string, targetIndex: number | null = null): void {
  const index = handIndexOf(game.players[0], cardId);
  useCommandAtInDraft(game, index, targetIndex);
  game.selected = null;
}

function humanCharge(game: GameState, cardId: string): void {
  const index = handIndexOf(game.players[0], cardId);
  const charged = chargeHandCardInDraft(game, 0, index);
  expect(charged?.id).toBe(cardId);
  game.selected = null;
}

// チュートリアル中のライバルは防御しない（App.tsx beginAttack の固定と同じ）
function humanAttack(game: GameState, cardId: string): void {
  const index = fieldIndexOf(game.players[0], cardId);
  beginAttackInDraft(game, 0, index, {}, { type: "none" });
  game.selected = null;
}

function humanStrike(game: GameState, cardId: string, targetCardId: string): void {
  const index = fieldIndexOf(game.players[0], cardId);
  const targetIndex = fieldIndexOf(game.players[1], targetCardId);
  strikeInDraft(game, 0, index, targetIndex, {}, { type: "none" });
  game.selected = null;
}

// App.tsx / performAiActionInDraft のアップグレード処理と同じ手順
function humanUpgrade(game: GameState, targetCardId: string, sourceCardId: string): void {
  const player = game.players[0];
  const handIndex = handIndexOf(player, targetCardId);
  const fieldIndex = fieldIndexOf(player, sourceCardId);
  const card = player.hand[handIndex];
  const source = player.field[fieldIndex];
  const cost = upgradeCost(card, source);
  expect(cost).toBeLessThanOrEqual(game.actionsRemaining);
  player.hand.splice(handIndex, 1);
  stackUpgradeCard(player, fieldIndex, source);
  player.field[fieldIndex] = card;
  player.spentFieldIndexes.delete(fieldIndex);
  player.power3RecoveryDelayedFieldIndexes.delete(fieldIndex);
  applyPlayEffects(game, player, card, fieldIndex, cost, source);
  game.selected = null;
  if (!game.pendingTarget) afterAction(game, cost);
}

function humanEndTurn(game: GameState): void {
  expect(currentTutorialStep(game).focus).toEqual({ kind: "action", action: "end" });
  finishTurn(game, true);
}

// ライバルターンを固定進行で消化する。防御選択は App.tsx の
// tutorialForcedDefenseChoice と同じ内容を適用する。
function runRivalTurn(game: GameState): void {
  expect(game.active).toBe(1);
  let guard = 0;
  while (game.active === 1 && game.winner === null && !game.draw) {
    guard += 1;
    expect(guard).toBeLessThan(20);
    if (game.pendingAttack) {
      const step = currentTutorialStep(game);
      const defender = game.players[0];
      if (step.id === "field-defend") {
        const index = defender.field.findIndex((card, i) => card.id === "AI-FIRE-2" && !defender.spentFieldIndexes.has(i));
        expect(index).toBeGreaterThanOrEqual(0);
        resolveDefenseInDraft(game, { type: "field", index });
      } else if (step.id === "defend") {
        resolveDefenseInDraft(game, { type: "hand", index: handIndexOf(defender, "AI-FIRE-2B") });
      } else if (step.id === "take-break-draw") {
        resolveDefenseInDraft(game, { type: "none" });
      } else {
        throw new Error(`unexpected defense step: ${step.id}`);
      }
      continue;
    }
    const action = tutorialForcedAiAction(game);
    expect(action).not.toBeNull();
    performAiActionInDraft(game, action!);
  }
}

describe("tutorial duel setup", () => {
  it("starts on the real first-turn rules (1 action, life 8, no overrides)", () => {
    const game = createTutorialGame();

    expect(game.seed).toBe(20260630);
    expect(game.active).toBe(0);
    expect(game.turn).toBe(1);
    // 先攻1ターン目は通常ルールどおり1アクション
    expect(game.actionsRemaining).toBe(CONFIG.firstPlayerFirstTurnActions);
    // ライバルのライフ補正は廃止（通常どおり8）
    expect(game.players[1].life).toBe(CONFIG.life);
    expect(game.players[0].life).toBe(CONFIG.life);
    expect(game.players[0].hand.map((card) => card.id)).toEqual([
      "AI-FIRE-1B",
      "AI-FIRE-2",
      "MEM-CACHE",
      "AI-FIRE-1C",
      "CMD-FIRE-RITE",
    ]);
    // 山札の一番上（＝最初のドロー）は手札防御教材のブレイズランナー
    expect(game.players[0].deck.slice(-2).map((card) => card.id)).toEqual(["AI-WATER-2", "AI-FIRE-2B"]);
    expect(game.players[1].field).toEqual([]);
    expect(game.selected).toBeNull();
    expect(currentTutorialStep(game).id).toBe("select-summon");
  });
});

describe("tutorial full playthrough", () => {
  it("runs the fixed script from turn 1 to the winning power-4 punch", () => {
    const game = createTutorialGame();
    const player = game.players[0];
    const rival = game.players[1];

    // ---- T1: power 1 を1アクションで召喚 ----
    expect(currentTutorialStep(game).id).toBe("select-summon");
    selectHand(game, "AI-FIRE-1B");
    expect(currentTutorialStep(game).id).toBe("play-summon");
    humanPlayAi(game, "AI-FIRE-1B");
    expect(game.actionsRemaining).toBe(0);
    expect(currentTutorialStep(game).id).toBe("end-first-turn");
    humanEndTurn(game);

    // ---- T2: ライバルはペルナを出して終了 ----
    expect(currentTutorialStep(game).id).toBe("watch-rival");
    runRivalTurn(game);
    expect(rival.field.map((card) => card.id)).toEqual(["AI-EARTH-1B"]);

    // ---- T3: バサルトン(2A)→術式(1A)→チャージ(+1A)→遺物(1A) ----
    expect(game.turn).toBe(3);
    expect(game.actionsRemaining).toBe(CONFIG.actionsPerTurn);
    // T3の通常ドローで手札防御教材のブレイズランナーが手札に来る
    expect(player.hand.some((card) => card.id === "AI-FIRE-2B")).toBe(true);
    expect(currentTutorialStep(game).id).toBe("select-second-summon");
    selectHand(game, "AI-FIRE-2");
    expect(currentTutorialStep(game).id).toBe("play-second-summon");
    humanPlayAi(game, "AI-FIRE-2");

    expect(currentTutorialStep(game).id).toBe("command");
    selectHand(game, "CMD-FIRE-RITE");
    expect(currentTutorialStep(game).focus).toEqual({ kind: "action", action: "command" });
    humanCommand(game, "CMD-FIRE-RITE");
    // 固定進行に必要なライバルの教材カードは紅蓮圧壊術で失われない
    expect(rival.hand.some((card) => card.id === "AI-EARTH-2")).toBe(true);
    expect(rival.hand.some((card) => card.id === "AI-EARTH-2C")).toBe(true);

    expect(currentTutorialStep(game).id).toBe("select-charge");
    selectHand(game, "AI-FIRE-1C");
    expect(currentTutorialStep(game).id).toBe("charge");
    humanCharge(game, "AI-FIRE-1C");

    expect(currentTutorialStep(game).id).toBe("select-post-charge-memory");
    selectHand(game, "MEM-CACHE");
    expect(currentTutorialStep(game).id).toBe("play-post-charge-memory");
    humanPlayMemory(game, "MEM-CACHE");
    expect(game.actionsRemaining).toBe(0);
    expect(currentTutorialStep(game).id).toBe("end-after-memory");
    humanEndTurn(game);

    // ---- T4: ペルナの攻撃をバサルトンで場防御 ----
    expect(currentTutorialStep(game).id).toBe("watch-rival");
    runRivalTurn(game);
    expect(rival.discard.filter((card) => card.id === "AI-EARTH-1B").length).toBeGreaterThanOrEqual(1);
    expect(player.life).toBe(CONFIG.life);
    expect(player.field.map((card) => card.id)).toEqual(["AI-FIRE-1B", "AI-FIRE-2"]);

    // ---- T5: 旅嚢の補充を確認してバサルトンで攻撃（8→6） ----
    expect(game.turn).toBe(5);
    // ターン開始時: 手札1枚 → 通常ドロー + 旅嚢ドロー
    expect(player.hand.length).toBe(3);
    expect(currentTutorialStep(game).id).toBe("attack");
    selectField(game, "AI-FIRE-2");
    humanAttack(game, "AI-FIRE-2");
    expect(rival.life).toBe(CONFIG.life - 2);
    expect(game.actionsRemaining).toBe(2);
    expect(currentTutorialStep(game).id).toBe("end-after-attack");
    humanEndTurn(game);

    // ---- T6: ライバルはガメルを出して終了 ----
    runRivalTurn(game);
    expect(rival.field.map((card) => card.id)).toEqual(["AI-EARTH-2"]);

    // ---- T7: イグナロスを3アクションで直接召喚 ----
    expect(game.turn).toBe(7);
    expect(currentTutorialStep(game).id).toBe("select-upgrade");
    selectHand(game, "AI-FIRE-3B");
    expect(currentTutorialStep(game).id).toBe("upgrade");
    humanPlayAi(game, "AI-FIRE-3B");
    expect(game.actionsRemaining).toBe(0);
    expect(currentTutorialStep(game).id).toBe("end-after-power3-upgrade");
    humanEndTurn(game);

    // ---- T8: 壁を出したガメルの攻撃をブレイズランナーで手札防御 ----
    expect(currentTutorialStep(game).id).toBe("watch-rival");
    runRivalTurn(game);
    expect(rival.field.map((card) => card.id)).toEqual(["AI-EARTH-2", "AI-EARTH-1"]);
    expect(player.life).toBe(CONFIG.life);
    expect(player.discard.some((card) => card.id === "AI-FIRE-2B")).toBe(true);
    expect(rival.spentFieldIndexes.has(0)).toBe(true);

    // ---- T9: ヴァルガへ1Aアップグレード → 追撃粛清 → 浮いた1Aで攻撃（6→4） ----
    expect(game.turn).toBe(9);
    expect(currentTutorialStep(game).id).toBe("select-power4-upgrade");
    selectHand(game, "AI-FIRE-4");
    expect(currentTutorialStep(game).id).toBe("upgrade-power4");
    humanUpgrade(game, "AI-FIRE-4", "AI-FIRE-3B");
    expect(game.actionsRemaining).toBe(2);

    expect(currentTutorialStep(game).id).toBe("purge-command");
    selectHand(game, "CMD-PURGE");
    expect(currentTutorialStep(game).focus).toEqual({ kind: "action", action: "command" });
    humanCommand(game, "CMD-PURGE", fieldIndexOf(rival, "AI-EARTH-2"));
    expect(rival.field.some((card) => card.id === "AI-EARTH-2")).toBe(false);

    expect(currentTutorialStep(game).id).toBe("saved-action-attack");
    selectField(game, "AI-FIRE-2");
    humanAttack(game, "AI-FIRE-2");
    expect(rival.life).toBe(CONFIG.life - 4);
    expect(game.actionsRemaining).toBe(0);
    expect(currentTutorialStep(game).id).toBe("end-after-upgrade");
    humanEndTurn(game);

    // ---- T10: ノームの攻撃を防御せず受けてブレイクドロー ----
    expect(currentTutorialStep(game).id).toBe("watch-rival");
    const handBeforeBreak = player.hand.length;
    runRivalTurn(game);
    expect(player.life).toBe(CONFIG.life - 2);
    // 被弾2点で2枚のブレイクドロー + T11開始時の通常ドロー1枚
    expect(player.hand.length).toBe(handBeforeBreak + 3);

    // ---- T11: モンスター攻撃で壁を討伐 → 切札の4点パンチで勝利 ----
    expect(game.turn).toBe(11);
    expect(currentTutorialStep(game).id).toBe("strike-monster");
    selectField(game, "AI-FIRE-2");
    humanStrike(game, "AI-FIRE-2", "AI-EARTH-1");
    expect(rival.field.some((card) => card.id === "AI-EARTH-1")).toBe(false);

    expect(currentTutorialStep(game).id).toBe("power4-attack");
    selectField(game, "AI-FIRE-4");
    humanAttack(game, "AI-FIRE-4");
    expect(rival.life).toBe(0);
    expect(game.winner).toBe(0);
    expect(player.discard.some((card) => card.id === "AI-FIRE-4")).toBe(true);
    expect(currentTutorialStep(game).id).toBe("complete");
  });
});
