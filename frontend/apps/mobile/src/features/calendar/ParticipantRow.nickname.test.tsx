/**
 * PAD-660 part 2 (players.nickname rule 8) on iOS: the class screen's marking rows name the
 * student as the coach does; the student's own row (audience "student") keeps their name and
 * never asks for the roster. The resolver is the real `useCoachDisplayName` since PAD-406 (a stand-in before), reading a one-student roster.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { Player } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, o?: { name?: string }) => (o?.name ? `${key}|${o.name}` : key),
    i18n: { language: "pt" },
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
const getCoachPlayers = vi.fn(async () => [{ playerId: "7", name: "Jorge Silva", displayName: "Jorge chato" }]);
vi.mock("@levelup/api/src/resources/players", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getCoachPlayers: () => getCoachPlayers(),
}));

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  getCoachPlayers.mockClear();
});

import { ParticipantRow } from "./ParticipantRow";

const player = { id: 7, user: { name: "Jorge Silva" } } as unknown as Player;
const mount = async (audience: "coach" | "student") => {
  const n = await renderNative(
    createElement(
      QueryClientProvider,
      { client },
      createElement(ParticipantRow, { player, attendance: { status: null }, canMark: audience === "coach", audience })
    )
  );
  await n.flush(); // the roster lands (a student's row never asks for it)
  return JSON.stringify(n.root.toJSON());
};

describe("the class screen's marking row (PAD-660 rule 8)", () => {
  it("a coach reads the nickname in the row and in the mark buttons' labels", async () => {
    const out = await mount("coach");
    expect(out).toContain('"Jorge chato"');
    expect(out).toContain("calendar.attendance.markPresent|Jorge chato");
    expect(out).not.toContain("Jorge Silva");
  });

  it("the student's own row keeps their name", async () => {
    const out = await mount("student");
    expect(out).toContain("Jorge Silva");
    expect(out).not.toContain("Jorge chato");
    expect(getCoachPlayers).not.toHaveBeenCalled();
  });
});
