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
  it("splits the two causes apart", () => {
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

  it("splits on cause, not on reason being empty", () => {
    // A student can block notifications without giving a reason; classifying
    // them as "unavailable" would tell the coach the wrong story.
    const silentOptOut = { name: "Dina", cause: "preference" };
    const { unavailable, optedOut } = splitBlockedByCause([silentOptOut]);
    expect(unavailable).toEqual([]);
    expect(optedOut).toEqual([silentOptOut]);
  });

  it("handles an empty or absent list", () => {
    expect(splitBlockedByCause([])).toEqual({ unavailable: [], optedOut: [] });
    expect(splitBlockedByCause(undefined)).toEqual({ unavailable: [], optedOut: [] });
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
  it("reports a successful send", () => {
    expect(shouldReportSent(3, [optedOutRow])).toBe(true);
  });

  it("reports a clean zero when nobody was blocked", () => {
    expect(shouldReportSent(0, [])).toBe(true);
  });

  it("stays quiet when everyone was blocked", () => {
    // PAD-107's ordering: no "sent to 0" on top of the blocked toast.
    expect(shouldReportSent(0, [unavailableRow, optedOutRow])).toBe(false);
  });
});
