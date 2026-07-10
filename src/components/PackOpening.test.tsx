import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  TEN_PACK_COUNT,
  collectionCountsAfterPacks,
  markNewCards,
  rollPackBatch,
} from "../pack";
import { PackBatchResults } from "./PackOpening";

describe("PackBatchResults", () => {
  it("10パック・全50枚をパック単位のスクロール一覧へ描画する", () => {
    const packs = markNewCards(rollPackBatch(TEN_PACK_COUNT, () => 0.5), {});
    const owned = collectionCountsAfterPacks(packs, {});
    const html = renderToStaticMarkup(
      <PackBatchResults
        packs={packs}
        focusedKey={packs[0][0].key}
        focusedCard={packs[0][0].card}
        owned={owned}
        collectionPctBefore={0}
        collectionPctAfter={100}
        ownedAfter={18}
        collectionTotal={18}
        onFocus={() => undefined}
        onRestart={() => undefined}
        playSfx={() => undefined}
      />,
    );

    expect(html).toContain("10連パック開封結果");
    expect(html).toContain('aria-label="10連パック全50枚の一覧"');
    expect(html.match(/class="pack-batch-group"/g)).toHaveLength(TEN_PACK_COUNT);
    expect(html.match(/class="pack-batch-card rarity-/g)).toHaveLength(TEN_PACK_COUNT * 5);
    expect(html).not.toContain("<small>/10</small>");
  });
});
