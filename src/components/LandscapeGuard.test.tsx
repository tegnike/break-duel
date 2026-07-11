import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LandscapeGuard, isSmartphoneBrowser, requestLandscapeMode } from "./LandscapeGuard";

describe("LandscapeGuard", () => {
  it("renders an accessible portrait-orientation prompt", () => {
    const html = renderToStaticMarkup(<LandscapeGuard smartphoneOverride />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("横向きで遊んでください");
    expect(html).toContain("横向き表示を試す");
  });

  it("distinguishes smartphones from tablets and desktop browsers", () => {
    expect(isSmartphoneBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", undefined)).toBe(true);
    expect(isSmartphoneBrowser("Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile", undefined)).toBe(true);
    expect(isSmartphoneBrowser("Mozilla/5.0 (Linux; Android 15; Tablet)", false)).toBe(false);
    expect(isSmartphoneBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", false)).toBe(false);
  });

  it("reports successful orientation locking", async () => {
    let fullscreenRequests = 0;
    let orientationRequests = 0;

    const status = await requestLandscapeMode({
      fullscreenActive: false,
      requestFullscreen: async () => { fullscreenRequests += 1; },
      lockOrientation: async () => { orientationRequests += 1; },
    });

    expect(fullscreenRequests).toBe(1);
    expect(orientationRequests).toBe(1);
    expect(status).toBe("横向き表示へ切り替えています…");
  });

  it("reports the manual-rotation fallback when browser requests fail", async () => {
    const status = await requestLandscapeMode({
      fullscreenActive: false,
      requestFullscreen: async () => { throw new Error("fullscreen rejected"); },
      lockOrientation: async () => { throw new Error("orientation rejected"); },
    });

    expect(status).toBe("このブラウザでは向きを自動変更できません。端末を横向きにしてください。");
  });

  it("reports fullscreen success when orientation locking fails", async () => {
    const status = await requestLandscapeMode({
      fullscreenActive: false,
      requestFullscreen: async () => undefined,
      lockOrientation: async () => { throw new Error("orientation rejected"); },
    });

    expect(status).toBe("全画面表示にしました。端末を横向きにしてください。");
  });
});
