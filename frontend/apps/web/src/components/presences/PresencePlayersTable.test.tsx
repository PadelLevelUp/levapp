/**
 * PAD-837 (attendance.validation rule 17c): the players table draws its columns from the one list
 * in `@levelup/config`. Asserted on i18n keys (the mock returns the key), never on rendered copy.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEFAULT_VISIBLE_COLUMNS, PRESENCE_COLUMNS, formatBalanceHours, formatMinutesAsHours } from "@levelup/config";
import type { PresencePlayerStats } from "@/types";
import { PresencePlayersTable } from "./PresencePlayersTable";
import { usePresencesView } from "./usePresencesView";

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

// settings.coach-presences-view (PAD-837b): the table reads and saves the coach's view; the API
// module is the seam, so the real hooks, cache and state machine run.
const viewApi = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@levelup/api/src/resources/presencesView", () => ({
  getCoachPresencesView: viewApi.get,
  putCoachPresencesView: viewApi.put,
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

beforeEach(() => {
  viewApi.get.mockReset().mockResolvedValue({ presencesView: null });
  viewApi.put.mockReset().mockImplementation(async (view) => ({ presencesView: view }));
  toast.mockReset();
});

vi.mock("react-i18next", () => {
  const translation = { t: (key: string) => key, i18n: { language: "en" } };
  return { useTranslation: () => translation };
});

/** The table as the page mounts it: its columns come from the page's saved view. */
function TableWithView({ players }: { players: PresencePlayerStats[] }) {
  const view = usePresencesView();
  return <PresencePlayersTable players={players} columns={view.columns} onChooseColumn={view.chooseColumn} />;
}

function renderTable(players: PresencePlayerStats[] = [ana]) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <TableWithView players={players} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

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
    renderTable();
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

    renderTable();

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

describe("PresencePlayersTable guest columns (PAD-837, rule 17e)", () => {
  it("[ATTENDANCE-VALIDATION-65] explains the guest columns", async () => {
    // A heading only renders for a shown column: show both guest columns first.
    renderTable();
    for (const key of GUEST_COLUMNS) await chooseColumn(key);

    fireEvent.pointerDown(screen.getByRole("button", { name: /presences\.table\.columns/ }), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    for (const key of GUEST_COLUMNS) {
      // In the chooser: a non-empty line, tied to the column's checkbox. Never the wording.
      const help = await screen.findByTestId(`presences-column-help-${key}`);
      expect(help.textContent?.trim()).toBeTruthy();
      const box = screen.getByRole("checkbox", { name: `presences.column.${key}` });
      expect(box.getAttribute("aria-describedby")).toBe(help.id);
    }
    // No other column carries one.
    expect(screen.queryAllByTestId(/^presences-column-help-/)).toHaveLength(GUEST_COLUMNS.length);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    // On the heading: the same line.
    for (const key of GUEST_COLUMNS) {
      const th = within(screen.getByRole("table"))
        .getAllByRole("columnheader")
        .find((h) => h.textContent?.trim() === `presences.column.${key}`);
      expect(th?.getAttribute("title")).toBe(`presences.columnHelp.${key}`);
    }
  });
});

// Named here, not read from HELPED_COLUMNS: an emptied list must fail this test, not pass it.
const GUEST_COLUMNS = ["invitesReceived", "invitesJoined"] as const;

describe("PresencePlayersTable hours columns (PAD-837, rule 17d)", () => {
  // 600, 120 and 90 minutes: by the text "2h" > "1h30" > "10h", by the minutes 600 > 120 > 90.
  const players: PresencePlayerStats[] = [
    { ...ana, playerId: 1, name: "A", displayName: "A", presenceMinutes: 90, balanceMinutes: 45 },
    { ...ana, playerId: 2, name: "B", displayName: "B", presenceMinutes: 600, balanceMinutes: -45 },
    { ...ana, playerId: 3, name: "C", displayName: "C", presenceMinutes: 120, balanceMinutes: 0 },
  ];

  it("[ATTENDANCE-VALIDATION-63] sorts an hours column by minutes", async () => {
    let csv: Blob | null = null;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      csv = blob;
      return "blob:presences";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderTable(players);
    await chooseColumn("presenceMinutes");
    // Sort by "Presenças (h)": biggest first.
    fireEvent.click(screen.getByRole("button", { name: "presences.column.presenceMinutes" }));
    const cells = screen.getAllByTestId("presences-cell-presenceMinutes").map((td) => td.textContent);
    expect(cells).toEqual([600, 120, 90].map(formatMinutesAsHours));

    // The CSV cell is the screen's text (rule 17).
    fireEvent.click(screen.getByRole("button", { name: /presences\.table\.export/ }));
    const text = await act(
      () =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsText(csv as unknown as Blob);
        })
    );
    const header = text.split("\n")[0].split(",");
    const at = header.indexOf('"presences.column.presenceMinutes"');
    expect(text.split("\n").slice(1).map((line) => line.split(",")[at])).toEqual(
      [600, 120, 90].map((m) => `"${formatMinutesAsHours(m)}"`)
    );
  });

  it("[ATTENDANCE-VALIDATION-62] writes the balance with its sign, the colour following it", async () => {
    renderTable(players);
    await chooseColumn("balanceMinutes");
    fireEvent.click(screen.getByRole("button", { name: "presences.column.balanceMinutes" }));
    const cells = screen.getAllByTestId("presences-cell-balanceMinutes");
    expect(cells.map((td) => td.textContent)).toEqual([45, 0, -45].map(formatBalanceHours));
    expect(cells.map((td) => (td.className.includes("text-emerald-600") ? "+" : td.className.includes("text-destructive") ? "-" : "0"))).toEqual(["+", "0", "-"]);
  });
});

