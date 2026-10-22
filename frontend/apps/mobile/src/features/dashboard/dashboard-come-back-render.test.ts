import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** PAD-684 (attendance.confirm rule 28, dashboard.blocks rule 3a): the hero and schedule rows render the
 * server's `comeBack`, same test ids as web. Source-reading: blocks.tsx mounts react-query hooks. */
const BLOCKS = readFileSync(resolve(__dirname, "blocks.tsx"), "utf8");

describe("the dashboard blocks render the server's comeBack (PAD-684 rule 28)", () => {
  it("the hero and the schedule rows delegate the not_coming slot to ComeBackSlot", () => {
    expect(BLOCKS).toMatch(/heroAction === "declined"[\s\S]{0,200}<ComeBackSlot item=\{d\} onNavy \/>/);
    expect(BLOCKS).toMatch(/action === "declined"[\s\S]{0,200}<ComeBackSlot item=\{row\} \/>/);
  });

  it("decides the branch with the shared comeBackAction on the served field", () => {
    expect(BLOCKS).toMatch(/comeBackAction\(item\.comeBack, item\.attendanceState\)/);
    expect(BLOCKS).toContain("comeBackFromAnswer(result)");
  });

  it("rejoin: the button answers yes for the item's instance", () => {
    expect(BLOCKS).toMatch(/kind === "rejoin"[\s\S]{0,300}testID="dashboard-come-back"/);
    expect(BLOCKS).toMatch(/lessonInstanceId: item\.lessonInstanceId, action: "yes"/);
    expect(BLOCKS).toContain('t("calendar.detail.comeBack")');
  });

  it("waiting_list: the spot-taken line and the join by the item's declineTarget", () => {
    expect(BLOCKS).toMatch(/kind === "waiting_list"/);
    expect(BLOCKS).toContain('testID="dashboard-come-back-spot-taken"');
    expect(BLOCKS).toMatch(/testID="dashboard-come-back-waiting-list"[\s\S]{0,400}onPress=\{joinWaitingList\}/);
    expect(BLOCKS).toContain("join.mutate(item.declineTarget");
    expect(BLOCKS).toContain('t("calendar.detail.spotTaken")');
  });

  it("on_waiting_list: the state line; an older server keeps the PAD-570 hint", () => {
    expect(BLOCKS).toContain('testID="dashboard-come-back-on-waiting-list"');
    expect(BLOCKS).toContain('t("calendar.detail.onWaitingList")');
    expect(BLOCKS).toMatch(/kind === "final_hint"[\s\S]{0,200}testID="dashboard-declined-hint"/);
  });
});
