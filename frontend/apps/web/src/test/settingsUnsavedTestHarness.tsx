/**
 * Test-only stand-in for SettingsPage's unsaved registry (settings.unsaved-edits,
 * PAD-394). Wraps a section under test with a real, in-memory
 * SettingsUnsavedContext provider and exposes the current set of unsaved
 * section ids as `data-testid="unsaved-ids"` text (sorted, comma-joined), so a
 * section's own test can assert rule 2 ("differs by value") without mounting
 * all of SettingsPage.
 */
import { useCallback, useState } from "react";
import { SettingsUnsavedContext, type SetUnsaved } from "@/context/SettingsUnsavedContext";

export function SettingsUnsavedTestHarness({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set());

  // Stable identity, same as SettingsPage's own setUnsaved (useCallback with
  // an empty dep array) — a real page/section pairing never has the setter's
  // reference change under a mounted consumer.
  const setUnsaved = useCallback<SetUnsaved>((sectionId, unsaved) => {
    setIds((prev) => {
      const has = prev.has(sectionId);
      if (has === unsaved) return prev;
      const next = new Set(prev);
      if (unsaved) next.add(sectionId);
      else next.delete(sectionId);
      return next;
    });
  }, []);

  return (
    <SettingsUnsavedContext.Provider value={setUnsaved}>
      {children}
      <div data-testid="unsaved-ids">{[...ids].sort().join(",")}</div>
    </SettingsUnsavedContext.Provider>
  );
}
