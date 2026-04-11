import { useEffect, useRef, useState } from "react";
import { checkFieldAvailable } from "@/api/fields";

export function useFieldAvailability(
  model: string,
  field: string,
  value: string,
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
      const msg = await checkFieldAvailable(model, field, trimmed);
      setError(msg);
      setChecking(false);
    }, debounceMs);

    return () => clearTimeout(timerRef.current);
  }, [model, field, value, debounceMs]);

  return { checking, error };
}
