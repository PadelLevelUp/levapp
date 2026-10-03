/**
 * Test-only stand-in for SettingsPage's unsaved registry (settings.unsaved-edits,
 * PAD-394). Wraps a section under test with a real, in-memory
 * SettingsUnsavedContext provider and exposes the current set of unsaved
 * section ids as `data-testid="unsaved-ids"` text (sorted, comma-joined), so a
 * section's own test can assert rule 2 ("differs by value") without mounting
 * all of SettingsPage.
 */
import { useCallback, useRef, useState } from "react";
import {
  failedPartText,
  SettingsSaveContext,
  SettingsUnsavedContext,
  type RegisterSaver,
  type SetUnsaved,
  type TabSaver,
} from "@/context/SettingsUnsavedContext";

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

  // settings.explicit-save (PAD-506): a stand-in for the page's one Save — runs every unsaved
  // section's saver and lists the ones that failed as `data-testid="save-failed"`.
  const savers = useRef(new Map<string, TabSaver>());
  const register = useCallback<RegisterSaver>((sectionId, saver) => {
    if (saver) savers.current.set(sectionId, saver);
    else savers.current.delete(sectionId);
  }, []);
  const [failed, setFailed] = useState<string[]>([]);
  const save = async () => {
    const bad: string[] = [];
    for (const id of [...ids].sort()) {
      const saver = savers.current.get(id);
      if (!saver) continue;
      try {
        await saver.save();
      } catch (error) {
        bad.push(failedPartText(id, error));
      }
    }
    setFailed(bad);
  };

  return (
    <SettingsUnsavedContext.Provider value={setUnsaved}>
      <SettingsSaveContext.Provider value={register}>
        {children}
        <div data-testid="unsaved-ids">{[...ids].sort().join(",")}</div>
        <button type="button" data-testid="harness-save" onClick={() => void save()}>
          save
        </button>
        <div data-testid="save-failed">{failed.join(",")}</div>
      </SettingsSaveContext.Provider>
    </SettingsUnsavedContext.Provider>
  );
}
