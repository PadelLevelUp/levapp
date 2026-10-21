/**
 * PAD-660 part 2 (players.nickname rule 8) on iOS: the class screen's marking rows name the
 * student as the coach does; the student's own row (audience "student") keeps their name and
 * never asks for the roster. The resolver is a stand-in mapping one player id.
 */
import { describe, expect, it, vi } from "vitest";
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
vi.mock("@levelup/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: (o?: { enabled?: boolean }) => (id: string | number | null | undefined, real: string | null | undefined) =>
    o?.enabled !== false && String(id) === "7" ? "Jorge chato" : (real ?? ""),
}));

import { ParticipantRow } from "./ParticipantRow";

const player = { id: 7, user: { name: "Jorge Silva" } } as unknown as Player;
const mount = async (audience: "coach" | "student") =>
  JSON.stringify(
    (
      await renderNative(
        createElement(ParticipantRow, { player, attendance: { status: null }, canMark: audience === "coach", audience })
      )
    ).root.toJSON()
  );

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
  });
});
