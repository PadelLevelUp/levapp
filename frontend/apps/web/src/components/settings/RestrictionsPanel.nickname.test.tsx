/** players.nickname rule 8 (PAD-660): an excluded player's chip prints the coach's name for the student. */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NotificationRestrictions } from "@/types";

vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (id: unknown, real: string | null | undefined) =>
    String(id) === "42" ? "Jorge chato" : (real ?? ""),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/api/notificationEngine", () => ({ searchPlayers: vi.fn().mockResolvedValue({ players: [] }) }));

import { RestrictionsPanel } from "./RestrictionsPanel";

const RESTRICTIONS = {
  maxSimultaneous: { enabled: true, value: 3 },
  maxTotal: { enabled: true, value: 10 },
  maxInactiveTime: { enabled: false, value: 60 },
  minTimeBeforeClass: { enabled: false, value: 30 },
  maxInvitesPerStudentPerDay: { enabled: false, value: 3 },
  quietHours: { enabled: true },
  excludedPlayers: { enabled: true, playerIds: ["42", "43"] },
  excludeUnpaidSubscription: { enabled: false },
  noSameDayClass: { enabled: true },
  cancellationDeadlineHours: 24,
} as NotificationRestrictions;

describe("RestrictionsPanel chips", () => {
  it("print the nickname for one student and the real name for another", () => {
    render(<RestrictionsPanel restrictions={RESTRICTIONS}
      excludedPlayerNames={{ "42": "Jorge Silva", "43": "Ana Pinto" }} onChange={() => undefined} />);
    const row = screen.getByTestId("restriction-row-excluded-players");
    expect(row.textContent).toContain("Jorge chato");
    expect(row.textContent).not.toContain("Jorge Silva");
    expect(row.textContent).toContain("Ana Pinto");
  });
});
