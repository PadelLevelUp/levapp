import { describe, expect, it } from "vitest";

import type { EngineInviteMeta } from "@levelup/types";
import { engineInviteState, engineInviteTestIds, isEngineInvite } from "./engine-invite-state";
import { localeT } from "./testkit/locale-t";

const meta = (over: Partial<EngineInviteMeta>): EngineInviteMeta => ({
  engine: "new",
  invitationId: 41,
  state: "open",
  ...over,
});

describe("PAD-920 the new engine's invitation bubble (notifications.invitations NB1–NB4)", () => {
  it("[NOTIFICATIONS-INVITATIONS-115] derives every new-engine bubble state for the student and the coach", () => {
    // NB2: the student answers an open invitation whether or not it still counts.
    for (const counting of [true, false, undefined]) {
      const s = engineInviteState(meta({ counting }), "student");
      expect(s).toMatchObject({ state: "open", buttons: true, labelKey: null });
    }
    // NB3: the coach's copy never offers Yes/No; counting reads "awaiting", not counting reads its own line.
    expect(engineInviteState(meta({ counting: true }), "coach")).toMatchObject({
      state: "open",
      buttons: false,
      labelKey: "messages.waitingForResponse",
    });
    expect(engineInviteState(meta({ counting: false }), "coach")).toMatchObject({
      buttons: false,
      labelKey: "messages.engineInvite.notCounting",
    });
    // "no longer counts" is the coach's alone: the student's copy of the same invitation never says it.
    expect(engineInviteState(meta({ counting: false }), "student").labelKey).toBeNull();

    // NB2 answered: today's labels, and "by the coach" (rule 9).
    const answered = (response: "yes" | "no", answeredBy: "student" | "coach") =>
      engineInviteState(meta({ state: "answered", response, answeredBy }), "student").labelKey;
    expect(answered("yes", "student")).toBe("messages.accepted");
    expect(answered("no", "student")).toBe("messages.declined");
    expect(answered("yes", "coach")).toBe("messages.acceptedByCoach");
    expect(answered("no", "coach")).toBe("messages.declinedByCoach");

    // The four states with no buttons, the same label for both viewers.
    const closed: Array<[EngineInviteMeta["state"], string]> = [
      ["sorry", "messages.engineInvite.sorry"],
      ["reoffered", "messages.engineInvite.reoffered"],
      ["closed_same_hour", "messages.bookedSameDay"],
      ["class_started", "messages.engineInvite.classStarted"],
    ];
    for (const [state, key] of closed) {
      for (const viewer of ["student", "coach"] as const) {
        expect(engineInviteState(meta({ state, counting: true }), viewer)).toMatchObject({
          state,
          buttons: false,
          labelKey: key,
        });
      }
    }

    // Every label has words in both locales, never a raw key.
    for (const lng of ["pt", "en"] as const) {
      const t = localeT(lng);
      for (const [, key] of closed) expect(t(key)).not.toBe(key);
      expect(t("messages.engineInvite.notCounting")).not.toBe("messages.engineInvite.notCounting");
    }
    expect(localeT("pt")("messages.engineInvite.sorry")).toBe("Disseste que sim, mas a vaga já tinha sido ocupada.");
    expect(localeT("en")("messages.engineInvite.notCounting")).toBe("No answer · no longer counts");
  });

  it("[NOTIFICATIONS-INVITATIONS-115] gives one set of test ids for both shells (NB4)", () => {
    expect(engineInviteState(meta({ state: "sorry" }), "student").testId).toBe("invite-state-41-sorry");
    expect(engineInviteTestIds(41)).toEqual({ yes: "invite-respond-yes-41", no: "invite-respond-no-41" });
  });

  it("tells a new-engine message from an old one", () => {
    expect(isEngineInvite({ engine: "new", invitationId: 1, state: "open" })).toBe(true);
    expect(isEngineInvite({ notificationEventId: 7 })).toBe(false);
    expect(isEngineInvite(null)).toBe(false);
    expect(isEngineInvite({ engine: "new" })).toBe(false); // no invitationId: not answerable, not ours
  });

  it("reads an unknown state from a newer server as closed, never answerable", () => {
    const s = engineInviteState(meta({ state: "something_new" as EngineInviteMeta["state"] }), "student");
    expect(s.buttons).toBe(false);
    expect(s.labelKey).toBeNull();
  });
});
