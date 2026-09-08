import { useCallback, useRef, useState } from "react";
import { popHistory, pushHistory } from "@levelup/config";

/**
 * Undo stack for the tactical board (training.tactical-board rule 4). Every
 * committed mutation pushes the value it replaced; `undo` hands the latest one
 * back through `onChange`. The stack itself lives in a ref (it is never
 * rendered), `canUndo` in state so the button can re-render.
 */
export function useBoardHistory<T>(value: T, onChange: (next: T) => void) {
  const stack = useRef<T[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const commit = useCallback(
    (next: T) => {
      stack.current = pushHistory(stack.current, value);
      setCanUndo(true);
      onChange(next);
    },
    [value, onChange]
  );

  const undo = useCallback(() => {
    const { stack: rest, value: previous } = popHistory(stack.current);
    stack.current = rest;
    setCanUndo(rest.length > 0);
    if (previous !== undefined) onChange(previous);
  }, [onChange]);

  return { commit, undo, canUndo };
}
