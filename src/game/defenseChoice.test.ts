import { describe, expect, it } from "vitest";
import { CONFIG, type GameState } from "../game";
import { applyPlayEffects, beginAttackInDraft } from "./actions";
import { card, duelGame } from "./testHelpers";

// tests/test_core_rules.py の防御選択・防御解決テスト群の TypeScript 移植。
// Python は apply_action(ATTACK) 経由だが、TS では beginAttackInDraft が
// chooseAiDefense を含めて同等の解決を行う。

function lastLog(game: GameState): string {
  return game.log[game.log.length - 1] ?? "";
}

describe("AI defense choice (full attack resolution)", () => {
  // Python: test_ai_prefers_surviving_field_defense_over_lower_hand_defense
  it("prefers a surviving field defense over a lower hand defense", () => {
    const game = duelGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-WATER-2")];
    defender.field = [card("AI-WATER-3")];
    defender.hand = [card("AI-WATER-2")];

    beginAttackInDraft(game, 0, 0);

    expect(defender.field.map((item) => item.id)).toEqual(["AI-WATER-3"]);
    expect(defender.spentFieldIndexes.has(0)).toBe(true);
    expect(defender.hand.map((item) => item.id)).toEqual(["AI-WATER-2"]);
    expect(attacker.discard.map((item) => item.id)).toEqual(["AI-WATER-2"]);
    expect(defender.discard).toEqual([]);
    expect(defender.life).toBe(CONFIG.life);
  });

  // Python: test_ai_prefers_field_trade_over_hand_defense
  it("prefers a field trade over spending a hand defender", () => {
    const game = duelGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-WATER-2")];
    defender.field = [card("AI-WATER-2")];
    defender.hand = [card("AI-WATER-2")];

    beginAttackInDraft(game, 0, 0);

    expect(attacker.field).toHaveLength(0);
    expect(defender.field).toHaveLength(0);
    expect(defender.hand.map((item) => item.id)).toEqual(["AI-WATER-2"]);
    expect(defender.discard.map((item) => item.id)).toEqual(["AI-WATER-2"]);
    expect(attacker.discard.map((item) => item.id)).toEqual(["AI-WATER-2"]);
    expect(lastLog(game)).toContain("相打ち");
  });

  // Python: test_ai_uses_best_low_field_defense_for_partial_block
  it("uses the strongest low field defense for a partial block", () => {
    const game = duelGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-WATER-4")];
    defender.field = [card("AI-WATER-1"), card("AI-WATER-2")];
    defender.deck = [];

    beginAttackInDraft(game, 0, 0);

    expect(defender.life).toBe(CONFIG.life - 2);
    expect(defender.field.map((item) => item.id)).toEqual(["AI-WATER-1"]);
    expect(defender.discard.map((item) => item.id)).toEqual(["AI-WATER-2"]);
    // power 4 の攻撃後退場ログが後ろに付くため、ログ全体から防御失敗を確認する
    expect(game.log.some((line) => line.includes("攻撃を止められなかった"))).toBe(true);
  });

  // Python: test_ai_prefers_failed_field_defense_with_trigger_when_values_tie
  it("prefers a failed field defense with a defense trigger when values tie", () => {
    const game = duelGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-WATER-4")];
    defender.field = [card("AI-WATER-2"), card("AI-WATER-2D")];
    defender.deck = [card("AI-FIRE-1")];

    beginAttackInDraft(game, 0, 0);

    expect(defender.life).toBe(CONFIG.life - 2);
    expect(defender.field.map((item) => item.id)).toEqual(["AI-WATER-2"]);
    expect(defender.discard.map((item) => item.id)).toEqual(["AI-WATER-2D"]);
    // 場防御時ドロー効果は防御失敗でも発動する
    expect(defender.hand.map((item) => item.id)).toEqual(["AI-FIRE-1"]);
  });

  // Python: test_ai_uses_field_defense_over_hand_defense_against_pierce
  it("uses field defense over hand defense against a piercing attacker", () => {
    const game = duelGame(2);
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-FIRE-2B")];
    defender.field = [card("AI-WIND-2")];
    defender.hand = [card("AI-EARTH-2")];

    beginAttackInDraft(game, 0, 0);

    expect(defender.life).toBe(CONFIG.life);
    expect(defender.hand.map((item) => item.id)).toEqual(["AI-EARTH-2"]);
    expect(defender.field).toHaveLength(0);
    expect(defender.discard.map((item) => item.id)).toEqual(["AI-WIND-2"]);
    expect(lastLog(game)).toContain("相打ち");
  });
});

