/**
 * PAD-837 (attendance.validation rule 17c): the players table draws its columns from the one list
 * in `@levelup/config`. Asserted on i18n keys (the mock returns the key), never on rendered copy.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DEFAULT_VISIBLE_COLUMNS, PRESENCE_COLUMNS } from "@levelup/config";
import type { PresencePlayerStats } from "@/types";
import { PresencePlayersTable } from "./PresencePlayersTable";

// jsdom has no PointerEvent, and Radix's menu trigger acts only on a primary-button pointerdown.
if (typeof window.PointerEvent === "undefined") {
  class PointerEvent extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = PointerEvent;
}

afterEach(() => vi.restoreAllMocks());

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

describe("PresencePlayersTable chooser and CSV (PAD-837)", () => {
  it("[ATTENDANCE-VALIDATION-64] adds chosen columns in the list's order, on screen and in the CSV", async () => {
    let csv: Blob | null = null;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      csv = blob;
      return "blob:presences";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <MemoryRouter>
        <PresencePlayersTable players={[ana]} />
      </MemoryRouter>
    );

    // Tap the later column first: the order must still be the list's, not the tap order.
    for (const key of ["invitesJoined", "justified"]) {
      fireEvent.pointerDown(screen.getByRole("button", { name: /presences\.table\.columns/ }), {
        button: 0,
        ctrlKey: false,
        pointerType: "mouse",
      });
      fireEvent.click(await screen.findByRole("checkbox", { name: `presences.column.${key}` }));
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    }

    const expected = PRESENCE_COLUMNS.map((c) => c.key).filter(
      (key) => DEFAULT_VISIBLE_COLUMNS.includes(key) || key === "invitesJoined" || key === "justified"
    );
    const headings = within(screen.getByRole("table"))
      .getAllByRole("columnheader")
      .map((th) => th.textContent?.trim());
    expect(headings).toEqual(expected.map((key) => `presences.column.${key}`));

    fireEvent.click(screen.getByRole("button", { name: /presences\.table\.export/ }));
    expect(csv).not.toBeNull();
    // jsdom's Blob has no text(); FileReader reads it.
    const text = await act(
      () =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsText(csv as unknown as Blob);
        })
    );
    expect(text.split("\n")[0]).toBe(expected.map((key) => `"presences.column.${key}"`).join(","));
  });
});
