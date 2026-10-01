import { createElement, useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CoachPlayer } from "@levelup/types";

import { renderNative } from "@/test/render-native";

// The interpolated count is appended so a test can read what a label was given.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}|${Object.values(opts).join("|")}` : key),
  }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/ui/input", async () => {
  const { TextInput } = await import("react-native");
  return { Input: (p: Record<string, unknown>) => createElement(TextInput, p) };
});
// @rn-primitives/tabs, reduced to its contract: a trigger selects its value, a content
// renders only while its value is selected.
vi.mock("@/components/ui/tabs", async () => {
  const React = await import("react");
  const { Pressable, View } = await import("react-native");
  const Ctx = React.createContext<{ value: string; onValueChange: (v: string) => void }>({ value: "", onValueChange: () => {} });
  return {
    Tabs: (p: { value: string; onValueChange: (v: string) => void; children: ReactNode }) =>
      createElement(Ctx.Provider, { value: { value: p.value, onValueChange: p.onValueChange } }, createElement(View, null, p.children)),
    TabsList: (p: { children: ReactNode }) => createElement(View, null, p.children),
    TabsTrigger: (p: { value: string; testID?: string; children: ReactNode }) => {
      const c = React.useContext(Ctx);
      return createElement(Pressable, { testID: p.testID, onPress: () => c.onValueChange(p.value) }, p.children);
    },
    TabsContent: (p: { value: string; children: ReactNode }) => {
      const c = React.useContext(Ctx);
      return c.value === p.value ? createElement(View, null, p.children) : null;
    },
  };
});

import { PlayerSelector } from "./player-selector";

const player = (id: string, name: string): CoachPlayer =>
  ({ id: `cp-${id}`, playerId: id, name, levelId: "1" }) as unknown as CoachPlayer;
const ROSTER = ["1", "2", "3", "4", "5"].map((id) => player(id, `Student ${id}`));

/** The picker as a screen holds it: the chosen ids in state, toggled by onToggle. */
function Holder({ players, loading, initial = [] }: { players: CoachPlayer[]; loading?: boolean; initial?: string[] }) {
  const [ids, setIds] = useState<string[]>(initial);
  return createElement(PlayerSelector, {
    players,
    levels: [],
    selectedPlayerIds: ids,
    classLevelId: null,
    loading,
    onToggle: (id: string) => setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
  } as never);
}

const rendered = (n: Awaited<ReturnType<typeof renderNative>>) => JSON.stringify(n.root.toJSON());

describe("PlayerSelector (classes.create rule 10, classes.edit rule 9)", () => {
  it("applies no cap: a fifth student can be ticked, and the tab shows the count", async () => {
    const n = await renderNative(createElement(Holder, { players: ROSTER }));
    await n.press("player-selector-tab-all");
    for (const id of ["1", "2", "3", "4", "5"]) await n.press(`player-selector-row-${id}`);
    expect(rendered(n)).toContain("calendar.playerSelector.participants|5");
    await n.press("player-selector-tab-participants");
    for (const id of ["1", "2", "3", "4", "5"]) expect(n.queryByTestId(`player-selector-row-${id}`)).not.toBeNull();
  });

  it("while the roster loads, the chosen tab says loading, not 'no participants selected'", async () => {
    const n = await renderNative(createElement(Holder, { players: [], loading: true, initial: ["1", "2"] }));
    expect(n.queryByTestId("player-selector-loading")).not.toBeNull();
    expect(rendered(n)).not.toContain("calendar.playerSelector.noParticipantsSelected");
  });

  it("with no student chosen and the roster loaded, it says so", async () => {
    const n = await renderNative(createElement(Holder, { players: ROSTER }));
    expect(n.queryByTestId("player-selector-loading")).toBeNull();
    expect(rendered(n)).toContain("calendar.playerSelector.noParticipantsSelected");
  });
});
