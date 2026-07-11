import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LandscapeGuard, isSmartphoneBrowser } from "./LandscapeGuard";

describe("LandscapeGuard", () => {
  it("renders an accessible portrait-orientation prompt", () => {
    const html = renderToStaticMarkup(<LandscapeGuard smartphoneOverride />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("横向きで遊んでください");
    expect(html).toContain("横向き表示を試す");
  });

  it("distinguishes smartphones from tablets and desktop browsers", () => {
    expect(isSmartphoneBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", undefined)).toBe(true);
    expect(isSmartphoneBrowser("Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile", undefined)).toBe(true);
    expect(isSmartphoneBrowser("Mozilla/5.0 (Linux; Android 15; Tablet)", false)).toBe(false);
    expect(isSmartphoneBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", false)).toBe(false);
  });
});
