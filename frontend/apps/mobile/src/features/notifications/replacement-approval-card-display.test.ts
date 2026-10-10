import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PAD-574 (semi-auto-approval rules 4 and 7a) on iOS: the card renders the shared display groups —
 * the reasons, the counted side label, the five-row preview with "Ver mais", and the "A mostrar 5
 * de 31 · ao aprovar, são convidados todos" line whenever a list is truncated. The card mounts the
 * API layer the unit harness cannot, so this pins the load-bearing tokens in the source; the logic
 * (grouping, preview, labels) is tested in `@levelup/config` `approval-display.test.ts`, and the web
 * card test exercises the same groups end to end.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARD = fs.readFileSync(path.join(HERE, "replacement-approval-card.tsx"), "utf8");

describe("the iOS approval card presents the shared display groups (PAD-574)", () => {
  it("renders groups from the shared helpers, never the raw vacancies", () => {
    for (const token of ["approvalDisplayGroups(bundle.vacancies)", "approvalQueuePreview(group.queue, isExpanded)", "staleCount(group, staleVacancyIds)", "approvalGroupLabel(group, t(approvalSideKey(group.side)))", "approvalStaleLabel(group, stale)"]) {
      expect(CARD).toContain(token);
    }
    expect(CARD).not.toContain("bundle.vacancies.map(");
    expect(CARD).not.toContain("confirmedWontAttend");
  });

  it("carries the ids and keys the spec names, on every block", () => {
    for (const id of ["approval-block", "approval-reason-declined", "approval-reason-open", "approval-group-label", "approval-show-more", "approval-showing-of", "approval-group-stale"]) {
      expect(CARD).toContain(`testID="${id}"`);
    }
    for (const key of ["declinedReason", "openSpotReason", "showMore", "showLess", "showingOf"]) {
      expect(CARD).toContain(`notificationsUi.replacementApproval.${key}`);
    }
  });

  it("prints the approving-invites-all line only while a list is truncated", () => {
    expect(CARD).toContain("{hidden > 0 ? (");
    expect(CARD).toContain('showingOf", { shown: shown.length, total: group.queue.length }');
  });
});
