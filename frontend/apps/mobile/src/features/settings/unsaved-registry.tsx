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

/**
 * settings.explicit-save (PAD-506): a section's part of the screen's one "Guardar alterações". `save`
 * resolves once the server confirmed (the section has made the confirmed value its baseline, so it
 * reports clean) and throws when it did not — the section then stays unsaved and the next Save
 * retries only it (rule 3). `label` names the section in a failure message.
 */
export type SectionSaver = { label: string; save: () => Promise<void> };

type UnsavedRegistry = {
  /** A section reports its own current "differs from the last loaded/saved value" flag. */
  setUnsaved: (key: string, unsaved: boolean) => void;
  /** Is ANY currently-registered entry unsaved. Read at the moment the back row is pressed. */
  hasUnsaved: () => boolean;
  /** PAD-506: the unsaved entries right now, in the order they became unsaved. */
  unsavedKeys: () => string[];
  /** PAD-506: a section's part of the one Save (null unregisters). */
  registerSaver: (key: string, saver: SectionSaver | null) => void;
  saverFor: (key: string) => SectionSaver | undefined;
  /** PAD-506: changes whenever an entry turns unsaved or clean, so the footer Save and the
   *  leave guard re-render with it. */
  version: number;
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
  const savers = React.useRef(new Map<string, SectionSaver>());
  // PAD-506: bumped only when an entry's membership changes (not per keystroke), so the screen's
  // footer Save and its leave guard follow the aggregate.
  const [version, setVersion] = React.useState(0);
  // The functions never change identity (sections depend on them in effects); only `version` does.
  const fns = React.useMemo<Omit<UnsavedRegistry, "version">>(
    () => ({
      setUnsaved: (key, unsaved) => {
        const had = entries.current.has(key);
        if (unsaved) entries.current.set(key, true);
        else entries.current.delete(key);
        if (had !== unsaved) setVersion((v) => v + 1);
      },
      hasUnsaved: () => entries.current.size > 0,
      unsavedKeys: () => [...entries.current.keys()],
      registerSaver: (key, saver) => {
        if (saver) savers.current.set(key, saver);
        else savers.current.delete(key);
      },
      saverFor: (key) => savers.current.get(key),
    }),
    []
  );
  const value = React.useMemo<UnsavedRegistry>(() => ({ ...fns, version }), [fns, version]);
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
  // The stable function, not the context object: the object changes with `version` (PAD-506), and
  // depending on it would run the cleanup below on every flip — a clean/unsaved loop.
  const setUnsaved = React.useContext(UnsavedRegistryContext)?.setUnsaved;
  React.useEffect(() => {
    setUnsaved?.(key, unsaved);
  }, [setUnsaved, key, unsaved]);
  // Separate effect, empty-ish deps ([setUnsaved, key] only): this cleanup must run ONLY on
  // unmount (or a key change), never after every `unsaved` flip — a `[..., unsaved]`
  // dep here would clear the entry between every keystroke's effect and the next.
  React.useEffect(() => {
    return () => setUnsaved?.(key, false);
  }, [setUnsaved, key]);
}

/**
 * settings.explicit-save (PAD-506): `useUnsavedReporter` plus the section's part of the screen's one
 * Save. The saver is read through a ref, so a section passes a fresh closure every render (it sees the
 * current draft) without re-registering; it is unregistered on unmount. A no-op with no Provider.
 */
export function useSectionSave(key: string, unsaved: boolean, saver: SectionSaver): void {
  useUnsavedReporter(key, unsaved);
  const ctx = React.useContext(UnsavedRegistryContext);
  const saverRef = React.useRef(saver);
  saverRef.current = saver;
  const registerRef = React.useRef(ctx?.registerSaver);
  registerRef.current = ctx?.registerSaver;
  React.useEffect(() => {
    registerRef.current?.(key, {
      get label() {
        return saverRef.current.label;
      },
      save: () => saverRef.current.save(),
    });
    return () => registerRef.current?.(key, null);
  }, [key]);
}
