/**
 * PAD-659 on iOS/Android (`calendar.event-detail` rules 22, 23, 24) and PAD-663 (rule 25).
 *
 * The grouping and the order are `@levelup/config`'s (tested there); this file holds what the
 * phone adds: the grouped list renders in that order with the mobile test ids, the side chip is
 * not a button, and the class screen / participant row / pop-up are wired to the shared helpers
 * (source reads, the house pattern for a screen — `attendance-state-render.test.ts`).
 * Mobile group containers are `participant-group-<key>` (a testID cannot repeat per group).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";
import { ParticipantGroups } from "./ParticipantGroups";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o?.count != null ? `${k}#${o.count}` : k) }),
}));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(HERE, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(MOBILE_ROOT, rel), "utf8");

const player = (id: number, name: string) => ({ id, userId: id + 100, user: { name } }) as never;
const presence = (playerId: number, status: string) =>
  ({ playerId, status, validated: false, confirmed: status === "coming" }) as never;
const rosterEntry = (playerId: number, side: string | null) => ({ playerId: String(playerId), name: "x", side }) as never;

describe("ParticipantGroups", () => {
  const participants = [player(1, "Zé"), player(2, "Ana"), player(3, "Rui"), player(4, "Bia")];
  // 1: planned (no presence), 2: attended (going), 3: not_coming, 4: planned
  const presences = [
    { playerId: 2, status: "present", validated: true, confirmed: true },
    { playerId: 3, status: "absent", validated: false, confirmed: false, cancelledAt: "2026-10-10T10:00:00Z", cancelledBy: "student" },
  ] as never;
  const roster = [rosterEntry(1, "left"), rosterEntry(2, "right"), rosterEntry(3, null), rosterEntry(4, "both")];

  it("renders the three groups in order with their rows ordered by side then name", async () => {
    const n = await renderNative(
      <ParticipantGroups participants={participants} presences={presences} roster={roster} onOpen={() => undefined} />
    );
    expect(n.byTestId("participant-group-going")).toBeTruthy();
    expect(n.byTestId("participant-group-pending")).toBeTruthy();
    expect(n.byTestId("participant-group-not_going")).toBeTruthy();
    const order = n.root.root
      .findAll((x) => typeof x.type === "string" && /^participant-(group-[a-z_]+|row-\d+)$/.test(String(x.props?.testID ?? "")))
      .map((x) => x.props.testID);
    expect(order).toEqual([
      "participant-group-going",
      "participant-row-2",
      "participant-group-pending",
      "participant-row-4", // both
      "participant-row-1", // left
      "participant-group-not_going",
      "participant-row-3",
    ]);
  });

  it("opens the row on its name button, and the side chip is not pressable and carries the long form", async () => {
    const onOpen = vi.fn();
    const n = await renderNative(
      <ParticipantGroups participants={participants} presences={presences} roster={roster} onOpen={onOpen} />
    );
    await n.press("participant-open-4");
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].playerId).toBe("4");
    const chip = n.root.root.findAll((x) => x.props?.testID === "participant-side" && typeof x.type === "string");
    expect(chip.length).toBe(3);
    expect(chip.every((c) => typeof c.props.onPress !== "function")).toBe(true);
    expect(chip.map((c) => c.props.accessibilityLabel)).toContain("calendar.participants.sideLong.both");
  });
});

describe("wiring (source reads)", () => {
  it("the class screen renders the grouped list and refetches on presence_changed", () => {
    const s = read("app/class/[id].tsx");
    expect(s).toContain("<ParticipantGroups");
    expect(s).toContain("<ParticipantSheet");
    expect(s).toContain("presenceChangedFor(");
    expect(s).toContain('testID="attendance-edit"');
    expect(s).toContain('testID="participants-enrolled"');
    expect(s).toContain("displayStateOf(");
    expect(s).toContain("classHasEnded(");
  });
  it("ParticipantRow words from displayStateOf but keeps the stored state in the test id", () => {
    const r = read("src/features/calendar/ParticipantRow.tsx");
    expect(r).toContain("displayStateOf(state, classEnded)");
    expect(r).toContain("classEnded = true");
    expect(r).toContain("`attendance-state-${state}`");
  });
  it("the pop-up carries the contract test ids", () => {
    const p = read("src/features/calendar/ParticipantSheet.tsx");
    for (const id of [
      "participant-popup",
      "participant-popup-close",
      "participant-popup-state",
      "participant-popup-message",
      "participant-popup-profile",
    ]) {
      expect(p).toContain(`"${id}"`);
    }
    expect(p).toContain("<Modal");
    expect(p).not.toMatch(/className="[^"]*active:/);
  });

  it("R-025: weights are named by class, never by an inline fontWeight (inert on the custom family)", () => {
    for (const file of ["ParticipantSheet.tsx", "ParticipantGroups.tsx"]) {
      expect(fs.readFileSync(path.join(HERE, file), "utf8"), file).not.toMatch(/fontWeight/);
    }
  });
});
