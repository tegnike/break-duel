import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ATTRIBUTES } from "../game";
import { SummonBurstLayer, type SummonBurst } from "./Overlays";

const RECT = { left: 100, top: 200, width: 110, height: 155 };

function burst(overrides: Partial<SummonBurst>): SummonBurst {
  return { id: 1, kind: "summon", attribute: "火", rect: RECT, ...overrides };
}

describe("SummonBurstLayer", () => {
  it("renders an attribute-tinted burst for a fire summon", () => {
    const html = renderToStaticMarkup(<SummonBurstLayer burst={burst({ attribute: "火" })} />);
    expect(html).toContain("summon-burst attr-fire");
    expect(html).toContain(ATTRIBUTES["火"].color);
    expect(html).toContain("summon-burst-ring");
    expect(html).toContain("summon-burst-particles");
  });

  it("is centered on the landing slot", () => {
    const html = renderToStaticMarkup(<SummonBurstLayer burst={burst({})} />);
    expect(html).toContain("left:155px");
    expect(html).toContain("top:277.5px");
  });

  it.each([
    ["水", "attr-water"],
    ["風", "attr-wind"],
    ["土", "attr-earth"],
  ] as const)("uses a dedicated variant class for %s", (attribute, className) => {
    const html = renderToStaticMarkup(<SummonBurstLayer burst={burst({ attribute })} />);
    expect(html).toContain(className);
    expect(html).toContain(ATTRIBUTES[attribute].color);
  });

  it("blends both colors for dual attribute summons", () => {
    const html = renderToStaticMarkup(
      <SummonBurstLayer burst={burst({ attribute: "火", subAttribute: "水" })} />,
    );
    expect(html).toContain(ATTRIBUTES["火"].color);
    expect(html).toContain(ATTRIBUTES["水"].color);
  });

  it("renders a golden relic burst without an attribute", () => {
    const html = renderToStaticMarkup(<SummonBurstLayer burst={burst({ kind: "relic", attribute: undefined })} />);
    expect(html).toContain("summon-burst relic");
    expect(html).toContain("#f59e0b");
  });

  it("renders as an in-slot burst centered on the layout rect in slot mode", () => {
    const html = renderToStaticMarkup(<SummonBurstLayer burst={burst({})} mode="slot" />);
    expect(html).toContain("in-slot");
    expect(html).toContain("left:155px");
    expect(html).toContain("top:277.5px");
  });

  it("renders nothing for a summon without attribute", () => {
    const html = renderToStaticMarkup(<SummonBurstLayer burst={burst({ attribute: undefined })} />);
    expect(html).toBe("");
  });
});
