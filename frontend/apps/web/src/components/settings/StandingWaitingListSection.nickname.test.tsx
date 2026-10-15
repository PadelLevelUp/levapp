/** players.nickname rule 8 (PAD-660): the standing waiting list prints the coach's name for each student. */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (id: unknown, real: string | null | undefined) =>
    String(id) === "1" ? "Jorge chato" : (real ?? ""),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }) }));
vi.mock("@/api/notificationEngine", () => ({
  getStandingWaitingList: vi.fn().mockResolvedValue([
    { id: 1, playerId: 1, playerName: "Jorge Silva", creditsUsed: 0, creditsTotal: null, expiresAt: "2099-01-01T00:00:00",
      expiresOn: "2099-01-01", createdAt: "2026-01-01T00:00:00", activeClassCount: 0 },
    { id: 2, playerId: 2, playerName: "Ana Pinto", creditsUsed: 0, creditsTotal: null, expiresAt: "2099-01-01T00:00:00",
      expiresOn: "2099-01-01", createdAt: "2026-01-01T00:00:00", activeClassCount: 0 },
  ]),
  removeFromStandingWaitingList: vi.fn(),
  searchPlayers: vi.fn().mockResolvedValue({ players: [] }),
}));

import { StandingWaitingListSection } from "./StandingWaitingListSection";

describe("StandingWaitingListSection names", () => {
  it("print the nickname for one student and the real name for another", async () => {
    render(<StandingWaitingListSection />);
    const names = (await screen.findAllByTestId("standing-wl-name")).map((n) => n.textContent);
    expect(names).toEqual(["Jorge chato", "Ana Pinto"]);
  });
});
