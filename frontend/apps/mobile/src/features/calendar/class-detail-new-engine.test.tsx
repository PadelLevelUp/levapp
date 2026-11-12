/**
 * PAD-920 on iOS (calendar.event-detail ND1–ND3): the class screen's invitee list for a new-engine
 * session. Each row shows the shared helper's label under `invitee-outcome-<playerId>-<outcome>`,
 * its notes (reopened included) and its tier text under the label; the open spots read
 * "N pendentes", counting `pending` only. An old-engine row (no `tierSource` key) gets no tier text.
 * The words are the pt locale's values for the shared keys (the mobile bundle imports that file).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { INVITATION_OUTCOME_KEY, inviteeActionsFor } from "@levelup/config";
import type { ClassInvitation, InvitationOutcome } from "@levelup/types";
import calendarPt from "../../../../../src/locales/pt/calendar.json";
import { renderNative } from "@/test/render-native";
import { InviteeOutcome, OpenSpotsLine } from "./invitee-outcome";

// t → the pt value of the key, interpolated: the row's words are the shared key's words.
const ptValue = (key: string, params?: Record<string, unknown>) => {
  const raw = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], calendarPt);
  if (typeof raw !== "string") throw new Error(`no pt value for ${key}`);
  return raw.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name]));
};
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => ptValue(k, o) }) }));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREEN = fs.readFileSync(path.resolve(HERE, "../../..", "app/class/[id].tsx"), "utf8");

const textOf = (node: { children: unknown[] }): string =>
  node.children.map((c) => (typeof c === "string" ? c : textOf(c as { children: unknown[] }))).join("");

let nextId = 1;
const invitee = (playerId: string, outcome: InvitationOutcome, extra: Partial<ClassInvitation> = {}): ClassInvitation => ({
  id: nextId++,
  playerId,
  playerName: `P${playerId}`,
  status: "sent",
  outcome,
  answer: null,
  answeredBy: null,
  tierSource: "coach_list",
  groupNumber: null,
  reofferedAt: null,
  ...extra,
});

// One invitee per new-engine outcome; two of them still count (`pending`).
const NEW_ENGINE: ClassInvitation[] = [
  invitee("1", "cancelled", { answer: "yes" }),
  invitee("2", "accepted", { answer: "yes", tierSource: "pool", groupNumber: 2 }),
  invitee("3", "declined", { answer: "no", answeredBy: "coach" }),
  invitee("4", "withdrawn", { tierSource: null }),
  invitee("5", "closed_same_hour", { tierSource: "students_list" }),
  invitee("6", "sorry", { answer: "yes" }),
  invitee("7", "expired"),
  invitee("8", "pending", { reofferedAt: "2026-11-12T10:00:00Z" }),
  invitee("9", "pending"),
  invitee("10", "not_counting"),
];

describe("the iOS class detail's new-engine invitee list (PAD-920)", () => {
  it("[CALENDAR-EVENT-DETAIL-36] labels the new engine's outcomes and shows the pending count", async () => {
    for (const inv of NEW_ENGINE) {
      const n = await renderNative(<InviteeOutcome inv={inv} />);
      const label = n.byTestId(`invitee-outcome-${inv.playerId}-${inv.outcome}`);
      expect(textOf(label)).toBe(ptValue(INVITATION_OUTCOME_KEY[inv.outcome]));
    }

    // Notes: the coach's record and the reopened note, from the shared `inviteeNotes`.
    const declined = await renderNative(<InviteeOutcome inv={NEW_ENGINE[2]} />);
    expect(textOf(declined.byTestId("invitee-recorded-by-coach-3"))).toBe(ptValue("calendar.detail.recordedByCoach"));
    const reopened = await renderNative(<InviteeOutcome inv={NEW_ENGINE[7]} />);
    expect(textOf(reopened.byTestId("invitee-reopened-8"))).toBe("convite reaberto");
    expect(reopened.queryByTestId("invitee-moved-from-spot-8")).toBeNull();

    // Tier text under the label: coach's list, group N, waiting list, manual.
    const tier = async (inv: ClassInvitation) =>
      textOf((await renderNative(<InviteeOutcome inv={inv} />)).byTestId(`invitee-tier-${inv.playerId}`));
    expect(await tier(NEW_ENGINE[0])).toBe("lista do treinador");
    expect(await tier(NEW_ENGINE[1])).toBe("grupo 2");
    expect(await tier(NEW_ENGINE[4])).toBe("lista de espera");
    expect(await tier(NEW_ENGINE[3])).toBe("convite manual");

    // "N pendentes" beside the open spots counts `pending` only, never `not_counting`.
    const line = await renderNative(<OpenSpotsLine openSpots={3} invitations={NEW_ENGINE} />);
    expect(textOf(line.byTestId("class-open-spots"))).toBe(ptValue("calendar.detail.openSpotsPending", { count: 3, pending: 2 }));
    const full = await renderNative(<OpenSpotsLine openSpots={0} invitations={NEW_ENGINE} />);
    expect(full.queryByTestId("class-open-spots")).toBeNull();

    // The screen wires both, and gates each row's actions on the shared `inviteeActionsFor`.
    expect(SCREEN).toMatch(/<InviteeOutcome inv=\{inv\} \/>/);
    expect(SCREEN).toMatch(/isCoach \? \(\s*<OpenSpotsLine openSpots=\{maxPlayers - filled\} invitations=\{invitations\} \/>/);
    expect(SCREEN).toMatch(/inviteeActionsFor\(inv\.outcome\)\.length > 0 \? \(\s*<Pressable\s+testID=\{`invitee-actions-\$\{inv\.playerId\}`\}/);
    for (const closed of ["sorry", "closed_same_hour", "cancelled"] as const) expect(inviteeActionsFor(closed)).toEqual([]);
  });

  it("an old-engine row renders as before, with no tier text; the open-spots line shows for it too", async () => {
    const { tierSource: _t, groupNumber: _g, reofferedAt: _r, ...old } = invitee("20", "pending", {
      movedAt: "2026-11-12T09:00:00Z",
    });
    const n = await renderNative(<InviteeOutcome inv={old as ClassInvitation} />);
    expect(n.byTestId("invitee-outcome-20-pending")).toBeTruthy();
    expect(n.byTestId("invitee-moved-from-spot-20")).toBeTruthy();
    expect(n.queryByTestId("invitee-tier-20")).toBeNull();
    const line = await renderNative(<OpenSpotsLine openSpots={2} invitations={[old as ClassInvitation]} />);
    expect(textOf(line.byTestId("class-open-spots"))).toBe(ptValue("calendar.detail.openSpotsPending", { count: 2, pending: 1 }));
  });
});
