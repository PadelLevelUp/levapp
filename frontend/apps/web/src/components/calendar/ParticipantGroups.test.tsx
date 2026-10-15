/**
 * PAD-659 (`calendar.event-detail` rule 22): the coach's participant list is compact and
 * grouped — Vão, Por responder, Não vão — each ordered by side then name, with no level and no
 * state word on a row. The grouping itself is `@levelup/config`'s (tested there); these tests pin
 * what the web list renders from it.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ParticipantGroups } from "./ParticipantGroups";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && "count" in opts ? `${key}:${opts.count}` : opts && "name" in opts ? `${key}:${opts.name}` : key,
    i18n: { language: "pt" },
  }),
}));

const participants = [
  { id: "1", userId: "11", user: { name: "Ana Lopes" } },
  { id: "2", userId: "12", user: { name: "Bruno Reis" } },
  { id: "3", userId: "13", user: { name: "Carla Mota" } },
];
const presences = [
  { playerId: "1", attendanceState: "coming" },
  { playerId: "2", attendanceState: "attended" },
  { playerId: "3", attendanceState: "not_coming" },
];
const roster = [
  { playerId: "1", name: "Ana Lopes", side: "left", level: { label: "3+" } },
  { playerId: "2", name: "Bruno Reis", side: "both", level: { label: "4" } },
  { playerId: "3", name: "Carla Mota" },
];

function renderList(onOpen = vi.fn()) {
  render(
    <ParticipantGroups
      participants={participants as never}
      presences={presences as never}
      roster={roster as never}
      onOpen={onOpen}
    />
  );
  return onOpen;
}

describe("ParticipantGroups (rule 22)", () => {
  it("renders the non-empty groups in order with their counts", () => {
    renderList();
    const groups = screen.getAllByTestId("participant-group");
    expect(groups.map((g) => g.getAttribute("data-group"))).toEqual(["going", "not_going"]);
    expect(within(groups[0]).getByText("calendar.participants.group.going:2")).toBeTruthy();
    expect(within(groups[1]).getByText("calendar.participants.group.not_going:1")).toBeTruthy();
  });

  it("orders a group by side and keeps the stored state on the row", () => {
    renderList();
    const going = screen.getAllByTestId("participant-group")[0];
    const rows = within(going).getAllByTestId(/^participant-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["participant-row-2", "participant-row-1"]);
    expect(rows[0].getAttribute("data-state")).toBe("attended");
  });

  it("shows the side chip with its long form as the tooltip, and no level or state word", () => {
    renderList();
    const row = screen.getByTestId("participant-row-1");
    const chip = within(row).getByTestId("participant-side");
    expect(chip.textContent).toBe("calendar.participants.sideShort.left");
    expect(chip.getAttribute("title")).toBe("calendar.participants.sideLong.left");
    expect(row.textContent).not.toContain("3+");
    expect(within(row).queryByTestId("attendance-state")).toBeNull();
    expect(within(screen.getByTestId("participant-row-3")).queryByTestId("participant-side")).toBeNull();
  });

  it("opens the pop-up from the name or avatar button, not from the chip", () => {
    const onOpen = renderList();
    fireEvent.click(within(screen.getByTestId("participant-row-1")).getByTestId("participant-side"));
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("participant-open-1"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].playerId).toBe("1");
    expect(screen.getByTestId("participant-open-1").getAttribute("aria-label")).toBe(
      "calendar.participants.openProfile:Ana Lopes"
    );
  });
});
