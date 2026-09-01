/**
 * Owns the login handoff: form -> animated mark -> app.
 *
 * The overlay is mounted here, above the router, and not inside `AuthPage`.
 * `handleLogin` ends in `navigate("/dashboard")`, which unmounts the auth page
 * — an overlay rendered by that page would vanish at exactly the moment it is
 * meant to be covering the change. Living above the router also means the
 * dashboard mounts and fires its queries *behind* the animation, so the
 * `Loading` scene is spending time the app needed anyway.
 *
 * The `ready` signal is explicit rather than read off `useAuth()`. Auth's
 * `loading` flag flips twice around a login (`login()` resolves, then the token
 * effect re-runs `getMe`), so a derived `ready` would go true, false, true and
 * take the reveal with it.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LaunchLoader } from "@/components/brand/launch-loader";

type Phase = "idle" | "waiting" | "ready";

type LaunchOverlayContextType = {
  /** Cover the screen and start the mark forming. Call as the request goes out. */
  begin: () => void;
  /** The app behind is ready — let the reveal play once the mark has formed. */
  succeed: () => void;
  /** Login failed; take the overlay away now so the error is visible. */
  cancel: () => void;
};

const LaunchOverlayContext = createContext<LaunchOverlayContextType | undefined>(
  undefined,
);

export function LaunchOverlayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("idle");

  const begin = useCallback(() => setPhase("waiting"), []);
  const succeed = useCallback(() => setPhase("ready"), []);
  const cancel = useCallback(() => setPhase("idle"), []);
  const finish = useCallback(() => setPhase("idle"), []);

  const value = useMemo(
    () => ({ begin, succeed, cancel }),
    [begin, succeed, cancel],
  );

  return (
    <LaunchOverlayContext.Provider value={value}>
      {children}
      {phase !== "idle" && (
        <LaunchLoader
          ready={phase === "ready"}
          onFinish={finish}
          label={t("landing.loader.label")}
        />
      )}
    </LaunchOverlayContext.Provider>
  );
}

export function useLaunchOverlay() {
  const ctx = useContext(LaunchOverlayContext);
  if (!ctx) {
    throw new Error("useLaunchOverlay must be used inside LaunchOverlayProvider");
  }
  return ctx;
}
