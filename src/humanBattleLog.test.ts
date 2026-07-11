import { describe, expect, it } from "vitest";
import { createGame } from "./game";
import { appendedLogEntries, buildHumanBattleLogRecord, createHumanBattleLogSession, serializeHumanBattleState } from "./humanBattleLog";

describe("human battle log", () => {
  it("serializes complete current battle state without runtime-only collections", () => {
    const game = createGame(123, "fire", "water", "challenger");
    game.players[0].spentFieldIndexes.add(2);
    game.players[0].turnFieldAttackBonuses.set(1, 3);
    game.players[0].knownHandCards.push(game.players[0].hand[0]);
    game.siegeLeadStreaks = [1, 0];

    const snapshot = serializeHumanBattleState(game);

    expect(snapshot.seed).toBe(123);
    expect(snapshot.players[0].known_hand_cards).toHaveLength(1);
    expect(snapshot.players[0].spent_field_indexes).toEqual([2]);
    expect(snapshot.players[0].turn_field_attack_bonuses).toEqual([[1, 3]]);
    expect(snapshot.siege_lead_streaks).toEqual([1, 0]);
    expect(JSON.stringify(snapshot)).not.toContain("rng");
  });

  it("keeps new messages when the 80-line UI log rolls over", () => {
    const previous = Array.from({ length: 80 }, (_, index) => `log-${index}`);
    const current = [...previous.slice(2), "log-80", "log-81"];
    expect(appendedLogEntries(previous, current)).toEqual(["log-80", "log-81"]);
  });

  it("emits start and final records with result metadata", () => {
    const game = createGame(456, "fire", "water", "challenger");
    const session = createHumanBattleLogSession(game, new Date("2026-07-11T10:00:00.000Z"));
    const start = buildHumanBattleLogRecord(session, game, undefined, new Date("2026-07-11T10:00:00.000Z"));
    session.sequence += 1;
    session.lastSnapshot = start.state;
    game.winner = 1;
    const end = buildHumanBattleLogRecord(session, game, undefined, new Date("2026-07-11T10:05:00.000Z"));
    expect(start).toMatchObject({ sequence: 0, type: "match_start", actor: null });
    expect(start.rules?.life).toBeGreaterThan(0);
    expect(end).toMatchObject({ sequence: 1, type: "match_end", result: "cpu_win", actor: "human" });
  });
});