describe("hand defense resolution", () => {
  // Python: test_hand_defense_prevents_damage_without_removing_attacker
  it("prevents damage without removing the attacker from the field", () => {
    const game = duelGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-WATER-3")];
    defender.hand = [card("AI-WATER-4")];

    beginAttackInDraft(game, 0, 0);

    expect(defender.life).toBe(CONFIG.life);
    expect(attacker.field.map((item) => item.id)).toEqual(["AI-WATER-3"]);
    expect(attacker.spentFieldIndexes.has(0)).toBe(true);
    expect(defender.field).toHaveLength(0);
    expect(defender.discard.map((item) => item.id)).toEqual(["AI-WATER-4"]);
  });

  // Python: test_hand_defense_can_protect_even_when_field_is_not_empty
  it("can protect with a hand card even when the field is not empty", () => {
    const game = duelGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-WATER-3")];
    defender.field = [card("AI-FIRE-2")];
    defender.hand = [card("AI-WATER-3")];

    beginAttackInDraft(game, 0, 0);

    expect(defender.life).toBe(CONFIG.life);
    expect(defender.field.map((item) => item.id)).toEqual(["AI-FIRE-2"]);
    expect(attacker.field.map((item) => item.id)).toEqual(["AI-WATER-3"]);
    expect(defender.discard.map((item) => item.id)).toEqual(["AI-WATER-3"]);
  });

  // Python: test_hand_defense_pierce_still_deals_damage
  it("still takes 1 damage when hand-defending against a piercing attacker", () => {
    const game = duelGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-FIRE-2B")];
    defender.hand = [card("AI-EARTH-2")];
    defender.deck = [card("AI-WATER-2")];

    beginAttackInDraft(game, 0, 0);

    expect(defender.life).toBe(CONFIG.life - 1);
    expect(defender.discard[0]?.id).toBe("AI-EARTH-2");
    // 貫通1点にもブレイクドローが付く
    expect(defender.hand.map((item) => item.id)).toEqual(["AI-WATER-2"]);
  });

  // Python: test_low_life_finisher_blocks_hand_defense
  it("low-life finisher blocks hand defense and finishes the game", () => {
    const game = duelGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-FIRE-4B")];
    defender.life = 2;
    defender.hand = [card("AI-EARTH-4B")];
    defender.deck = [];

    beginAttackInDraft(game, 0, 0);

    expect(defender.life).toBe(0);
    expect(defender.hand.map((item) => item.id)).toEqual(["AI-EARTH-4B"]);
    expect(game.winner).toBe(0);
  });

  // Python: test_low_life_finisher_play_has_no_self_damage
  it("low-life finisher play deals no self damage", () => {
    const game = duelGame();
    const player = game.players[0];
    applyPlayEffects(game, player, card("AI-FIRE-4B"), 0, 4);
    expect(player.life).toBe(CONFIG.life);
    expect(game.players[1].life).toBe(CONFIG.life);
  });

  // Python: test_cannot_hand_defend_drawback_prevents_hand_defense
  it("cannot-hand-defend drawback prevents hand defense", () => {
    const game = duelGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-FIRE-1")];
    defender.hand = [card("AI-WATER-1B")];
    defender.deck = [card("AI-WATER-2")];

    beginAttackInDraft(game, 0, 0);

    expect(defender.life).toBe(CONFIG.life - 1);
    expect(defender.hand[0]?.id).toBe("AI-WATER-1B");
    expect(defender.hand).toHaveLength(2);
    expect(defender.discard).toEqual([]);
  });

  // Python: test_hand_defense_is_limited_to_once_per_turn_by_default
  it("limits hand defense to once per turn by default", () => {
    const game = duelGame(2);
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-WATER-3"), card("AI-WATER-3")];
    defender.hand = [card("AI-WATER-4"), card("AI-WATER-4")];
    defender.deck = [card("AI-FIRE-1"), card("AI-FIRE-1"), card("AI-FIRE-1")];

    beginAttackInDraft(game, 0, 0);
    beginAttackInDraft(game, 0, 1);

    expect(defender.life).toBe(CONFIG.life - 3);
    expect(defender.handDefensesUsed).toBe(1);
    // 手札防御1回で1枚消費、2回目の攻撃は素通りしブレイクドロー3枚
    expect(defender.hand).toHaveLength(4);
    expect(defender.discard).toHaveLength(1);
  });
});

describe("field defense resolution", () => {
  // Python: test_successful_field_defense_discards_attacker_and_spends_defender
  it("successful field defense discards the attacker and spends the defender", () => {
    const game = duelGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-WATER-3")];
    defender.field = [card("AI-WATER-4")];

    beginAttackInDraft(game, 0, 0);

    expect(attacker.field).toHaveLength(0);
    expect(defender.field.map((item) => item.id)).toEqual(["AI-WATER-4"]);
    expect(defender.spentFieldIndexes.has(0)).toBe(true);
    expect(attacker.discard[0]?.id).toBe("AI-WATER-3");
    expect(defender.discard).toEqual([]);
  });

  // Python: test_equal_field_defense_discards_both_ai
  it("equal field defense discards both summons", () => {
    const game = duelGame();
    const attacker = game.players[0];
    const defender = game.players[1];
    attacker.field = [card("AI-WATER-3")];
    defender.field = [card("AI-WATER-3")];

    beginAttackInDraft(game, 0, 0);

    expect(attacker.field).toHaveLength(0);
    expect(defender.field).toHaveLength(0);
    expect(attacker.discard[0]?.id).toBe("AI-WATER-3");
    expect(defender.discard[0]?.id).toBe("AI-WATER-3");
    expect(lastLog(game)).toContain("相打ち");
  });
});
