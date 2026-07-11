import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpponentAsyncGuard, type OpponentAudioEndedSource } from "./asyncGuard";

class FakeAudio implements OpponentAudioEndedSource {
  private ended: (() => void) | null = null;
  addEventListener(_type: "ended", listener: () => void): void { this.ended = listener; }
  finish() { this.ended?.(); }
}

describe("opponent async match guard", () => {
  afterEach(() => vi.useRealTimers());

  it("ignores speech timers left over from the previous match", () => {
    vi.useFakeTimers();
    let matchId = "match-a";
    const guard = createOpponentAsyncGuard(() => matchId);
    const callback = vi.fn();
    guard.schedule("match-a", callback, 1000);
    matchId = "match-b";
    vi.runAllTimers();
    expect(callback).not.toHaveBeenCalled();
  });

  it("ignores an old Audio ended callback but accepts the active one", () => {
    let matchId = "match-a";
    const guard = createOpponentAsyncGuard(() => matchId);
    const oldAudio = new FakeAudio();
    const nextAudio = new FakeAudio();
    const oldCallback = vi.fn();
    const nextCallback = vi.fn();
    guard.onAudioEnded("match-a", oldAudio, oldCallback);
    matchId = "match-b";
    guard.onAudioEnded("match-b", nextAudio, nextCallback);
    oldAudio.finish();
    nextAudio.finish();
    expect(oldCallback).not.toHaveBeenCalled();
    expect(nextCallback).toHaveBeenCalledOnce();
  });

  it("drops a pending cue tagged with an old match", () => {
    let matchId = "match-b";
    const guard = createOpponentAsyncGuard(() => matchId);
    const pending = vi.fn();
    expect(guard.runIfCurrent("match-a", pending)).toBe(false);
    expect(guard.runIfCurrent("match-b", pending)).toBe(true);
    expect(pending).toHaveBeenCalledOnce();
  });
});
