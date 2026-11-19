import { describe, expect, it } from "vitest";
import {
  SETUP_GUIDE_STEPS,
  SETUP_GUIDE_STEP_WEIGHT,
  deviceStepState,
  nextPendingStepAfter,
  setupGuideState,
  sheetIsSnoozed,
  type SetupGuideInput,
} from "./student-setup-guide";

const NOW = new Date("2026-11-19T10:00:00Z");
const GUIDE = { snoozedAt: null, hidden: false, readyClosed: false, alwaysAvailable: false, alertsConfirmed: false };

function input(over: Partial<SetupGuideInput> & { guide?: Partial<typeof GUIDE> } = {}): SetupGuideInput {
  const { guide, ...rest } = over;
  return {
    me: { roles: ["player"], requestAlerts: true, coaches: [], setupGuide: { ...GUIDE, ...guide } },
    blockers: [],
    profileIncomplete: null,
    device: "ask",
    now: NOW,
    ...rest,
  };
}

const CURRENT = { date: "2026-11-16", isRecurring: true, recurrenceEnd: "2027-02-16" };

describe("setupGuideState", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-1] percent is done steps times the weight, for every combination", () => {
    for (let mask = 0; mask < 32; mask++) {
      const on = (i: number) => (mask & (1 << i)) !== 0;
      const v = setupGuideState(
        input({
          guide: { alertsConfirmed: on(0) },
          device: on(1) ? "done" : "ask",
          blockers: on(2) ? [CURRENT] : [],
          me: {
            roles: ["player"],
            requestAlerts: true,
            coaches: on(3) ? [{ id: 1 }] : [],
            setupGuide: { ...GUIDE, alertsConfirmed: on(0) },
          },
          profileIncomplete: on(4) ? null : { coaches: [{}] },
        })
      );
      const expected = [on(0), on(1), on(2), on(3), on(3) && on(4)];
      expect(SETUP_GUIDE_STEPS.map((s) => v.steps[s] === "done")).toEqual(expected);
      expect(v.percent).toBe(expected.filter(Boolean).length * SETUP_GUIDE_STEP_WEIGHT);
      expect(v.next).toBe(SETUP_GUIDE_STEPS.find((_, i) => !expected[i]) ?? null);
    }
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-1] profile is pending with no coach and while a coach is listed incomplete", () => {
    expect(setupGuideState(input({ profileIncomplete: null })).steps.profile).toBe("pending");
    const linked = input({ me: { roles: ["player"], coaches: [{ id: 1 }], setupGuide: GUIDE } });
    expect(setupGuideState({ ...linked, profileIncomplete: { coaches: [{}] } }).steps.profile).toBe("pending");
    expect(setupGuideState({ ...linked, profileIncomplete: null }).steps.profile).toBe("done");
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-3] request alerts count only when ON and confirmed in the guide", () => {
    expect(setupGuideState(input({ guide: { alertsConfirmed: false } })).steps.request_alerts).toBe("pending");
    expect(setupGuideState(input({ guide: { alertsConfirmed: true } })).steps.request_alerts).toBe("done");
    const off = input({ me: { roles: ["player"], requestAlerts: false, setupGuide: { ...GUIDE, alertsConfirmed: true } } });
    expect(setupGuideState(off).steps.request_alerts).toBe("pending");
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-15] step 3 needs a block with an occurrence today or later, or always-available", () => {
    const step3 = (over: Partial<SetupGuideInput> & { guide?: Partial<typeof GUIDE> }) =>
      setupGuideState(input(over)).steps.unavailability;
    expect(step3({ blockers: [] })).toBe("pending");
    expect(step3({ blockers: [CURRENT] })).toBe("done");
    expect(step3({ blockers: [{ date: "2026-11-18", isRecurring: false, recurrenceEnd: null }] })).toBe("pending");
    expect(step3({ blockers: [{ date: "2026-11-19", isRecurring: false, recurrenceEnd: null }] })).toBe("done");
    expect(step3({ blockers: [{ date: "2026-08-01", isRecurring: true, recurrenceEnd: "2026-11-10" }] })).toBe("pending");
    expect(step3({ blockers: [{ date: "2026-08-01", isRecurring: true, recurrenceEnd: null }] })).toBe("done");
    expect(step3({ blockers: [], guide: { alwaysAvailable: true } })).toBe("done");
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-22] a step is unknown until its sources answer, and unknown never reads as done", () => {
    const allDone = {
      me: { roles: ["player"], requestAlerts: true, coaches: [{ id: 1 }], setupGuide: { ...GUIDE, alertsConfirmed: true } },
      blockers: [CURRENT],
      device: "done" as const,
    };
    const loadingDashboard = setupGuideState(input({ ...allDone, profileIncomplete: undefined }));
    expect(loadingDashboard.steps.profile).toBe("unknown");
    expect(loadingDashboard.percent).toBeNull();
    expect(loadingDashboard.showReady).toBe(false);
    expect(loadingDashboard.showSheet).toBe(false);
    expect(loadingDashboard.showCard).toBe(true);

    const loadingBlockers = setupGuideState(input({ ...allDone, blockers: undefined, profileIncomplete: null }));
    expect(loadingBlockers.steps.unavailability).toBe("unknown");
    expect(loadingBlockers.showReady).toBe(false);

    const loaded = setupGuideState(input({ ...allDone, profileIncomplete: null }));
    expect([loaded.percent, loaded.showReady, loaded.showCard]).toEqual([100, true, false]);

    expect(setupGuideState(input({ me: undefined })).showCard).toBe(false);
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-5] hidden removes the sheet, the card, the ring and the ready card", () => {
    const v = setupGuideState(input({ guide: { hidden: true } }));
    expect([v.showSheet, v.showCard, v.showRing, v.showReady]).toEqual([false, false, false, false]);
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-18] after Conta pronta is closed no surface shows, even if a step is undone", () => {
    const v = setupGuideState(input({ guide: { readyClosed: true } }));
    expect([v.showSheet, v.showCard, v.showRing, v.showReady]).toEqual([false, false, false, false]);
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-20] a coach never sees the guide", () => {
    const v = setupGuideState(input({ me: { roles: ["coach"], coaches: [], setupGuide: GUIDE } }));
    expect([v.student, v.showSheet, v.showCard, v.showReady]).toEqual([false, false, false, false]);
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-6] the next pending step after one, skipping done steps", () => {
    const v = setupGuideState(
      input({
        me: { roles: ["player"], requestAlerts: true, coaches: [{ id: 1 }], setupGuide: { ...GUIDE, alertsConfirmed: true } },
        profileIncomplete: { coaches: [{}] },
      })
    );
    expect(v.next).toBe("device_push");
    expect(nextPendingStepAfter(v, "device_push")).toBe("unavailability");
    expect(nextPendingStepAfter(v, "unavailability")).toBe("profile");
    expect(nextPendingStepAfter(v, "profile")).toBeNull();
  });
});

