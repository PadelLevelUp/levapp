import { useEffect, useState } from "react";
import { PLAYER_SEARCH_DEBOUNCE_MS } from "@levelup/config";

/**
 * players.search rule 10 (PAD-665): the text a server search should ask for — `text` trimmed, once
 * it has stopped changing for `delayMs`. `settling` is true from the first keystroke until then, so a
 * surface can say "searching" while it waits as well as while the request is in flight. One copy per
 * shell (a hook in packages/* would pull a second React into the mobile unit harness).
 */
export function useDebouncedText(
  text: string,
  delayMs: number = PLAYER_SEARCH_DEBOUNCE_MS
): { debounced: string; settling: boolean } {
  const trimmed = text.trim();
  const [debounced, setDebounced] = useState(trimmed);
  useEffect(() => {
    if (trimmed === debounced) return;
    const id = setTimeout(() => setDebounced(trimmed), delayMs);
    return () => clearTimeout(id);
  }, [trimmed, debounced, delayMs]);
  return { debounced, settling: trimmed !== debounced };
}
