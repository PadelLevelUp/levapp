/**
 * PAD-770 (semi-auto-approval rule 12b, B-692): the class screen's approval cards follow the class.
 * The screen has no render harness, so its wiring is read from the source; the merge itself is
 * tested in @levelup/config approval-display.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "../../../app/class/[id].tsx"), "utf8");

describe("the class screen re-reads its suggestions with the class (PAD-770)", () => {
  it("reads them again whenever the class query is read again", () => {
    expect(src).toContain("dataUpdatedAt: instanceReadAt");
    expect(src).toMatch(/\[isCoach, suggestionsInstanceId, instanceReadAt\]\);/);
  });

  it("drops cards no longer pending and keeps the one the coach just answered", () => {
    expect(src).toContain("mergeSuggestionBundles(prev, suggestionBundles(s), answeredBundleIdsRef.current)");
    expect(src).toContain("answeredBundleIdsRef.current.add(approvalBundle.bundleId)");
  });
});

describe("the message's queue says when it was built (PAD-770, rule 12b)", () => {
  const bubble = readFileSync(join(__dirname, "../messages/components/message-bubble.tsx"), "utf8");
  const card = readFileSync(join(__dirname, "replacement-approval-card.tsx"), "utf8");

  it("the conversation passes the message's time; the class's cards pass none", () => {
    expect(bubble).toContain("queueAsOf={message.timestamp}");
    expect(src).not.toContain("queueAsOf");
  });

  it("the card renders the shared label", () => {
    expect(card).toContain("queueAsOfLabel(queueAsOf)");
    expect(card).toContain('testID="approval-queue-as-of"');
  });
});
