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

/** attendance.confirm rule 32: source-reading (the screen mounts react-query hooks and lives under app/). */
describe("the class screen shows 'Afinal vou' only while a place is free (rule 32)", () => {
  it('[ATTENDANCE-CONFIRM-46] the class screen offers "Afinal vou" only for rejoin', () => {
    // The button is rendered under the rejoin branch alone; waiting_list and on_waiting_list carry the
    // plain line, and a spot_filled tap shows the waiting_list branch from the answer.
    const button = SCREEN.indexOf('testID="attendance-come-back"');
    const branch = SCREEN.lastIndexOf('comeBackKind === "rejoin"', button);
    expect(branch).toBeGreaterThan(-1);
    expect(SCREEN.slice(branch, button)).not.toMatch(/comeBackKind === "(waiting_list|on_waiting_list)"/);
    expect(SCREEN.match(/testID="attendance-come-back"/g)).toHaveLength(1);
    expect(SCREEN).toMatch(/comeBackKind === "waiting_list"[\s\S]{0,300}t\("calendar\.detail\.spotTaken"\)/);
    expect(SCREEN).toMatch(/const shown = comeBackFromAnswer\(answer\);\s*if \(shown\) setComeBackShown\(shown\);/);
    // A refused return is information, never an error.
    expect(SCREEN).toMatch(/if \(outcome\.tone === "error"\) toast\.error\(t\(outcome\.messageKey\)\);\s*else toast\.success/);
  });
});

describe("the join block's status line (calendar.event-detail rule 26, PAD-842)", () => {
  it("[CALENDAR-EVENT-DETAIL-39] takes it from the shared joinRequestStatusKey, never the raw status", () => {
    expect(SCREEN).toMatch(/joinRequestStatusKey\(instance\?\.myJoinRequest\)[\s\S]{0,200}testID="class-join-request-status"/);
    expect(SCREEN).not.toContain("t(`calendar.joinRequest.${instance.myJoinRequest.status}`)");
  });
});
