import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, popHistory, pushHistory } from "./board-history";

// training.tactical-board rule 4 — undo depth ≥ 20, framework-free so both shells share it.
describe("board history", () => {
  it("pushes the previous value and pops it back", () => {
    const s1 = pushHistory<number>([], 1);
    const s2 = pushHistory(s1, 2);
    expect(s2).toEqual([1, 2]);
    const popped = popHistory(s2);
    expect(popped).toEqual({ stack: [1], value: 2 });
  });

  it("returns undefined when there is nothing to undo", () => {
    expect(popHistory<number>([])).toEqual({ stack: [], value: undefined });
  });

  it("keeps at most HISTORY_LIMIT entries, dropping the oldest", () => {
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(20);
    let stack: number[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) stack = pushHistory(stack, i);
    expect(stack).toHaveLength(HISTORY_LIMIT);
    expect(stack[0]).toBe(5);
  });
});
