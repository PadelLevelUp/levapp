/**
 * settings.unsaved-edits (PAD-394, ledger B-157): the page-level registry of
 * which Settings sections currently hold an edit that differs by VALUE from
 * their last loaded or saved value (rule 2 — never "was touched": an edit
 * undone by hand is clean again). SettingsPage owns the aggregate and asks
 * before a tab switch would unmount a section that is still unsaved.
 *
 * Each explicit-save section calls `useReportUnsaved(sectionId, unsaved)`
 * with its own id and its current rule-2 flag. This is deliberately separate
 * from the B-155 load guards (dirty/"touched" refs that stop a late load from
 * overwriting an edit) — those answer "did a load ever try to clobber this?",
 * this answers "does the user have something to lose right now?".
 */
import { createContext, useContext, useEffect, useRef } from "react";

export type SetUnsaved = (sectionId: string, unsaved: boolean) => void;

export const SettingsUnsavedContext = createContext<SetUnsaved | undefined>(undefined);

/**
 * Registers `unsaved` under `sectionId` on every change, and always clears
 * that entry on unmount — so a section that unmounts (tab-switch discard,
 * a Collapsible closing, or any other reason) never leaves a stale "unsaved"
 * behind for SettingsPage to ask about again.
 *
 * A no-op outside a `SettingsUnsavedContext.Provider`, so a section's own
 * unit tests that don't care about the registry need no wrapper.
 */
export function useReportUnsaved(sectionId: string, unsaved: boolean): void {
  const setUnsaved = useContext(SettingsUnsavedContext);

  useEffect(() => {
    setUnsaved?.(sectionId, unsaved);
  }, [setUnsaved, sectionId, unsaved]);

  // A dependency array does not mean "run setup once, cleanup once on
  // unmount" — ANY identity change in it reruns the cleanup too, before the
  // new setup. If this effect depended on `setUnsaved`/`sectionId` directly,
  // an unstable setter (or a re-render with a new context value) would fire
  // the cleanup — which marks the section CLEAN — on every such render, right
  // before the effect above re-marks it dirty: a stale re-mark loop. Reading
  // both through refs keeps this effect's own deps empty, so its cleanup only
  // ever runs on a REAL unmount.
  const setUnsavedRef = useRef(setUnsaved);
  setUnsavedRef.current = setUnsaved;
  const sectionIdRef = useRef(sectionId);
  sectionIdRef.current = sectionId;

  useEffect(() => {
    return () => setUnsavedRef.current?.(sectionIdRef.current, false);
  }, []);
}
