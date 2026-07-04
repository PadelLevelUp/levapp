import { useEffect, useRef, useState } from "react";
import { checkFieldAvailable } from "@levelup/api/src/resources/fields";

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
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const trimmed = value.trim();

    if (!trimmed) {
      setError(null);
      setChecking(false);
      return;
    }

    setChecking(true);
    setError(null);
    clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      const msg = await checkFieldAvailable(model, field, trimmed, scope);
      setError(msg);
      setChecking(false);
    }, debounceMs);

    return () => clearTimeout(timerRef.current);
  }, [model, field, value, scope, debounceMs]);

  return { checking, error };
}
