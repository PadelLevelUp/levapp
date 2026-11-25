import { describe, expect, it } from "vitest";
import {
  blockedNames,
  blockedReasons,
  shouldReportSent,
  splitBlockedByCause,
} from "./notify-blocked";

const unavailableRow = { name: "Ana", cause: "unavailable" };
const optedOutRow = { name: "Bruno", cause: "preference", reason: "Só à noite" };

describe("splitBlockedByCause", () => {
  it("[NOTIFICATIONS-STUDENT-BLOCK-PREFERENCES-9] splits the two causes apart", () => {
    const { unavailable, optedOut } = splitBlockedByCause([
      unavailableRow,
      optedOutRow,
    ]);
    expect(unavailable).toEqual([unavailableRow]);
    expect(optedOut).toEqual([optedOutRow]);
  });

  it("counts a row with no cause as unavailable", () => {
    // An older backend only ever produced the PAD-107 case.
    const legacy = { name: "Carla" };
    const { unavailable, optedOut } = splitBlockedByCause([legacy]);
    expect(unavailable).toEqual([legacy]);
    expect(optedOut).toEqual([]);
  });

  it("[NOTIFICATIONS-STUDENT-BLOCK-PREFERENCES-9] splits on cause, not on reason being empty", () => {
    // A student can block notifications without giving a reason; classifying
    // them as "unavailable" would tell the coach the wrong story.
    const silentOptOut = { name: "Dina", cause: "preference" };
    const { unavailable, optedOut } = splitBlockedByCause([silentOptOut]);
    expect(unavailable).toEqual([]);
    expect(optedOut).toEqual([silentOptOut]);
  });

  it("handles an empty or absent list", () => {
    const empty = {
      unavailable: [],
      optedOut: [],
      alreadyInvited: [],
      alreadyConfirmed: [],
      notComing: [],
      reminderLimit: [],
    };
    expect(splitBlockedByCause([])).toEqual(empty);
    expect(splitBlockedByCause(undefined)).toEqual(empty);
  });

  it("[NOTIFICATIONS-CLASS-REMINDERS-MANUAL-5] gives every cause its own group", () => {
    const rows = [
      { playerId: 1, name: "Ana", cause: "unavailable" },
      { playerId: 2, name: "Bruno", cause: "preference", reason: "Férias" },
      { playerId: 3, name: "Carla", cause: "already_invited" },
      { playerId: 4, name: "Duarte", cause: "already_confirmed" },
      { playerId: 5, name: "Eva", cause: "not_coming" },
      { playerId: 6, name: "Filipe", cause: "reminder_limit" },
      { playerId: 7, name: "Guida" },
    ];
    const split = splitBlockedByCause(rows);
    expect(split.unavailable).toEqual([rows[0], rows[6]]);
    expect(split.optedOut).toEqual([rows[1]]);
    expect(split.alreadyInvited).toEqual([rows[2]]);
    expect(split.alreadyConfirmed).toEqual([rows[3]]);
    expect(split.notComing).toEqual([rows[4]]);
    expect(split.reminderLimit).toEqual([rows[5]]);
    // No row in two groups, and none lost.
    const all = Object.values(split).flat();
    expect(all).toHaveLength(rows.length);
    expect(new Set(all).size).toBe(rows.length);
  });
});

describe("blockedNames", () => {
  it("comma-joins the names", () => {
    expect(blockedNames([unavailableRow, optedOutRow])).toBe("Ana, Bruno");
  });

  it("drops nameless rows rather than rendering a gap", () => {
    expect(blockedNames([{ name: null }, unavailableRow, { name: "" }])).toBe("Ana");
  });

  it("is an empty string for nothing blocked", () => {
    expect(blockedNames([])).toBe("");
    expect(blockedNames(undefined)).toBe("");
  });
});

describe("blockedReasons", () => {
  it("joins the reasons students gave", () => {
    expect(
      blockedReasons([optedOutRow, { name: "Eva", cause: "preference", reason: "Lesão" }])
    ).toBe("Só à noite · Lesão");
  });

  it("is an empty string when nobody gave a reason", () => {
    expect(blockedReasons([{ name: "Dina", cause: "preference" }])).toBe("");
  });
});

describe("shouldReportSent", () => {
  it("[NOTIFICATIONS-STUDENT-BLOCK-PREFERENCES-9] reports a successful send", () => {
    expect(shouldReportSent(3, [optedOutRow])).toBe(true);
  });

  it("reports a clean zero when nobody was blocked", () => {
    expect(shouldReportSent(0, [])).toBe(true);
  });

  it("[NOTIFICATIONS-STUDENT-BLOCK-PREFERENCES-9] stays quiet when everyone was blocked", () => {
    // PAD-107's ordering: no "sent to 0" on top of the blocked toast.
    expect(shouldReportSent(0, [unavailableRow, optedOutRow])).toBe(false);
  });
});

describe("PAD-620: already_invited is its own bucket", () => {
  it("never lands in unavailable, and is listed apart", () => {
    const rows = [
      { name: "Ana", cause: "unavailable" },
      { name: "Bia", cause: "preference" },
      { name: "Carla", cause: "already_invited" },
      { name: "Duarte" },
    ];
    const split = splitBlockedByCause(rows);
    expect(split.unavailable.map((r) => r.name)).toEqual(["Ana", "Duarte"]);
    expect(split.optedOut.map((r) => r.name)).toEqual(["Bia"]);
    expect(split.alreadyInvited.map((r) => r.name)).toEqual(["Carla"]);
  });
});

describe("blockedNames with the coach's resolver (PAD-683, players.nickname rule 9b)", () => {
  it("names each student through it, by player id", () => {
    const nameOf = (id: string | number | undefined, fallback: string | null | undefined) =>
      String(id) === "7" ? "Ana Tigre" : fallback ?? "";
    expect(
      blockedNames([{ playerId: 7, name: "Ana", cause: "unavailable" }, { playerId: 8, name: "Bruno" }], nameOf)
    ).toBe("Ana Tigre, Bruno");
  });
});
