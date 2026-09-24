/**
 * notifications.config rule 14 (PAD-433, ledger B-168): an excluded player's chip names the
 * student, including after a reload — when the only source of the name is the config's
 * read-only `excludedPlayerNames` map, not a search made in this session.
 * Bounds and steps come from @levelup/config's RESTRICTION_BOUNDS, shared with iOS.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NotificationRestrictions } from "@/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/api/notificationEngine", () => ({
  searchPlayers: vi.fn().mockResolvedValue({ players: [] }),
}));

import { RestrictionsPanel } from "./RestrictionsPanel";

const RESTRICTIONS: NotificationRestrictions = {
  maxSimultaneous: { enabled: true, value: 3 },
  maxTotal: { enabled: true, value: 10 },
  maxInactiveTime: { enabled: false, value: 60 },
  minTimeBeforeClass: { enabled: false, value: 30 },
  maxInvitesPerStudentPerDay: { enabled: false, value: 3 },
  quietHours: { enabled: true },
  excludedPlayers: { enabled: true, playerIds: ["42"] },
  excludeUnpaidSubscription: { enabled: false },
  cancellationDeadlineHours: 24,
};

describe("RestrictionsPanel — excluded players are named after a reload (PAD-433, B-168)", () => {
  it("names a saved excluded player from the config's excludedPlayerNames", () => {
    render(
      <RestrictionsPanel
        restrictions={RESTRICTIONS}
        excludedPlayerNames={{ "42": "Alice Andrade" }}
        onChange={() => undefined}
      />
    );
    const row = screen.getByTestId("restriction-row-excluded-players");
    expect(row.textContent).toContain("Alice Andrade");
    expect(row.textContent).not.toMatch(/\b42\b/);
  });
});

describe("RestrictionsPanel reads the shared bounds (PAD-433, rule 14)", () => {
  it("carries no stepper bound or step of its own", () => {
    const src = readFileSync(join(__dirname, "RestrictionsPanel.tsx"), "utf8");
    expect(src).toContain("RESTRICTION_BOUNDS");
    // A numeric literal bound (`min={1}`, `Math.min(20, …)`) is a second copy that can drift from iOS.
    expect(src.match(/\b(?:min|max|step)=\{\d+\}|Math\.(?:min|max)\(\d+/g) ?? []).toEqual([]);
  });
});
