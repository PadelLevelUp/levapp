import { useEffect, useRef, useState } from "react";
import { checkFieldConflict, type FieldConflict } from "@levelup/api/src/resources/fields";

export function useFieldAvailability(
  model: string,
  field: string,
  value: string,
  // PAD-17: optional coach id used to scope warn-only checks (player name) to
  // the requesting coach's own roster. Ignored by unique-field checks.
  scope?: string | number | null,
  debounceMs = 500,
) {
  const [checking, setChecking] = useState(false);
  // B-102: the conflict carries its reason; shells render it with
  // `fieldConflictText(conflict, t)`. `error` stays the server's text so
  // truthiness checks keep working.
  const [conflict, setConflict] = useState<FieldConflict | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const trimmed = value.trim();

    if (!trimmed) {
      setConflict(null);
      setChecking(false);
      return;
    }

    setChecking(true);
    setConflict(null);
    clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      setConflict(await checkFieldConflict(model, field, trimmed, scope));
      setChecking(false);
    }, debounceMs);

    return () => clearTimeout(timerRef.current);
  }, [model, field, value, scope, debounceMs]);

  return { checking, error: conflict?.message ?? null, conflict };
}
