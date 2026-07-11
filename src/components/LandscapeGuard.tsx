import { useState } from "react";

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

type NavigatorWithMobileHint = Navigator & {
  userAgentData?: {
    mobile?: boolean;
  };
};

export function isSmartphoneBrowser(
  userAgent: string,
  mobileHint: boolean | undefined,
): boolean {
  if (/iPhone|iPod/i.test(userAgent)) return true;
  if (/Android/i.test(userAgent)) return mobileHint === true || /Mobile/i.test(userAgent);
  return mobileHint === true;
}

export function LandscapeGuard({ smartphoneOverride }: { smartphoneOverride?: boolean } = {}) {
  const [status, setStatus] = useState("自動回転をONにして、端末を横向きにしてください。");
  const browserNavigator = typeof navigator === "undefined"
    ? null
    : navigator as NavigatorWithMobileHint;
  const isSmartphone = smartphoneOverride ?? Boolean(
    browserNavigator
      && isSmartphoneBrowser(
        browserNavigator.userAgent,
        browserNavigator.userAgentData?.mobile,
      ),
  );

  const requestLandscape = async () => {
    let fullscreenStarted = false;

    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        fullscreenStarted = true;
      }
    } catch {
      // Fullscreen and orientation locking are optional browser capabilities.
    }

    try {
      const orientation = screen.orientation as LockableScreenOrientation | undefined;
      if (orientation?.lock) {
        await orientation.lock("landscape");
        setStatus("横向き表示へ切り替えています…");
        return;
      }
    } catch {
      // iOS Safari and some in-app browsers require manual rotation.
    }

    setStatus(
      fullscreenStarted
        ? "全画面表示にしました。端末を横向きにしてください。"
        : "このブラウザでは向きを自動変更できません。端末を横向きにしてください。",
    );
  };

  if (!isSmartphone) return null;

  return (
    <aside className="landscape-guard" role="dialog" aria-modal="true" aria-labelledby="landscape-guard-title">
      <div className="landscape-guard-mark" aria-hidden="true">
        <span>↻</span>
      </div>
      <p className="landscape-guard-kicker">LANDSCAPE MODE</p>
      <h1 id="landscape-guard-title">横向きで遊んでください</h1>
      <p>{status}</p>
      <button type="button" onClick={requestLandscape}>横向き表示を試す</button>
    </aside>
  );
}
