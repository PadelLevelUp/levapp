import { describe, expect, it } from "vitest";

import { busySameHourClashes, busySameHourLines } from "./busy-same-hour-copy";
import { resolveText } from "./invite-simulation";
import { localeT } from "./testkit/locale-t";

const clash = {
  playerId: "p1",
  playerName: "Rita",
  lessonInstanceId: 9,
  title: "Aula da Ana",
  start: "2026-11-19T19:00:00",
};
const refusal = { response: { status: 409, data: { code: "busy_same_hour", clashes: [clash] } } };

describe("PAD-920 a coach's add at a busy hour (classes.instance-enrollment rule 15)", () => {
  it("[CLASSES-INSTANCE-ENROLLMENT-31] renders one line per clash in both locales", () => {
    const clashes = busySameHourClashes(refusal)!;
    expect(clashes).toHaveLength(1);
    const [pt] = busySameHourLines(clashes, "pt").map((l) => resolveText(localeT("pt"), l));
    const [en] = busySameHourLines(clashes, "en").map((l) => resolveText(localeT("en"), l));
    expect(pt).toBe("Rita já está inscrito noutra aula à mesma hora (Aula da Ana, 19/11 19:00). Remove-o dessa aula primeiro.");
    expect(en).toBe("Rita is already in another class at the same time (Aula da Ana, 19/11 19:00). Remove them from that class first.");
    // Two students, or one student in two series occurrences: one line each.
    const two = busySameHourLines([clash, { ...clash, playerName: "Rui", start: "2026-11-26T19:00:00" }], "en");
    expect(two.map((l) => resolveText(localeT("en"), l))[1]).toContain("Rui is already in another class");
  });

  it("reads only a 409 busy_same_hour, so every other failure keeps its own message", () => {
    expect(busySameHourClashes({ response: { status: 409, data: { code: "side_full" } } })).toBeNull();
    expect(busySameHourClashes({ response: { status: 500, data: { code: "busy_same_hour", clashes: [] } } })).toBeNull();
    expect(busySameHourClashes(new Error("network"))).toBeNull();
  });
});
