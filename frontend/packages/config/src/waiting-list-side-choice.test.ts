import { describe, expect, it } from "vitest";

import { waitingListJoinSides, waitingListSideChoice } from "./waiting-list-side-choice";
import { localeT } from "./testkit/locale-t";

describe("PAD-920 the student's side choice on the waiting list (notifications.config rule 20)", () => {
  it("[NOTIFICATIONS-CONFIG-73] offers own, other or both only when the coach turned it on", () => {
    const options = waitingListSideChoice({ engineVersion: "new", waitingListSideChoice: true })!;
    expect(options.map((o) => o.value)).toEqual(["own", "other", "both"]);
    expect(options.map((o) => localeT("pt")(o.labelKey))).toEqual(["O meu lado", "O outro lado", "Ambos"]);
    expect(options.map((o) => localeT("en")(o.labelKey))).toEqual(["My side", "The other side", "Both"]);
    expect(waitingListJoinSides("other")).toEqual({ sides: "other" });
    // Off, or an old-engine class: today's absolute choice, and the join sends no `sides`.
    expect(waitingListSideChoice({ engineVersion: "new", waitingListSideChoice: false })).toBeNull();
    expect(waitingListSideChoice({ engineVersion: "old", waitingListSideChoice: true })).toBeNull();
    expect(waitingListSideChoice({})).toBeNull();
    expect(waitingListJoinSides(null)).toEqual({});
  });
});
