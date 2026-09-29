/**
 * notifications.config rule 14 (PAD-433, ledger B-168): an excluded player's chip names the
 * student, including after a reload — when the only source of the name is the config's
 * read-only `excludedPlayerNames` map, not a search made in this session.
 * Bounds and steps come from @levelup/config's RESTRICTION_BOUNDS, shared with iOS.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { NotificationRestrictions } from "@/types";

vi.mock("react-i18next", () => ({
  // Interpolated values are appended so a test can see what a label was given (PAD-451).
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}|${Object.values(opts).join("|")}` : key,
  }),
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

describe("RestrictionsPanel — the coach's quiet window (PAD-451, notifications.config rule 6a)", () => {
  const withQuiet = (quietHours: NotificationRestrictions["quietHours"]) => ({ ...RESTRICTIONS, quietHours });

  it("shows the saved window and names it in the description", () => {
    render(<RestrictionsPanel restrictions={withQuiet({ enabled: true, start: "23:00", end: "08:00" })} onChange={() => undefined} />);
    expect(screen.getByTestId("restriction-quietHours-start")).toHaveValue("23:00");
    expect(screen.getByTestId("restriction-quietHours-end")).toHaveValue("08:00");
    expect(screen.getByTestId("restriction-row-quiet-hours").textContent).toContain("settings.restrictions.quietHoursDescription|23:00|08:00");
  });

  it("reads missing bounds as 22:00–07:00", () => {
    render(<RestrictionsPanel restrictions={withQuiet({ enabled: true })} onChange={() => undefined} />);
    expect(screen.getByTestId("restriction-quietHours-start")).toHaveValue("22:00");
    expect(screen.getByTestId("restriction-quietHours-end")).toHaveValue("07:00");
  });

  it("reports a valid edit with both bounds", () => {
    const onChange = vi.fn();
    render(<RestrictionsPanel restrictions={withQuiet({ enabled: true, start: "23:00", end: "08:00" })} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("restriction-quietHours-start"), { target: { value: "22:30" } });
    expect(onChange).toHaveBeenCalledWith({ ...RESTRICTIONS, quietHours: { enabled: true, start: "22:30", end: "08:00" } });
  });

  it("does not report an empty or off-grid window, and says why", () => {
    const onChange = vi.fn();
    render(<RestrictionsPanel restrictions={withQuiet({ enabled: true, start: "23:00", end: "08:00" })} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("restriction-quietHours-start"), { target: { value: "08:00" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("restriction-quietHours-error")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("restriction-quietHours-start"), { target: { value: "22:15" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hides the pickers while quiet hours are off", () => {
    render(<RestrictionsPanel restrictions={withQuiet({ enabled: false, start: "23:00", end: "08:00" })} onChange={() => undefined} />);
    expect(screen.queryByTestId("restriction-quietHours-start")).toBeNull();
  });
});

