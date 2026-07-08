import { describe, expect, it } from "vitest";
import {
  CARD_BY_ID,
  CONFIG,
  type Card,
  type GameState,
  cloneCard,
  commandUsable,
  createGame,
  makeRng,
} from "../game";
import { beginAttackInDraft, useCommandAtInDraft } from "./actions";

// tests/test_core_rules.py のキャラ/カード固有効果テストのうち、
// 既存の cardEffectCoverage.test.ts / set2Mechanics.test.ts でカバーされていない
// 差分のみを移植したテスト。

function card(id: string): Card {
  const found = CARD_BY_ID.get(id);
  if (!found) throw new Error(`Unknown test card: ${id}`);
  return cloneCard(found);
}

function duelGame(actions = 3): GameState {
  const game = createGame(
    1,
    { kind: "custom", name: "Test Player", cardIds: ["AI-FIRE-1"] },
    { kind: "custom", name: "Test Rival", cardIds: ["AI-WATER-1"] },
  );
  game.rng = makeRng(999);
  game.active = 0;
  game.turn = 2;
  game.actionsRemaining = actions;
  game.chargedActionsRemaining = 0;
  game.winner = null;
  game.draw = false;
  game.selected = null;
  game.pendingAttack = null;
  game.pendingTarget = null;
  game.log = [];
  game.players.forEach((player, index) => {
    player.isHuman = index === 0;
    player.life = CONFIG.life;
    player.deck = [card(index === 0 ? "AI-FIRE-1" : "AI-WATER-1")];
    player.hand = [];
    player.field = [];
    player.fieldStacks = [];
    player.memory = null;
    player.discard = [];
    player.handDefensesUsed = 0;
    player.chargeUsed = false;
    player.spentFieldIndexes.clear();
    player.power3RecoveryDelayedFieldIndexes.clear();
  });
  return game;
}

describe("serena (AI-WATER-3D)", () => {
  // Python: test_serena_draws_only_on_blocked_attack（防御された時のドロー解決部分。
  // 登場時にドローしないことは cardEffectCoverage の blocked_attack_draw で既カバー）
  it("draws one card when the attack is blocked, without piercing damage", () => {
    const game = duelGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-WATER-3D")];
    attacker.deck = [card("AI-FIRE-1")];
    defender.hand = [card("AI-WATER-4")];

    beginAttackInDraft(game, 0, 0);

    // 貫通は持たないためダメージなし。防御された時ドローだけが発動する
    expect(defender.life).toBe(CONFIG.life);
    expect(attacker.hand.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
    expect(defender.discard.map((item) => item.id)).toEqual(["AI-WATER-4"]);
  });
});

describe("granmare (AI-WATER-4D)", () => {
  // Python: test_granmare_draws_and_gives_opponent_a_draw_on_play_then_returns_after_overheat
  // （攻撃後退場で手札に戻る部分。登場時の相互ドローは cardEffectCoverage の
  // return_after_overheat_opponent_draw_on_play で既カバー）
  it("returns to hand instead of the discard pile after overheating", () => {
    const game = duelGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-WATER-4D")];
    defender.deck = [card("AI-FIRE-1")];

    beginAttackInDraft(game, 0, 0);

    expect(defender.life).toBe(CONFIG.life - 4);
    expect(attacker.field).toHaveLength(0);
    expect(attacker.discard).toEqual([]);
    expect(attacker.hand.map((item) => item.id)).toEqual(["AI-WATER-4D"]);
  });
});

describe("command usability gaps", () => {
  // Python: test_salvage_recovers_command_but_not_itself（発動不可の後半部分。
  // 回収挙動は cardEffectCoverage の salvage で既カバー）
  it("salvage is not usable when the discard pile only holds salvage itself", () => {
    const game = duelGame();
    const player = game.players[0];
    player.hand = [card("CMD-SALVAGE")];
    player.discard = [card("CMD-SALVAGE")];

    expect(commandUsable(game, player.hand[0], player, game.players[1])).toBe(false);
    useCommandAtInDraft(game, 0, null);
    expect(player.hand.map((item) => item.id)).toEqual(["CMD-SALVAGE"]);
  });

  // Python: test_deep_current_draws_three_and_discards_one（発動不可の後半部分。
  // ドロー挙動は cardEffectCoverage の deep_current で既カバー）
  it("deep current is not usable with fewer than two water summons", () => {
    const game = duelGame();
    const player = game.players[0];
    player.hand = [card("CMD-DEEP-CURRENT")];
    player.field = [card("AI-WATER-1"), card("AI-FIRE-1")];
    player.deck = [card("AI-FIRE-2")];

    expect(commandUsable(game, player.hand[0], player, game.players[1])).toBe(false);
    useCommandAtInDraft(game, 0, null);
    expect(player.hand.map((item) => item.id)).toEqual(["CMD-DEEP-CURRENT"]);
    expect(player.deck).toHaveLength(1);
  });

  // Python: test_grave_call_rejects_power_three_or_higher_target
  // （Python は ValueError を送出するが、TS はカードを消費せず中断する仕様）
  it("grave call refuses an explicit power-3+ target without consuming the card", () => {
    const game = duelGame();
    const player = game.players[0];
    player.hand = [card("CMD-GRAVE-CALL")];
    player.discard = [card("AI-FIRE-3"), card("AI-FIRE-2")];

    useCommandAtInDraft(game, 0, 0);

    expect(player.hand.map((item) => item.id)).toEqual(["CMD-GRAVE-CALL"]);
    expect(player.field).toHaveLength(0);
    expect(player.discard.map((item) => item.id)).toEqual(["AI-FIRE-3", "AI-FIRE-2"]);
  });
});
