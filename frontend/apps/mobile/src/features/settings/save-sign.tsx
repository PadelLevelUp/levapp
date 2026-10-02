import * as React from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, View } from "react-native";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * settings.save-on-change rules 2-3 (PAD-473) — the iOS twin of web's `SaveSign`. `track(key, save)`
 * follows a control's saves; only the NEWEST save of a key decides what its sign says, so an older
 * save resolving late never speaks over a newer one. "Saved" waits for a short pause with no newer
 * save (one sign per run of quick changes), then clears; a failure shows at once and stays until
 * the control changes again. Each sign is announced to VoiceOver once. Callers keep their own
 * rollback; `track` returns their promise as is.
 */
export type SaveSignStatus = "idle" | "saved" | "failed";

export const SAVE_SIGN_PAUSE_MS = 600;
export const SAVE_SIGN_VISIBLE_MS = 2000;

const COPY: Record<Exclude<SaveSignStatus, "idle">, string> = {
  saved: "settings.saveSign.saved",
  failed: "settings.saveSign.failed",
};

export function useSaveSign() {
  const { t } = useTranslation();
  const [statuses, setStatuses] = React.useState<Record<string, SaveSignStatus>>({});
  const newest = React.useRef<Record<string, number>>({});
  const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const tRef = React.useRef(t);
  tRef.current = t;

  const set = React.useCallback((key: string, status: SaveSignStatus) => {
    setStatuses((prev) => (prev[key] === status ? prev : { ...prev, [key]: status }));
    if (status !== "idle") AccessibilityInfo.announceForAccessibility(tRef.current(COPY[status]));
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

/**
 * Always mounted with a fixed minimum height, so the row does not jump when the sign appears.
 * The text carries `textTestID` (default `<testID>-text`) only while it shows — what Maestro asserts
 * (flows 12/95 the language one, 129 the scale).
 */
export function SaveSign({
  status,
  testID,
  textTestID,
  className,
}: {
  status: SaveSignStatus;
  testID: string;
  textTestID?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <View testID={testID} accessibilityLiveRegion="polite" className={cn("min-h-4 flex-row items-center", className)}>
      {status === "idle" ? null : (
        <Text testID={textTestID ?? `${testID}-text`} className={cn("text-xs", status === "failed" ? "text-destructive" : "text-muted-foreground")}>
          {status === "saved" ? `✓ ${t(COPY.saved)}` : t(COPY.failed)}
        </Text>
      )}
    </View>
  );
}
