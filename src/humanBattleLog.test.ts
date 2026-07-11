import { afterEach, describe, expect, it, vi } from "vitest";
import { createGame } from "./game";
import { appendedLogEntries, buildHumanBattleLogRecord, createHumanBattleLogSession, sendHumanBattleLogRecord, serializeHumanBattleState } from "./humanBattleLog";

afterEach(() => {
  vi.restoreAllMocks();
});

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
    expect(snapshot.players[0]).toMatchObject({
      pipeline_used: false,
      accelerator_used: false,
      war_banner_used: false,
      echo_urn_used: false,
    });
    expect(snapshot.siege_lead_streaks).toEqual([1, 0]);
    expect(JSON.stringify(snapshot)).not.toContain("rng");
  });

  it("keeps new messages when the 80-line UI log rolls over", () => {
    const previous = Array.from({ length: 80 }, (_, index) => `log-${index}`);
    const current = [...previous.slice(2), "log-80", "log-81"];
    expect(appendedLogEntries(previous, current)).toEqual(["log-80", "log-81"]);
  });

  it("queues and sequences the sender lifecycle through a terminal record", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 204 } as Response);
    const game = createGame(456, "fire", "water", "challenger");
    const session = createHumanBattleLogSession(game, new Date("2026-07-11T10:00:00.000Z"));
    const start = buildHumanBattleLogRecord(session, game, undefined, new Date("2026-07-11T10:00:00.000Z"));
    sendHumanBattleLogRecord(session, start);
    game.log.push("あなたはカードを使用。");
    const transition = buildHumanBattleLogRecord(session, game, undefined, new Date("2026-07-11T10:01:00.000Z"));
    sendHumanBattleLogRecord(session, transition);
    game.winner = 1;
    const end = buildHumanBattleLogRecord(session, game, undefined, new Date("2026-07-11T10:05:00.000Z"));
    sendHumanBattleLogRecord(session, end);
    sendHumanBattleLogRecord(session, end);
    await session.queue;

    expect(start).toMatchObject({ sequence: 0, type: "match_start", actor: null });
    expect(start.rules?.life).toBeGreaterThan(0);
    expect(transition).toMatchObject({ sequence: 1, type: "state_transition", actor: "human" });
    expect(end).toMatchObject({ sequence: 2, type: "match_end", result: "cpu_win", actor: "human" });
    expect(session).toMatchObject({ sequence: 3, ended: true, pendingRecords: [] });
    expect(session.lastSnapshot?.winner).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sentRecords = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(sentRecords.map((record) => [record.sequence, record.type])).toEqual([
      [0, "match_start"],
      [1, "state_transition"],
      [2, "match_end"],
    ]);
  });

  it("retains failed records and retries them before later transitions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, status: 204 } as Response);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const game = createGame(789, "fire", "water", "challenger");
    const session = createHumanBattleLogSession(game);
    sendHumanBattleLogRecord(session, buildHumanBattleLogRecord(session, game));
    await session.queue;
    expect(session.lastSnapshot).toBeNull();
    expect(session.pendingRecords).toHaveLength(1);

    game.log.push("再接続後の行動。");
    sendHumanBattleLogRecord(session, buildHumanBattleLogRecord(session, game));
    await session.queue;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(session.pendingRecords).toEqual([]);
    expect(session.lastSnapshot?.visible_log).toContain("再接続後の行動。");
  });
});
