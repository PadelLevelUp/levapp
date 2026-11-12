/**
 * PAD-920 (semi-auto-approval N1, N3, N5) on iOS: the class screen's new-engine card follows the
 * session's approval state across re-reads, as `mergeSuggestionBundles` does for old-engine bundles
 * (PAD-770, rule 12b). The screen has no render harness, so the decision is a pure function and its
 * use in the screen is read from the source.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EngineApprovalState } from "@levelup/types";

import { nextEngineClassCard, showsEngineRecompute } from "./engine-approval-class-state";

const src = readFileSync(join(__dirname, "../../../app/class/[id].tsx"), "utf8");

const state = (s: EngineApprovalState["state"], requestId?: number): EngineApprovalState => ({
  engine: "new",
  state: s,
  semiAutomatic: true,
  approved: [],
  removed: [],
  ...(requestId != null
    ? { request: { requestId, lessonInstanceId: 40, spotTypes: [{ side: "left", levelId: 3, levelLabel: "Nível 3", count: 1, queue: [] }] } }
    : {}),
});

const none = new Set<string>();

describe("the class screen's new-engine card (semi-auto-approval N1, N3, N5)", () => {
  it("[NOTIFICATIONS-SEMI-AUTO-APPROVAL-44] the class card follows the session's approval state across re-reads", () => {
    // A pending request is the card, and a newer one replaces it.
    const first = nextEngineClassCard(null, { kind: "read", state: state("pending", 1) }, none);
    expect(first?.request?.requestId).toBe(1);
    expect(showsEngineRecompute(first)).toBe(false);
    const second = nextEngineClassCard(first, { kind: "read", state: state("pending", 2) }, none);
    expect(second?.request?.requestId).toBe(2);

    // Nothing pending and nothing answered here: no card.
    expect(nextEngineClassCard(second, { kind: "read", state: state("none") }, none)).toBeNull();
    expect(showsEngineRecompute(null)).toBe(true);

    // A request the coach approved here stays across a re-read answering `none`, until the screen closes.
    const answered = new Set(["2"]);
    const kept = nextEngineClassCard(second, { kind: "read", state: state("none") }, answered);
    expect(kept).toBe(second);
    expect(nextEngineClassCard(kept, { kind: "read", state: state("none") }, answered)).toBe(second);

    // A re-read answering `dismissed` drops the kept answered request and shows dismissed, with the recompute.
    const dropped = nextEngineClassCard(kept, { kind: "read", state: state("dismissed") }, answered);
    expect(dropped).toBeNull();
    expect(showsEngineRecompute(dropped)).toBe(true);
    const withRequest = nextEngineClassCard(kept, { kind: "read", state: state("dismissed", 3) }, answered);
    expect(withRequest?.state).toBe("dismissed");
    expect(withRequest?.request?.requestId).toBe(3);
    expect(showsEngineRecompute(withRequest)).toBe(true);

    // "Ignorar" here keeps the card, dismissed ("Ignorado"), with the recompute beside it; a re-read
    // still dismissed keeps it.
    const ignored = nextEngineClassCard(first, { kind: "dismissed" }, none);
    expect(ignored?.state).toBe("dismissed");
    expect(ignored?.request?.requestId).toBe(1);
    expect(showsEngineRecompute(ignored)).toBe(true);
    expect(nextEngineClassCard(ignored, { kind: "read", state: state("dismissed") }, none)).toBe(ignored);
    // An ignored card is not kept as answered once the session is no longer dismissed.
    expect(nextEngineClassCard(ignored, { kind: "read", state: state("none") }, new Set(["1"]))).toBeNull();

    // A recompute replaces the card with its answer.
    const fresh = nextEngineClassCard(ignored, { kind: "recompute", state: state("pending", 4) }, none);
    expect(fresh?.request?.requestId).toBe(4);
    expect(fresh?.state).toBe("pending");
    expect(nextEngineClassCard(kept, { kind: "recompute", state: state("none") }, answered)).toBeNull();

    // The screen decides with this function and shows no old and new cards together.
    expect(src).toContain('nextEngineClassCard(prev, { kind: "read", state: s }, answeredBundleIdsRef.current)');
    expect(src).toContain('nextEngineClassCard(prev, { kind: "recompute", state: s }, answeredBundleIdsRef.current)');
    expect(src).toContain('nextEngineClassCard(prev, { kind: "dismissed" }, answeredBundleIdsRef.current)');
    expect(src).toContain("showsEngineRecompute(engineApproval)");
    expect(src).not.toContain("setEngineApproval(null);\n                    setSuggestionsIgnored(true)");
  });
});
