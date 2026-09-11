import { describe, expect, it } from "vitest";

import {
  SETTINGS_SECTIONS,
  visibleSections,
  type SettingsSectionId,
} from "./settings-sections";

/**
 * PAD-169. `visibleSections()` is the ONLY role gate on the Settings drill-in
 * — it builds the nav and resolves the open section — so it is worth pinning
 * on its own, without a simulator. Rules under test:
 * `settings.role-scope` 2 (student-visible sections), 3 (coach-only sections)
 * and 4 (one list drives everything).
 */

const idsFor = (isCoach: boolean, isSuperAdmin = false): SettingsSectionId[] =>
  visibleSections(isCoach, isSuperAdmin).map((s) => s.id);

describe("SETTINGS_SECTIONS", () => {
  it("states an audience for every section — there is no default", () => {
    for (const section of SETTINGS_SECTIONS) {
      // PAD-210 (auth.coach-approval rule 7) adds `superadmin` — the LevApp
      // admin's tools, gated on the flag, never on role.
      expect(["everyone", "coach", "student", "superadmin"]).toContain(section.audience);
    }
  });

  it("has no duplicate ids", () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the student's own preferences on a DIFFERENT id from the coach engine", () => {
    // settings.role-scope rule 2: distinct ids, so hiding the coach's
    // notification-engine section can never hide the student's own one.
    const engine = SETTINGS_SECTIONS.find((s) => s.id === "notifications");
    const mine = SETTINGS_SECTIONS.find((s) => s.id === "myNotifications");
    expect(engine?.audience).toBe("coach");
    expect(mine?.audience).toBe("student");
  });
});

describe("visibleSections(isCoach = false) — the student", () => {
  it("offers the student's own notification preferences", () => {
    expect(idsFor(false)).toContain("myNotifications");
  });

  it("offers exactly Profile, Preferences, My notifications, My connections and Account", () => {
    // PAD-287 (settings.role-scope rule 2): My connections sits just before Account.
    expect(idsFor(false)).toEqual([
      "profile",
      "preferences",
      "myNotifications",
      "connections",
      "account",
    ]);
  });

  it("still hides every coach-only section", () => {
    // The regression PAD-169 must not re-open: widening the gating from a
    // coach-only list to an audience field has to leave these hidden.
    const ids = idsFor(false);
    for (const coachOnly of [
      "calendar",
      "notifications",
      "tutorials",
      "import",
      "club",
    ] as const) {
      expect(ids).not.toContain(coachOnly);
    }
  });
});

describe("visibleSections(isCoach = true) — the coach", () => {
  it("does NOT offer the student's own notification preferences", () => {
    // A coach never receives a class-vacancy invitation, so the controls
    // could not affect their account (web made the same call in PAD-142).
    expect(idsFor(true)).not.toContain("myNotifications");
  });

  it("offers every other section, in registry order", () => {
    expect(idsFor(true)).toEqual([
      "profile",
      "preferences",
      "calendar",
      "notifications",
      // PAD-104: the coach's class-requests inbox (web keeps it in the sidebar).
      "classRequests",
      "tutorials",
      "import",
      "club",
      // PAD-287: shared with the student, just before Account.
      "connections",
      "account",
    ]);
  });
});

describe("My connections (PAD-287, settings.role-scope rule 2)", () => {
  it("is offered to both roles", () => {
    const section = SETTINGS_SECTIONS.find((s) => s.id === "connections");
    expect(section?.audience).toBe("everyone");
    expect(idsFor(false)).toContain("connections");
    expect(idsFor(true)).toContain("connections");
  });
});

describe("the two audiences together", () => {
  it("show every section to exactly one role, or to both", () => {
    const coach = new Set(idsFor(true));
    const student = new Set(idsFor(false));
    for (const section of SETTINGS_SECTIONS) {
      if (section.audience === "superadmin") continue;
      // No section is unreachable: an "everyone/coach/student" audience is
      // total, unlike two independent booleans.
      expect(coach.has(section.id) || student.has(section.id)).toBe(true);
    }
  });
});

describe("the superadmin (PAD-210, auth.coach-approval rule 7)", () => {
  it("is the only one offered the Admin section", () => {
    expect(idsFor(true)).not.toContain("admin");
    expect(idsFor(false)).not.toContain("admin");
    expect(idsFor(true, true)).toContain("admin");
    expect(idsFor(false, true)).toContain("admin");
  });

  it("keeps their role's sections — the flag adds, never replaces", () => {
    expect(idsFor(true, true)).toEqual([...idsFor(true), "admin"]);
    expect(idsFor(false, true)).toEqual([...idsFor(false), "admin"]);
  });

  it("is reachable by every superadmin section", () => {
    const superadmin = new Set(idsFor(true, true));
    for (const section of SETTINGS_SECTIONS) {
      if (section.audience === "superadmin") expect(superadmin.has(section.id)).toBe(true);
    }
  });
});