describe("sheetIsSnoozed", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-4] the sheet returns after the next Lisbon midnight, not the UTC one", () => {
    const at = "2026-07-14T22:30:00+00:00"; // 23:30 Lisbon, summer
    expect(sheetIsSnoozed(at, new Date("2026-07-14T22:50:00Z"))).toBe(true); // 23:50 Lisbon
    expect(sheetIsSnoozed(at, new Date("2026-07-14T23:10:00Z"))).toBe(false); // 00:10 Lisbon, same UTC day
    expect(sheetIsSnoozed(null, NOW)).toBe(false);
    const snoozed = setupGuideState(input({ guide: { snoozedAt: at }, now: new Date("2026-07-14T22:50:00Z") }));
    expect([snoozed.showSheet, snoozed.showCard]).toEqual([false, true]);
  });
});

describe("deviceStepState", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-9] device step state for each platform and permission", () => {
    expect([
      deviceStepState("ios", "undetermined"),
      deviceStepState("ios", "denied"),
      deviceStepState("ios", "granted"),
      deviceStepState("android", "denied"),
      deviceStepState("web", "default"),
      deviceStepState("web", "denied"),
      deviceStepState("web", "granted", true),
      deviceStepState("web", "granted", false),
      deviceStepState("web", "unsupported"),
      deviceStepState("web_ios_browser", "granted"),
    ]).toEqual(["ask", "open_settings", "done", "open_settings", "ask", "padlock", "done", "ask", "unsupported", "ios_browser"]);
  });
});
