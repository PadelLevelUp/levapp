/**
 * PAD-920 (settings.tutorials NT1–NT4): on a new-engine session the tutorial shows the dry run's
 * queues, one block per open spot type grouped by tier, who is left out and why, and a banner when
 * the run may not plan. The old engine's rendering is untouched.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const simulateInvites = vi.fn();
vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (_id: unknown, real: string | null | undefined) => real ?? "",
}));
vi.mock("@/api/calendar", () => ({
  getCalendarEvents: () =>
    Promise.resolve([
      { id: "c1", type: "class", status: "scheduled", participantCount: 2, date: "2026-11-20", startTime: "18:00",
        title: "Terça", model: "LessonInstance", originalId: 11 },
    ]),
}));
vi.mock("@/api/classes", () => ({
  getClassInstance: () =>
    Promise.resolve({ participants: [{ id: "p-a", user: { name: "Ana" } }, { id: "p-b", user: { name: "Bea" } }] }),
}));
vi.mock("@/api/notificationEngine", () => ({
  simulateInvites: (...a: unknown[]) => simulateInvites(...a),
  explainInviteCandidate: vi.fn(),
  searchPlayers: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "pt" },
    t: (key: string, params?: Record<string, unknown>) =>
      params && Object.keys(params).length ? `${key}:${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(",")}` : key,
  }),
}));

import { UnderstandInvitesTutorial } from "./UnderstandInvitesTutorial";

const entry = (playerId: string, tier: number, rank: number) => ({ playerId, name: `N-${playerId}`, nickname: null, tier, rank });

const answer = (gates: unknown[]) => ({
  evaluatedAt: "2026-11-12T10:00:00",
  approvalRequired: false,
  gates,
  waitingListPlacement: null,
  spot: { side: null, levelId: null, levelCode: null, levelSource: "none", sideCounts: null },
  rounds: [],
  engine: "new",
  spotTypes: [
    {
      side: "left", levelId: null, levelLabel: null, count: 1,
      queue: [entry("s1", 0, 1), entry("s2", 1, 2), entry("s3", 2, 3)],
      verdicts: [
        { playerId: "s1", stage: "invited", tier: 0 },
        { playerId: "s2", stage: "waiting", tier: 1 },
        { playerId: "s3", stage: "waiting", tier: 2 },
        { playerId: "s5", stage: "said_no", tier: null },
        { playerId: "s6", name: "Sofia", nickname: "Sofi", stage: "not_in_pool", tier: null, reasons: [{ code: "excluded_players" }, { code: "same_day_class" }] },
      ],
    },
    {
      side: null, levelId: 4, levelLabel: "M3", count: 2,
      queue: [entry("s4", 2, 1)],
      verdicts: [
        { playerId: "s4", stage: "waiting", tier: 2 },
        { playerId: "s5", stage: "said_no", tier: null },
        { playerId: "s6", name: "Sofia", nickname: "Sofi", stage: "not_in_pool", tier: null, reasons: [{ code: "excluded_players" }, { code: "same_day_class" }] },
      ],
    },
  ],
});

describe("UnderstandInvitesTutorial — new engine (PAD-920)", () => {
  it("[SETTINGS-TUTORIALS-14] shows a block per spot type grouped by tier and who is left out", async () => {
    simulateInvites
      .mockResolvedValueOnce(answer([{ code: "quiet_hours", blocked: false }]))
      .mockResolvedValueOnce(answer([{ code: "quiet_hours", blocked: true, until: "08:00" }]));
    render(<UnderstandInvitesTutorial />);
    fireEvent.click(await screen.findByTestId("tutorial-class-c1"));
    fireEvent.click(await screen.findByTestId("tutorial-player-p-a"));

    // NT1: one block per type, its side and open spots in the header, rows under their tier.
    const left = await screen.findByTestId("tutorial-type-left");
    const either = screen.getByTestId("tutorial-type-either");
    expect(within(left).getByTestId("tutorial-type-header").textContent).toContain("players.sideLeft");
    expect(screen.getByTestId("tutorial-type-left-count").textContent).toBe("tutorials.engine.openSpots:count=1");
    expect(screen.getByTestId("tutorial-type-either-count").textContent).toBe("tutorials.engine.openSpots:count=2");
    expect(within(either).getByTestId("tutorial-type-header").textContent).toContain("tutorials.engine.sideEither");
    expect(within(either).getByTestId("tutorial-type-header").textContent).toContain("M3");
    const tiers = within(left).getAllByTestId(/^tutorial-tier-left-\d+$/);
    expect(tiers.map((t) => t.dataset.testid)).toEqual(["tutorial-tier-left-0", "tutorial-tier-left-1", "tutorial-tier-left-2"]);
    expect(tiers.map((t) => t.querySelector("h5")?.textContent)).toEqual([
      "calendar.detail.tierCoachList",
      "calendar.detail.tierWaitingList",
      "calendar.detail.tierGroup:n=1",
    ]);
    expect(within(tiers[2]).getByTestId("tutorial-row-s3-left").textContent).toContain("N-s3");
    expect(screen.getByTestId("tutorial-row-s1-left").textContent).toContain("tutorials.understandInvites.rank:rank=1");
    expect(screen.getByTestId("tutorial-row-s1-left-stage").textContent).toBe("tutorials.engine.stage.invited");
    expect(within(either).getByTestId("tutorial-row-s4-either-stage").textContent).toBe("tutorials.engine.stage.waiting");
    // The old engine's rounds and spot line are not drawn for a new-engine answer.
    expect(screen.queryByTestId("tutorial-spot")).toBeNull();

    // NT2: collapsed, the two students, three reason lines in all.
    const leftOut = screen.getByTestId("tutorial-left-out") as HTMLDetailsElement;
    expect(leftOut.open).toBe(false);
    expect(within(leftOut).getAllByTestId(/^tutorial-left-out-s\d+$/).map((r) => r.dataset.testid)).toEqual(["tutorial-left-out-s5", "tutorial-left-out-s6"]);
    expect(within(leftOut).getByTestId("tutorial-left-out-s5").textContent).toContain("#s5");
    expect(within(leftOut).getByTestId("tutorial-left-out-s6").textContent).toContain("Sofi");
    expect(within(leftOut).getAllByTestId(/^tutorial-left-out-s\d+-line$/).map((l) => l.textContent)).toEqual([
      "tutorials.engine.stage.said_no",
      "tutorials.engine.reason.excluded_players",
      "tutorials.engine.reason.same_day_class",
    ]);

    // NT3: the run may plan — no banner.
    expect(screen.queryByTestId("tutorial-cannot-plan")).toBeNull();
    expect(screen.getByTestId("tutorial-gates-clear")).toBeTruthy();

    // Quiet hours: the banner says so.
    fireEvent.click(screen.getByTestId("tutorial-player-p-b"));
    const banner = await screen.findByTestId("tutorial-cannot-plan");
    expect(within(banner).getByTestId("tutorial-gate-quiet_hours").textContent).toContain("tutorials.gates.quiet_hours");
    expect(screen.queryByTestId("tutorial-gates-clear")).toBeNull();
  });
});
