/**
 * PAD-920 (settings.tutorials NT1–NT4) on iOS: a new-engine simulation answer renders one block per
 * open spot type with its queue grouped by tier, a collapsed "who is left out and why" section, and the
 * cannot-plan banner when a gate blocks — the same test ids as web, each carrying the type's side and
 * level. An old-engine answer never takes this path (`isNewEngineSimulation`). `t` here reads the real
 * pt locale files, so a missing key shows up as the key, not as the words the coach reads.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import type { ReactTestInstance } from "react-test-renderer";
import type { InviteSimulation } from "@levelup/types";
import { renderNative } from "@/test/render-native";

// Each locale file wraps its strings in its namespace (`{ "tutorials": { … } }`), so merging them gives
// the full key path `tutorials.engine.sideEither`.
const PT = Object.assign(
  {},
  ...["tutorials", "players", "calendar"].map((ns) =>
    JSON.parse(readFileSync(resolve(__dirname, `../../../../../src/locales/pt/${ns}.json`), "utf8")),
  ),
) as Record<string, unknown>;

function lookup(path: string): unknown {
  return path.split(".").reduce<unknown>((n, p) => (n && typeof n === "object" ? (n as Record<string, unknown>)[p] : undefined), PT);
}

/** i18next's plural rule for pt: `_zero` at 0, then Intl's one/other. */
function ptT(key: string, params?: Record<string, unknown>): string {
  let raw = lookup(key);
  if (typeof params?.count === "number") {
    const count = params.count;
    raw = (count === 0 ? lookup(`${key}_zero`) : undefined) ?? lookup(`${key}_${new Intl.PluralRules("pt").select(count)}`) ?? raw;
  }
  if (typeof raw !== "string") return key;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? ""));
}

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: ptT, i18n: { language: "pt" } }) }));

const pt = (key: string, params?: Record<string, unknown>) => ptT(key, params);

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
  // N2: a student off the coach's roster, named by the payload.
  { playerId: "p6", name: "Eva Fora", nickname: "Evinha", stage: "said_no", tier: null },
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
      // A second left type at another level: its ids must not collide with the M3 one's.
      {
        side: "left",
        levelId: 5,
        levelLabel: "M5",
        count: 0,
        queue: [{ playerId: "p1", name: "Ana", nickname: null, tier: 0, rank: 1 }],
        verdicts,
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
    const within = (node: ReactTestInstance, testID: string) =>
      node.findAll((x) => typeof x.type === "string" && x.props.testID === testID);

    // NT1/NT4: one block per type, in the payload's order, each id carrying its side and level.
    const blocks = n.root.root
      .findAll((x) => typeof x.type === "string" && /^tutorial-type-(left|right|either)-[^-]+$/.test(x.props.testID ?? ""))
      .map((x) => x.props.testID);
    expect(blocks).toEqual(["tutorial-type-left-3", "tutorial-type-either-any", "tutorial-type-left-5"]);
    expect(n.queryByTestId("tutorial-type-left")).toBeNull();
    expect(n.queryByTestId("tutorial-type-either")).toBeNull();

    // The header reads the side's word and the type's open spots in the coach's words.
    const left = n.byTestId("tutorial-type-left-3");
    const either = n.byTestId("tutorial-type-either-any");
    expect(textOf(within(left, "tutorial-type-header")[0])).toBe(`${pt("players.sideLeft")} · M3`);
    expect(textOf(within(either, "tutorial-type-header")[0])).toBe(pt("tutorials.engine.sideEither"));
    expect(pt("tutorials.engine.sideEither")).toBe("Qualquer lado");
    expect(textOf(n.byTestId("tutorial-type-left-3-count"))).toBe("1 vaga");
    expect(textOf(n.byTestId("tutorial-type-either-any-count"))).toBe("2 vagas");
    expect(textOf(n.byTestId("tutorial-type-left-5-count"))).toBe(pt("tutorials.engine.openSpots_zero", { count: 0 }));

    // Two left types at different levels: the same student's row is distinct in each.
    expect(n.byTestId("tutorial-row-p1-left-3")).toBeTruthy();
    expect(n.byTestId("tutorial-row-p1-left-5")).toBeTruthy();
    expect(within(left, "tutorial-row-p1-left-5")).toHaveLength(0);
    expect(n.byTestId("tutorial-tier-left-5-0")).toBeTruthy();

    // Rows under their tier names: coach's list, students' list, then group 1.
    const tier0 = n.byTestId("tutorial-tier-left-3-0");
    const tier1 = n.byTestId("tutorial-tier-left-3-1");
    expect(textOf(tier0)).toContain(pt("calendar.detail.tierCoachList"));
    expect(textOf(tier1)).toContain(pt("calendar.detail.tierWaitingList"));
    expect(within(tier0, "tutorial-row-p1-left-3")).toHaveLength(1);
    expect(within(tier1, "tutorial-row-p2-left-3")).toHaveLength(1);
    expect(within(left, "tutorial-row-p3-either-any")).toHaveLength(0);
    expect(textOf(n.byTestId("tutorial-tier-either-any-2"))).toContain(pt("calendar.detail.tierGroup", { n: 1 }));
    expect(n.byTestId("tutorial-row-p3-either-any")).toBeTruthy();

    // Each row: the student (the coach's nickname first), the rank, N6's stage line.
    expect(textOf(n.byTestId("tutorial-row-p2-left-3"))).toContain("Bru");
    expect(textOf(n.byTestId("tutorial-row-p2-left-3"))).toContain(pt("tutorials.understandInvites.rank", { rank: 2 }));
    expect(textOf(n.byTestId("tutorial-row-p1-left-3-stage"))).toBe(pt("tutorials.engine.stage.invited"));
    expect(textOf(n.byTestId("tutorial-row-p3-either-any-stage"))).toBe(pt("tutorials.engine.stage.waiting"));

    // NT2: left out, collapsed, under its title; opened it holds the three students and four lines.
    expect(textOf(n.byTestId("tutorial-left-out"))).toContain("Quem não entra e porquê");
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
      `• ${pt("tutorials.engine.reason.excluded_players")}`,
      `• ${pt("tutorials.engine.reason.same_day_class")}`,
      `• ${pt("tutorials.engine.stage.said_no")}`,
      `• ${pt("tutorials.engine.stage.said_no")}`,
    ]);
    expect(lines.map(textOf)).not.toContainEqual(expect.stringContaining("tutorials."));
    // The coach's name first; an off-roster student by the payload's nickname; the id only without a name.
    expect(textOf(n.byTestId("tutorial-left-out-p4"))).toContain("Diana");
    expect(textOf(n.byTestId("tutorial-left-out-p6"))).toContain("Evinha");
    expect(textOf(n.byTestId("tutorial-left-out-p5"))).toContain("#p5");

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
    expect(textOf(banner)).toContain(pt("tutorials.understandInvites.blockedTitle"));
    expect(n.byTestId("tutorial-gate-quiet_hours")).toBeTruthy();
    expect(n.byTestId("tutorial-type-left-3")).toBeTruthy();
  });

  it("takes the new-engine path only for a new-engine answer", () => {
    const answerNew = answer([]);
    const { engine: _engine, spotTypes: _types, ...old } = answerNew;
    expect(isNewEngineSimulation(answerNew)).toBe(true);
    expect(isNewEngineSimulation(old as InviteSimulation)).toBe(false);
    expect(isNewEngineSimulation({ ...old, spotTypes: [] } as InviteSimulation)).toBe(true);
  });
});
