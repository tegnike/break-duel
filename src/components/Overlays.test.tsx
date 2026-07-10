import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DuelCutInView } from "./Overlays";

const TRUMP_CUT_IN_LINE = "テスト用の切札台詞";

describe("DuelCutInView", () => {
  it("renders the trump cut-in with band, portrait, kicker and line", () => {
    const html = renderToStaticMarkup(
      <DuelCutInView cutIn={{ style: "trump" }} portrait="test-trump.webp" line={TRUMP_CUT_IN_LINE} />,
    );

    expect(html).toContain("duel-cut-in trump");
    expect(html).toContain("duel-cut-in-band");
    expect(html).toContain("duel-cut-in-portrait");
    expect(html).toContain("TRUMP CARD");
    expect(html).toContain(TRUMP_CUT_IN_LINE);
  });

  it("renders the finisher style and omits the line when absent", () => {
    const html = renderToStaticMarkup(<DuelCutInView cutIn={{ style: "finisher" }} portrait="fallback.webp" />);

    expect(html).toContain("duel-cut-in finisher");
    expect(html).toContain("FINISH BLOW");
    expect(html).not.toContain("duel-cut-in-text");
  });
});
