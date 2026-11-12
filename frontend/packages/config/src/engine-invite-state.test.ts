import { describe, expect, it } from "vitest";

import type { EngineInviteMeta } from "@levelup/types";
import { engineInviteState, engineInviteTestIds, isEngineInvite } from "./engine-invite-state";
import { localeT } from "./testkit/locale-t";

const NOW = new Date("2026-11-19T17:00:00Z");
const BEFORE = "2026-11-19T16:00:00Z";
const AFTER = "2026-11-19T19:00:00Z";

const meta = (over: Partial<EngineInviteMeta>): EngineInviteMeta => ({
  engine: "new",
  invitationId: 41,
  state: "open",
  startsAt: AFTER,
  ...over,
});

describe("PAD-920 the new engine's invitation bubble (notifications.invitations NB1–NB4)", () => {
  it("[NOTIFICATIONS-INVITATIONS-115] derives every new-engine bubble state for the student and the coach", () => {
    // NB2: the student answers an open invitation before the start, counting or not.
    for (const countsUntil of [AFTER, BEFORE, undefined]) {
      expect(engineInviteState(meta({ countsUntil }), "student", NOW)).toMatchObject({ state: "open", buttons: true, labelKey: null });
    }
    // NB3: the coach's copy never offers Yes/No; counting is derived from countsUntil.
    expect(engineInviteState(meta({ countsUntil: AFTER }), "coach", NOW)).toMatchObject({
      state: "open",
      buttons: false,
      labelKey: "messages.waitingForResponse",
    });
    expect(engineInviteState(meta({ countsUntil: BEFORE }), "coach", NOW)).toMatchObject({
      buttons: false,
      labelKey: "messages.engineInvite.notCounting",
    });

    // NB2 answered: today's labels, and "by the coach" (rule 9).
    const answered = (response: "yes" | "no", answeredBy: "student" | "coach") =>
      engineInviteState(meta({ state: "answered", response, answeredBy }), "student", NOW).labelKey;
    expect(answered("yes", "student")).toBe("messages.accepted");
    expect(answered("no", "student")).toBe("messages.declined");
    expect(answered("yes", "coach")).toBe("messages.acceptedByCoach");
    expect(answered("no", "coach")).toBe("messages.declinedByCoach");

    // The closed states: no buttons, the same label for both viewers.
    const closed: Array<[EngineInviteMeta["state"], string]> = [
      ["sorry", "messages.engineInvite.sorry"],
      ["reopened", "messages.engineInvite.reopened"],
      ["withdrawn", "messages.engineInvite.withdrawn"],
      ["closed_same_hour", "messages.engineInvite.closedSameHour"],
    ];
    for (const [state, key] of closed) {
      for (const viewer of ["student", "coach"] as const) {
        expect(engineInviteState(meta({ state, countsUntil: AFTER }), viewer, NOW)).toMatchObject({ state, buttons: false, labelKey: key });
      }
    }

    // Once the class has started (derived from startsAt): no buttons, whatever the stored state.
    for (const state of ["open", "answered", "sorry"] as const) {
      expect(engineInviteState(meta({ state, startsAt: BEFORE }), "student", NOW)).toMatchObject({
        state: "started",
        buttons: false,
        labelKey: "messages.engineInvite.classStarted",
        testId: "invite-state-41-started",
      });
    }

    for (const lng of ["pt", "en"] as const) {
      const t = localeT(lng);
      for (const key of [...closed.map(([, k]) => k), "messages.engineInvite.notCounting", "messages.engineInvite.classStarted"]) {
        expect(t(key)).not.toBe(key);
      }
    }
    expect(localeT("pt")("messages.engineInvite.closedSameHour")).toBe("Já inscrito noutra aula à mesma hora");
    expect(localeT("en")("messages.engineInvite.withdrawn")).toBe("The coach withdrew this invitation.");
  });

  it("[NOTIFICATIONS-INVITATIONS-115] gives one set of test ids for both shells (NB4)", () => {
    expect(engineInviteState(meta({ state: "sorry" }), "student", NOW).testId).toBe("invite-state-41-sorry");
    expect(engineInviteTestIds(41)).toEqual({ yes: "invite-respond-yes-41", no: "invite-respond-no-41" });
  });

  it("tells a new-engine message from an old one", () => {
    expect(isEngineInvite(meta({}))).toBe(true);
    expect(isEngineInvite({ notificationEventId: 7 })).toBe(false);
    expect(isEngineInvite(null)).toBe(false);
    expect(isEngineInvite({ engine: "new" })).toBe(false);
  });

  it("reads an unknown state from a newer server as closed, never answerable", () => {
    const s = engineInviteState(meta({ state: "something_new" as EngineInviteMeta["state"] }), "student", NOW);
    expect(s.buttons).toBe(false);
    expect(s.labelKey).toBeNull();
  });
});
