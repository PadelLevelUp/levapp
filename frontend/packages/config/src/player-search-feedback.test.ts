import { describe, expect, it } from "vitest";
import { PLAYER_SEARCH_DEBOUNCE_MS, playerSearchFeedback } from "./player-search-feedback";

describe("playerSearchFeedback (players.search rule 10)", () => {
  it("waits 200 ms after the last keystroke", () => {
    expect(PLAYER_SEARCH_DEBOUNCE_MS).toBe(200);
  });

  it("says nothing for a blank or whitespace query, whatever the state", () => {
    expect(playerSearchFeedback("", { searching: false, count: 0 })).toBe("none");
    expect(playerSearchFeedback("   ", { searching: true, count: 0 })).toBe("none");
  });

  it("says searching while a search is in flight, even with earlier rows on screen", () => {
    expect(playerSearchFeedback("rui", { searching: true, count: 0 })).toBe("searching");
    expect(playerSearchFeedback("rui", { searching: true, count: 5 })).toBe("searching");
  });

  it("says empty when a settled non-blank query matched nobody", () => {
    expect(playerSearchFeedback("  xavier ", { searching: false, count: 0 })).toBe("empty");
  });

  it("says nothing when something was found", () => {
    expect(playerSearchFeedback("rui", { searching: false, count: 2 })).toBe("none");
  });
});
