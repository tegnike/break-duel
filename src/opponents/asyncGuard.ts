export type OpponentAudioEndedSource = {
  addEventListener(type: "ended", listener: () => void, options?: { once?: boolean }): void;
};

export function createOpponentAsyncGuard(getCurrentMatchId: () => string) {
  return {
    runIfCurrent(matchId: string, callback: () => void): boolean {
      if (matchId !== getCurrentMatchId()) return false;
      callback();
      return true;
    },
    schedule(matchId: string, callback: () => void, delayMs: number, schedule = setTimeout): ReturnType<typeof setTimeout> {
      return schedule(() => {
        if (matchId === getCurrentMatchId()) callback();
      }, delayMs);
    },
    onAudioEnded(matchId: string, audio: OpponentAudioEndedSource, callback: () => void): void {
      audio.addEventListener("ended", () => {
        if (matchId === getCurrentMatchId()) callback();
      }, { once: true });
    },
  };
}
