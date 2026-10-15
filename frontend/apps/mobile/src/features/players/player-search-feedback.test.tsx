/**
 * players.search rule 10 (PAD-665) on iOS: the line under a player-name search box, and the
 * debounce that decides when a server search is asked. The Players tab itself (app/, react-query)
 * is outside the unit harness; its wiring is pinned by reading the source, as
 * class-waiting-list-search.test.ts does, and Maestro drives the screen.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, useEffect, useState } from "react";
import { act, type ReactTestInstance } from "react-test-renderer";
import { PLAYER_SEARCH_DEBOUNCE_MS } from "@levelup/config";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { query?: string }) => (opts?.query !== undefined ? `${key}|${opts.query}` : key),
  }),
}));

import { PlayerSearchFeedback } from "./player-search-feedback";
import { useDebouncedText } from "@/lib/useDebouncedText";

const text = (n: ReactTestInstance): string =>
  n.children.map((c) => (typeof c === "string" ? c : text(c))).join("");

describe("PlayerSearchFeedback (iOS)", () => {
  it("renders nothing for a blank query, whatever the state", async () => {
    const n = await renderNative(createElement(PlayerSearchFeedback, { query: "  ", searching: true, count: 0 }));
    expect(n.queryByTestId("player-search-searching")).toBeNull();
    expect(n.queryByTestId("player-search-empty")).toBeNull();
  });

  it("renders nothing when something was found", async () => {
    const n = await renderNative(createElement(PlayerSearchFeedback, { query: "rui", count: 2 }));
    expect(n.queryByTestId("player-search-empty")).toBeNull();
  });

  it("says it is searching, in place of the empty line", async () => {
    const n = await renderNative(createElement(PlayerSearchFeedback, { query: "rui", searching: true, count: 0 }));
    expect(text(n.byTestId("player-search-searching"))).toBe("players.search.searching");
    expect(n.queryByTestId("player-search-empty")).toBeNull();
  });

  it("names the trimmed query when nobody matches, and goes away when the box is cleared", async () => {
    const n = await renderNative(createElement(PlayerSearchFeedback, { query: "  xavier ", count: 0 }));
    expect(text(n.byTestId("player-search-empty"))).toBe("players.search.noResults|xavier");
    await n.rerender(createElement(PlayerSearchFeedback, { query: "", count: 0 }));
    expect(n.queryByTestId("player-search-empty")).toBeNull();
  });
});

/** A probe that asks the "server" the way every server-backed iOS surface does. */
function Probe({ ask }: { ask: (q: string) => void }) {
  const [typed, setTyped] = useState("");
  const { debounced, settling } = useDebouncedText(typed);
  useEffect(() => {
    if (debounced) ask(debounced);
  }, [debounced, ask]);
  return createElement(
    "view",
    { testID: "probe", onChangeText: setTyped },
    createElement(PlayerSearchFeedback, { query: typed, searching: settling, count: 0 }),
  );
}

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("a server search waits for the typing to stop (rule 10)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("types r-u-i faster than 200 ms apart: one request, for rui, 200 ms after the last letter", async () => {
    const ask = vi.fn();
    const n = await renderNative(createElement(Probe, { ask }));
    for (const value of ["r", "ru", "rui"]) {
      await n.changeText("probe", value);
      await advance(100);
    }
    expect(ask).not.toHaveBeenCalled();
    expect(n.queryByTestId("player-search-searching")).not.toBeNull();
    await advance(PLAYER_SEARCH_DEBOUNCE_MS - 101);
    expect(ask).not.toHaveBeenCalled();
    await advance(1);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith("rui");
    // Settled with nobody found: the searching line gives way to the empty one.
    expect(n.queryByTestId("player-search-searching")).toBeNull();
    expect(text(n.byTestId("player-search-empty"))).toBe("players.search.noResults|rui");
  });
});

describe("the Players tab is wired to the shared feedback (rule 10)", () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const TAB = fs.readFileSync(path.join(HERE, "../../../app/(tabs)/players.tsx"), "utf8");

  it("debounces by the shared constant, keeps the rows while searching and renders the shared line", () => {
    expect(TAB).toMatch(/\}, PLAYER_SEARCH_DEBOUNCE_MS\);/);
    expect(TAB).not.toMatch(/\}, (250|300)\);/);
    expect(TAB).toMatch(/placeholderData: keepPreviousData/);
    expect(TAB).toMatch(/<PlayerSearchFeedback query=\{search\} searching=\{searching\} count=\{totalItems\} \/>/);
    expect(TAB).toMatch(/search\.trim\(\) !== debouncedSearch \|\| \(debouncedSearch !== "" && isFetching\)/);
  });
});
