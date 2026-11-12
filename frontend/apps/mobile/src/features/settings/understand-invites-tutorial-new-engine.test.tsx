/**
 * PAD-920 (settings.tutorials NT1–NT4) on iOS: a new-engine simulation answer renders one block per
 * open spot type with its queue grouped by tier, a collapsed "who is left out and why" section, and the
 * cannot-plan banner when a gate blocks — the same test ids as web. An old-engine answer never takes
 * this path (`isNewEngineSimulation`).
 */
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import type { ReactTestInstance } from "react-test-renderer";
import type { InviteSimulation } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { isNewEngineSimulation, NewEngineResults } from "./understand-invites-new-engine";

const verdicts = [
  { playerId: "p1", stage: "invited", tier: 0 },
  { playerId: "p2", stage: "waiting", tier: 1 },
  { playerId: "p3", stage: "failed_tier_rule", tier: null },
  {
    playerId: "p4",
    stage: "not_in_pool",
    tier: null,
    reasons: [{ code: "excluded_players" }, { code: "same_day_class" }],
  },
  { playerId: "p5", stage: "said_no", tier: null },
];

function answer(gates: InviteSimulation["gates"]): InviteSimulation {
  return {
    evaluatedAt: "2026-11-12T10:00:00",
    approvalRequired: false,
    gates,
    waitingListPlacement: null,
    spot: { side: null, levelCode: null, levelSource: "none" } as unknown as InviteSimulation["spot"],
    rounds: [],
    engine: "new",
    spotTypes: [
      {
        side: "left",
        levelId: 3,
        levelLabel: "M3",
        count: 1,
        queue: [
          { playerId: "p1", name: "Ana", nickname: null, tier: 0, rank: 1 },
          { playerId: "p2", name: "Bruno", nickname: "Bru", tier: 1, rank: 2 },
        ],
        verdicts,
      },
      {
        side: null,
        levelId: null,
        levelLabel: null,
        count: 2,
        queue: [{ playerId: "p3", name: "Carla", nickname: null, tier: 2, rank: 1 }],
        verdicts: verdicts.map((v) => (v.playerId === "p3" ? { ...v, stage: "waiting", tier: 2 } : v)),
      },
    ],
  };
}

/** Every string under a node, joined — the rendered words of one row or line. */
function textOf(node: ReactTestInstance | string): string {
  if (typeof node === "string") return node;
  return node.children.map(textOf).join("");
}

const displayName = (id: string | number, fallback: string) => (id === "p4" ? "Diana" : fallback);

describe("Understand invites — new-engine results (iOS)", () => {
  it("[SETTINGS-TUTORIALS-15] shows a block per spot type grouped by tier and who is left out", async () => {
    const n = await renderNative(
      <NewEngineResults
        simulation={answer([{ code: "quiet_hours", blocked: false }] as InviteSimulation["gates"])}
        displayName={displayName}
      />,
    );

    // NT1: one block per type, in the payload's order; no right block.
    expect(n.byTestId("tutorial-type-left")).toBeTruthy();
    expect(n.byTestId("tutorial-type-either")).toBeTruthy();
    expect(n.queryByTestId("tutorial-type-right")).toBeNull();

    // Rows under their tier names: coach's list, students' list, then group 1.
    const left = n.byTestId("tutorial-type-left");
    const tier0 = n.byTestId("tutorial-tier-left-0");
    const tier1 = n.byTestId("tutorial-tier-left-1");
    expect(textOf(tier0)).toContain("calendar.detail.tierCoachList");
    expect(textOf(tier1)).toContain("calendar.detail.tierWaitingList");
    expect(tier0.findAll((x) => typeof x.type === "string" && x.props.testID === "tutorial-row-p1-left")).toHaveLength(1);
    expect(tier1.findAll((x) => typeof x.type === "string" && x.props.testID === "tutorial-row-p2-left")).toHaveLength(1);
    expect(left.findAll((x) => typeof x.type === "string" && x.props.testID === "tutorial-row-p3-either")).toHaveLength(0);
    expect(textOf(n.byTestId("tutorial-tier-either-2"))).toContain("calendar.detail.tierGroup");
    expect(n.byTestId("tutorial-row-p3-either")).toBeTruthy();

    // Each row: the student (the coach's nickname first), the rank, N6's stage line.
    expect(textOf(n.byTestId("tutorial-row-p2-left"))).toContain("Bru");
    expect(textOf(n.byTestId("tutorial-row-p2-left"))).toContain("tutorials.understandInvites.rank");
    expect(textOf(n.byTestId("tutorial-row-p1-left-stage"))).toBe("tutorials.engine.stage.invited");
    expect(textOf(n.byTestId("tutorial-row-p3-either-stage"))).toBe("tutorials.engine.stage.waiting");

    // NT2: left out, collapsed; opened it holds the two students and three reason lines in all.
    expect(n.byTestId("tutorial-left-out")).toBeTruthy();
    expect(n.queryByTestId("tutorial-left-out-p4")).toBeNull();
    await n.press("tutorial-left-out");
    expect(n.byTestId("tutorial-left-out-p4")).toBeTruthy();
    expect(n.byTestId("tutorial-left-out-p5")).toBeTruthy();
    expect(n.queryByTestId("tutorial-left-out-p1")).toBeNull();
    expect(n.queryByTestId("tutorial-left-out-p3")).toBeNull();
    const lines = n.root.root.findAll(
      (x) => typeof x.type === "string" && /^tutorial-left-out-p\d-line$/.test(x.props.testID ?? ""),
    );
    expect(lines.map(textOf)).toEqual([
      "• tutorials.engine.reason.excluded_players",
      "• tutorials.engine.reason.same_day_class",
      "• tutorials.engine.stage.said_no",
    ]);
    expect(textOf(n.byTestId("tutorial-left-out-p4"))).toContain("Diana");

    // NT3: the run may plan, so no banner.
    expect(n.queryByTestId("tutorial-cannot-plan")).toBeNull();

    // With may_plan false in quiet hours, the banner says so.
    await n.rerender(
      <NewEngineResults
        simulation={answer([{ code: "quiet_hours", blocked: true, until: "07:00" }] as InviteSimulation["gates"])}
        displayName={displayName}
      />,
    );
    const banner = n.byTestId("tutorial-cannot-plan");
    expect(textOf(banner)).toContain("tutorials.gates.quiet_hours");
    expect(n.byTestId("tutorial-type-left")).toBeTruthy();
  });

  it("takes the new-engine path only for a new-engine answer", () => {
    const answerNew = answer([]);
    const { engine: _engine, spotTypes: _types, ...old } = answerNew;
    expect(isNewEngineSimulation(answerNew)).toBe(true);
    expect(isNewEngineSimulation(old as InviteSimulation)).toBe(false);
    expect(isNewEngineSimulation({ ...old, spotTypes: [] } as InviteSimulation)).toBe(true);
  });
});
