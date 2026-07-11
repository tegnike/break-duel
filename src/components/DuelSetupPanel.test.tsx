import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OpponentProfileStoreV1 } from "../opponents/types";
import { DuelSetupPanel } from "./DuelSetupPanel";

const baseProfile = {
  id: "nike-default",
  profileLabel: "ニケ（標準）",
  characterId: "nike",
  deckSelection: { kind: "random" as const },
  aiProfile: "challenger" as const,
  updatedAt: "2026-07-10T00:00:00.000Z",
};

function render(store: OpponentProfileStoreV1) {
  return renderToStaticMarkup(
    <DuelSetupPanel
      playerSelection={{ kind: "preset", deckId: "fire" }}
      savedDecks={[]}
      opponentStore={store}
      persistence="persisted"
      onClose={() => undefined}
      onStartTutorial={() => undefined}
      onChangePlayerSelection={() => undefined}
      onChangeOpponentStore={() => undefined}
      onInitializeStorage={() => undefined}
      onStart={() => undefined}
    />,
  );
}

describe("DuelSetupPanel", () => {
  it("renders the selected character without profile edit controls", () => {
    const html = render({ version: 1, selectedProfileId: baseProfile.id, profiles: [baseProfile] });
    expect(html).toContain("対戦キャラクター");
    expect(html).toContain("ニケ");
    expect(html).toContain("ランダム");
    expect(html).toContain("挑戦者");
    expect(html).toContain("編集は「キャラ管理」から");
    expect(html).not.toContain("複製");
    expect(html).not.toContain("新しい相手");
  });

  it("shows a concrete repair reason and disables match start for unresolved references", () => {
    const broken = { ...baseProfile, id: "broken", profileLabel: "壊れた参照", characterId: "future-character" };
    const html = render({ version: 1, selectedProfileId: broken.id, profiles: [broken] });
    expect(html).toContain("future-character");
    expect(html).toContain("この設定で対戦開始");
    expect(html).toContain("disabled");
  });

  it("uses character-owned difficulty instead of legacy profile difficulty", () => {
    const second = { ...baseProfile, id: "second", profileLabel: "初心者ニケ", aiProfile: "beginner" as const };
    const html = render({ version: 1, selectedProfileId: second.id, profiles: [baseProfile, second] });
    expect(html.match(/character-choice-card selected/g)).toHaveLength(1);
    expect(html).not.toContain("初心者ニケ");
    expect(html).toContain("CPU: 挑戦者");
  });
});
