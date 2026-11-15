/**
 * PAD-837 (attendance.validation rule 17c): the players table draws its columns from the one list
 * in `@levelup/config`. Asserted on i18n keys (the mock returns the key), never on rendered copy.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DEFAULT_VISIBLE_COLUMNS } from "@levelup/config";
import type { PresencePlayerStats } from "@/types";
import { PresencePlayersTable } from "./PresencePlayersTable";

vi.mock("react-i18next", () => {
  const translation = { t: (key: string) => key, i18n: { language: "en" } };
  return { useTranslation: () => translation };
});

const ana: PresencePlayerStats = {
  playerId: 1,
  name: "Ana",
  total: 3,
  private: 1,
  academy: 2,
  justified: 1,
  unjustified: 0,
  invitesReceived: 1,
  invitesJoined: 1,
  presenceMinutes: 180,
  justifiedMinutes: 60,
  guestPresenceMinutes: 60,
};

describe("PresencePlayersTable columns (PAD-837)", () => {
  it("[ATTENDANCE-VALIDATION-64] offers the shared column list", () => {
    render(
      <MemoryRouter>
        <PresencePlayersTable players={[ana]} />
      </MemoryRouter>
    );
    const table = screen.getByRole("table");
    const headings = within(table)
      .getAllByRole("columnheader")
      .map((th) => th.textContent?.trim());
    expect(headings).toEqual(DEFAULT_VISIBLE_COLUMNS.map((key) => `presences.column.${key}`));

    // No column list of its own: the component reads `PRESENCE_COLUMNS`.
    const source = readFileSync(join(__dirname, "PresencePlayersTable.tsx"), "utf8");
    expect(source).not.toMatch(/key:\s*"invitesJoined"/);
  });
});
