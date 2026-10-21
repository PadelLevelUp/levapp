import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** PAD-684 (attendance.confirm rule 28): the class screen's "Afinal vou" branches, same test ids as
 * web. Source-reading: app/class/[id].tsx mounts react-query hooks, and a test file under app/
 * would break Metro. */
const SCREEN = readFileSync(resolve(__dirname, "../../..", "app/class/[id].tsx"), "utf8");

describe("the class screen renders the server's comeBack (PAD-684 rule 28)", () => {
  it("decides the branch with the shared comeBackAction on the served field", () => {
    expect(SCREEN).toMatch(/comeBackAction\(instance\?\.comeBack, myState\)/);
    expect(SCREEN).toContain("comeBackFromAnswer(answer)");
  });

  it("rejoin: the button answers yes through the existing confirm handler", () => {
    expect(SCREEN).toMatch(/comeBackKind === "rejoin"[\s\S]{0,200}testID="attendance-come-back"[\s\S]{0,200}onPress=\{handleConfirmMyAttendance\}/);
    expect(SCREEN).toContain('t("calendar.detail.comeBack")');
  });

  it("waiting_list: the spot-taken line and the join for this occurrence", () => {
    expect(SCREEN).toMatch(/comeBackKind === "waiting_list"/);
    expect(SCREEN).toContain('testID="attendance-come-back-spot-taken"');
    expect(SCREEN).toMatch(/testID="attendance-come-back-waiting-list"[\s\S]{0,200}onPress=\{handleComeBackWaitingList\}/);
    expect(SCREEN).toContain("await joinClassWaitingList(event)");
    expect(SCREEN).toContain('t("calendar.detail.spotTaken")');
  });

  it("on_waiting_list: the state line", () => {
    expect(SCREEN).toMatch(/comeBackKind === "on_waiting_list"/);
    expect(SCREEN).toContain('testID="attendance-come-back-on-waiting-list"');
    expect(SCREEN).toContain('t("calendar.detail.onWaitingList")');
  });

  it("an older server keeps the PAD-570 hint", () => {
    expect(SCREEN).toMatch(/comeBackKind === "final_hint"/);
    expect(SCREEN).toContain('testID="class-declined-hint"');
  });
});
