/**
 * PAD-406: with one React in the workspace, the harness mounts the REAL `@levelup/hooks` inside a
 * real `QueryClientProvider`. Before, react-query resolved to the root React 18 while the tree
 * rendered with mobile's React 19, and any real hook threw `reading 'useEffect'` (PAD-400) — which
 * is why section tests shim `@levelup/hooks`. This pins the unification; the shim's removal is
 * PAD-406 part C.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// A View, not a Text: react-native's Text is the font-class guard's (R-025) and nothing here renders copy.
import { View } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { version as reactVersion } from "react";

import { useCoachRoster } from "@levelup/hooks";

import { renderNative } from "./render-native";

vi.mock("@levelup/api/src/resources/players", () => ({
  getCoachPlayers: vi.fn(async () => [{ id: 7 }, { id: 9 }]),
}));

function Roster() {
  const roster = useCoachRoster();
  return <View testID="roster" accessibilityLabel={roster.isSuccess ? `${roster.data.length} players` : roster.status} />;
}

describe("@levelup/hooks under the mobile harness (PAD-406)", () => {
  it("a real react-query hook mounts and resolves, with no shim", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = await renderNative(
      <QueryClientProvider client={client}>
        <Roster />
      </QueryClientProvider>,
    );
    await view.flush();
    expect(view.byTestId("roster").props.accessibilityLabel).toBe("2 players");
    expect(reactVersion).toBe("19.1.0");
  });
});