async function chooseColumn(key: string) {
  fireEvent.pointerDown(screen.getByRole("button", { name: /presences\.table\.columns/ }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  fireEvent.click(await screen.findByRole("checkbox", { name: `presences.column.${key}` }));
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
}

const headingsOf = () =>
  within(screen.getByRole("table"))
    .getAllByRole("columnheader")
    .map((th) => th.textContent?.trim());

describe("PresencePlayersTable saved view (PAD-837b)", () => {
  it("[ATTENDANCE-VALIDATION-66] restores the saved columns, in the list's order, and the CSV carries them", async () => {
    let csv: Blob | null = null;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      csv = blob;
      return "blob:presences";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    // Stored out of order, with an id the list no longer knows and no `name`: the list decides.
    viewApi.get.mockResolvedValue({ presencesView: { columns: ["invitesJoined", "retiredColumn", "total"] } });

    renderTable();

    await waitFor(() =>
      expect(headingsOf()).toEqual(["name", "total", "invitesJoined"].map((key) => `presences.column.${key}`))
    );
    expect(viewApi.get).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /presences\.table\.export/ }));
    const text = await act(
      () =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.readAsText(csv as unknown as Blob);
        })
    );
    expect(text.split("\n")[0]).toBe(
      ["name", "total", "invitesJoined"].map((key) => `"presences.column.${key}"`).join(",")
    );
  });

  it("[SETTINGS-COACH-PRESENCES-VIEW-4] keeps a choice made before the view loaded", async () => {
    let answer: (value: unknown) => void = () => {};
    viewApi.get.mockReturnValue(new Promise((resolve) => (answer = resolve)));

    renderTable();
    // The coach hides "private" while the GET is still out.
    await chooseColumn("private");
    const chosen = headingsOf();
    expect(chosen).not.toContain("presences.column.private");

    // The server then answers with a view that still has it.
    await act(async () => answer({ presencesView: { columns: ["total", "private", "academy"] } }));

    expect(headingsOf()).toEqual(chosen);
    expect(viewApi.get).toHaveBeenCalledTimes(1);
  });

  it("[SETTINGS-COACH-PRESENCES-VIEW-4] every change sends the whole list", async () => {
    renderTable();
    await waitFor(() => expect(viewApi.get).toHaveBeenCalled());
    await chooseColumn("justified");
    await waitFor(() => expect(viewApi.put).toHaveBeenCalledTimes(1));
    // The whole view: the columns and the default period beside them (rule 4).
    expect(viewApi.put).toHaveBeenCalledWith({
      columns: ["name", "total", "private", "academy", "justified", "unjustified"],
      defaultPeriod: "thisMonth",
    });
  });

  it("[SETTINGS-COACH-PRESENCES-VIEW-5] says when the view was not saved, and keeps the column", async () => {
    viewApi.put.mockRejectedValue(new Error("500"));
    renderTable();
    await waitFor(() => expect(viewApi.get).toHaveBeenCalled());

    await chooseColumn("justified");

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast.mock.calls[0][0]).toMatchObject({ title: "presences.view.notSavedTitle", variant: "destructive" });
    expect(headingsOf()).toContain("presences.column.justified");
  });

  it("a view that fails to load leaves the defaults", async () => {
    viewApi.get.mockRejectedValue(new Error("500"));
    renderTable();
    await waitFor(() => expect(viewApi.get).toHaveBeenCalled());
    expect(headingsOf()).toEqual(DEFAULT_VISIBLE_COLUMNS.map((key) => `presences.column.${key}`));
  });
});
