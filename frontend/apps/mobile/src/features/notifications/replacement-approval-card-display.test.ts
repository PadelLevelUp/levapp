import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PAD-574 (semi-auto-approval rules 4 and 7a) on iOS: the card renders the shared display groups —
 * a freed spot's reason with the student, an open spot's reason with its counted side label, the
 * five-row preview with "Ver mais", and the "A mostrar 5 de 31 · ao aprovar, são convidados todos"
 * line whenever a list is truncated. The card mounts the API layer the unit harness cannot, so this
 * pins the wiring in the source, as the sibling wiring tests do; the logic is tested in
 * `@levelup/config` `approval-display.test.ts`, and the web card test exercises the same groups.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARD = fs.readFileSync(path.join(HERE, "replacement-approval-card.tsx"), "utf8");

describe("the iOS approval card presents the shared display groups (PAD-574)", () => {
  it("renders groups from the shared helper, never the raw vacancies", () => {
    expect(CARD).toMatch(/const groups = approvalDisplayGroups\(bundle\.vacancies\);/);
    expect(CARD).toMatch(/\{groups\.map\(\(group\) => \{/);
    expect(CARD).not.toMatch(/bundle\.vacancies\.map\(/);
    expect(CARD).not.toContain("confirmedWontAttend");
  });

  it("says why each spot is open: the student for a freed spot, the open-spot reason and counted side label otherwise", () => {
    expect(CARD).toMatch(/testID="approval-reason-declined"[\s\S]{0,120}declinedReason", \{ name: group\.declinedPlayerName \?\? "" \}/);
    expect(CARD).toMatch(/testID="approval-reason-open"[\s\S]{0,80}openSpotReason/);
    expect(CARD).toMatch(/testID="approval-group-label"[\s\S]{0,260}\{ count: group\.count, side: t\(sideKey\(group\.side\)\) \}/);
  });

  it("previews five, offers 'Ver mais' / 'Ver menos', and prints the approving-invites-all line only while truncated", () => {
    expect(CARD).toMatch(/const \{ shown, hidden \} = approvalQueuePreview\(group\.queue, isExpanded\);/);
    expect(CARD).toMatch(/\{shown\.map\(\(player, index\) => \{/);
    expect(CARD).toMatch(/\{hidden > 0 \? \([\s\S]{0,120}testID="approval-showing-of"[\s\S]{0,160}showingOf", \{ shown: shown\.length, total: group\.queue\.length \}/);
    expect(CARD).toMatch(/testID="approval-show-more"[\s\S]{0,400}showLess[\s\S]{0,120}showMore", \{ count: hidden \}/);
  });

  it("counts a block's stale spots", () => {
    expect(CARD).toMatch(/const stale = staleCount\(group, staleVacancyIds\);/);
    expect(CARD).toMatch(/testID="approval-group-stale"[\s\S]{0,300}groupStale", \{ stale, total: group\.vacancyIds\.length \}/);
  });
});
