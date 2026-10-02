import * as React from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * settings.save-on-change rules 2-3 (PAD-473): the sign beside a Settings control that saves on
 * change. `track(key, save)` follows a control's saves; only the NEWEST save of a key decides
 * what its sign says, so an older save that resolves late — confirmed or failed — never speaks
 * over a newer one. "Saved" waits for a short pause with no newer save, so a run of quick
 * changes gives one sign at the end; it then clears. A failure shows at once and stays until the
 * control changes again. Callers keep their own rollback; `track` returns their promise as is.
 */
export type SaveSignStatus = "idle" | "saved" | "failed";

export const SAVE_SIGN_PAUSE_MS = 600;
export const SAVE_SIGN_VISIBLE_MS = 2000;

export function useSaveSign() {
  const [statuses, setStatuses] = React.useState<Record<string, SaveSignStatus>>({});
  const newest = React.useRef<Record<string, number>>({});
  const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const set = React.useCallback((key: string, status: SaveSignStatus) => {
    setStatuses((prev) => (prev[key] === status ? prev : { ...prev, [key]: status }));
  }, []);
  const clearTimer = (key: string) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    delete timers.current[key];
  };

  React.useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const track = React.useCallback(
    <T,>(key: string, save: Promise<T>): Promise<T> => {
      const seq = (newest.current[key] ?? 0) + 1;
      newest.current[key] = seq;
      clearTimer(key);
      set(key, "idle");
      save.then(
        () => {
          if (newest.current[key] !== seq) return;
          timers.current[key] = setTimeout(() => {
            set(key, "saved");
            timers.current[key] = setTimeout(() => set(key, "idle"), SAVE_SIGN_VISIBLE_MS);
          }, SAVE_SIGN_PAUSE_MS);
        },
        () => {
          if (newest.current[key] !== seq) return;
          clearTimer(key);
          set(key, "failed");
        },
      );
      return save;
    },
    [set],
  );

  const status = React.useCallback((key: string): SaveSignStatus => statuses[key] ?? "idle", [statuses]);
  return { status, track };
}

/** Always mounted, so the polite live region exists before its first announcement. */
export function SaveSign({ status, testId, className }: { status: SaveSignStatus; testId: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      role="status"
      aria-live="polite"
      data-testid={testId}
      data-state={status}
      className={cn(
        "inline-flex min-h-4 items-center gap-1 text-xs",
        status === "failed" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {status === "saved" ? (
        <>
          <Check className="h-3 w-3" aria-hidden="true" />
          {t("settings.saveSign.saved")}
        </>
      ) : status === "failed" ? (
        t("settings.saveSign.failed")
      ) : null}
    </span>
  );
}
