import * as React from "react";

/**
 * B-157 / settings.unsaved-edits rules 2–3 (PAD-394): each explicit-save section under
 * the currently open Settings pane reports whether ITS OWN edits differ from their last
 * loaded/saved value (rule 2) — "unsaved", never "touched". The screen (app/settings.tsx)
 * only needs the AGGREGATE at the moment the back row is pressed: "is anything currently
 * mounted unsaved". That is enough because entries are per-mount — a section clears its
 * own entry the instant it unmounts (`useUnsavedReporter`'s cleanup) — and only the open
 * pane's section(s) are ever mounted. `calendar` mounts both SeasonsSection AND
 * WorkingHoursSection at once, and `preferences` mounts CoachLevelsSection alongside
 * save-on-change controls that report nothing (rule 1); the aggregate covers both without
 * the screen needing to know which sub-keys exist per pane.
 *
 * One Provider instance per SettingsScreen mount (created by `UnsavedRegistryProvider`
 * as a plain `useRef`, never a module-level singleton), so nothing leaks between screen
 * instances or across a logout/login.
 */

type UnsavedRegistry = {
  /** A section reports its own current "differs from the last loaded/saved value" flag. */
  setUnsaved: (key: string, unsaved: boolean) => void;
  /** Is ANY currently-registered entry unsaved. Read at the moment the back row is pressed. */
  hasUnsaved: () => boolean;
};

const UnsavedRegistryContext = React.createContext<UnsavedRegistry | null>(null);

export function UnsavedRegistryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // A ref, not state: setUnsaved fires on every keystroke in the open section, and the
  // screen never needs a re-render from it — it only reads hasUnsaved() once, when the
  // back row is pressed.
  const entries = React.useRef(new Map<string, boolean>());
  const value = React.useMemo<UnsavedRegistry>(
    () => ({
      setUnsaved: (key, unsaved) => {
        if (unsaved) entries.current.set(key, true);
        else entries.current.delete(key);
      },
      hasUnsaved: () => entries.current.size > 0,
    }),
    []
  );
  return (
    <UnsavedRegistryContext.Provider value={value}>
      {children}
    </UnsavedRegistryContext.Provider>
  );
}

/** The screen reads the aggregate through this. Must be called from a descendant of
 *  `UnsavedRegistryProvider` — throws otherwise, the same contract `useAuth` follows. */
export function useUnsavedRegistry(): UnsavedRegistry {
  const ctx = React.useContext(UnsavedRegistryContext);
  if (!ctx) {
    throw new Error(
      "useUnsavedRegistry must be used within an UnsavedRegistryProvider"
    );
  }
  return ctx;
}

/**
 * An explicit-save section calls this with its own unsaved flag (rule 2's comparison,
 * computed by the section itself). The entry is cleared the moment the section unmounts,
 * whatever it last reported — leaving a section (even through a route this ticket does not
 * gate, rule 6) never leaves a stale "unsaved" flag registered for a section that is no
 * longer mounted.
 *
 * Safe with no Provider above it: a section's own unit test mounts the section standalone
 * (see seasons-section.test.tsx, working-hours-section.test.tsx), so this silently does
 * nothing rather than throwing, keeping every existing section test unmodified.
 */
export function useUnsavedReporter(key: string, unsaved: boolean): void {
  const ctx = React.useContext(UnsavedRegistryContext);
  React.useEffect(() => {
    ctx?.setUnsaved(key, unsaved);
  }, [ctx, key, unsaved]);
  // Separate effect, empty-ish deps ([ctx, key] only): this cleanup must run ONLY on
  // unmount (or a key/ctx change), never after every `unsaved` flip — a `[..., unsaved]`
  // dep here would clear the entry between every keystroke's effect and the next.
  React.useEffect(() => {
    return () => ctx?.setUnsaved(key, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, key]);
}
