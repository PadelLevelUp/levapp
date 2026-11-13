/**
 * PAD-933 / PAD-932 (dashboard.blocks NA5, owner decision 18): on a new-engine class the coach's
 * empty-seats card counts the engine's pending invitations on its detail line, and keeps
 * "Convidar N jogadores" (a manual invitation there goes through the engine, PAD-932) and "Mais tarde". An item without
 * `engineVersion` comes from an older server and reads as `old`. Asserted by test id and i18n key.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DashboardNeedsYouBlock, DashboardNeedsYouEmptySeats } from "@levelup/types";

const { t } = vi.hoisted(() => ({
  t: (key: string, opts?: Record<string, unknown>) => (opts?.count !== undefined ? `${key}:${opts.count}` : key),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t, i18n: { language: "pt" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@levelup/api/src/resources/dashboard", () => ({ snoozeNeedsYouItem: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { NeedsYouQueue } from "./NeedsYouQueue";

const card = (over: Partial<DashboardNeedsYouEmptySeats>): DashboardNeedsYouEmptySeats => ({
  kind: "empty_seats",
  id: "lessoninstance-783",
  classTitle: "Ensaio motor novo",
  seatsMissing: 3,
  date: "2026-11-13",
  timeLabel: "17:00",
  filled: 1,
  capacity: 4,
  href: "/calendar?classId=lessoninstance-783&date=2026-11-13&notify=1",
  ...over,
});

const show = (item: DashboardNeedsYouEmptySeats) => {
  const block: DashboardNeedsYouBlock = { id: "needs_you", type: "needs_you", data: { count: 1, items: [item] } };
  render(<MemoryRouter><NeedsYouQueue block={block} /></MemoryRouter>);
};

afterEach(cleanup);

describe("the empty-seats card on a new-engine class (PAD-933, PAD-932)", () => {
  it("[DASHBOARD-BLOCKS-59] shows the pending count and keeps the invite button on a new-engine class", () => {
    const id = "lessoninstance-783";
    // New engine, 5 pending: the count on the detail line, Convidar and Mais tarde stay.
    show(card({ engineVersion: "new", pendingInvites: 5 }));
    expect(screen.getByTestId(`needs-you-pending-${id}`)).toHaveTextContent(
      "dashboard.needsYou.emptySeats.pending:5",
    );
    expect(screen.getByTestId(`needs-you-invite-${id}`)).toHaveTextContent(
      "dashboard.needsYou.emptySeats.invite:3",
    );
    expect(screen.getByTestId("needs-you-later")).toBeInTheDocument();
    cleanup();

    // New engine, nothing pending: no pending line, Convidar stays.
    show(card({ engineVersion: "new", pendingInvites: 0 }));
    expect(screen.queryByTestId(`needs-you-pending-${id}`)).toBeNull();
    expect(screen.getByTestId(`needs-you-invite-${id}`)).toBeInTheDocument();
    cleanup();

    // Old engine, and an item without engineVersion: Convidar as today, no pending line.
    for (const item of [card({ engineVersion: "old" }), card({})]) {
      show(item);
      expect(screen.getByTestId(`needs-you-invite-${id}`)).toHaveTextContent(
        "dashboard.needsYou.emptySeats.invite:3",
      );
      expect(screen.queryByTestId(`needs-you-pending-${id}`)).toBeNull();
      cleanup();
    }
  });

  it("[DASHBOARD-BLOCKS-59] only the card itself carries the needs-you-empty-seats- id prefix", () => {
    // The E2E specs count cards with [data-testid^="needs-you-empty-seats-"] (B-030, PAD-285,
    // PAD-424, PAD-740); an id inside the card on the same prefix counts twice.
    for (const item of [card({ engineVersion: "new", pendingInvites: 5 }), card({ engineVersion: "old" })]) {
      show(item);
      const ids = [...document.querySelectorAll('[data-testid^="needs-you-empty-seats-"]')].map((el) =>
        el.getAttribute("data-testid"),
      );
      expect(ids).toEqual([`needs-you-empty-seats-${item.id}`]);
      cleanup();
    }
  });
});
