/**
 * attendance.validation rule 7a (PAD-191, B-033): while a bulk run is in
 * flight, EVERY queued class is disabled — not just the first.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import type { PendingValidationClass } from "@/types";
import { ValidateClassesDialog } from "./ValidateClassesDialog";

// Loosely typed on purpose: the dialog's prop list grows in sibling tickets
// (e.g. `pendingCount`), and this test is about the busy-set guard only.
const Dialog = ValidateClassesDialog as unknown as ComponentType<Record<string, unknown>>;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && typeof opts.count === "number" ? `${key}:${opts.count}` : key,
    i18n: { language: "en" },
  }),
}));

// Radix's Dialog needs these in jsdom.
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

function klass(id: number, title: string): PendingValidationClass {
  return {
    lessonInstanceId: id,
    calendarEventId: `lessoninstance-${id}`,
    title,
    type: "academy",
    color: null,
    startDatetime: `2026-09-0${id}T11:00:00`,
    date: `2026-09-0${id}`,
    unanswered: 0,
    ready: true,
    players: [
      {
        presenceId: id * 10,
        playerId: id * 10,
        name: `Player ${id}`,
        response: "confirmed",
        status: null,
        justification: null,
        validated: false,
        lateCancellation: false,
        guest: false,
      },
    ],
  };
}

function renderDialog(busyClassIds: number[]) {
  render(
    <Dialog
      pending={[klass(1, "First"), klass(2, "Second")]}
      validated={[]}
      pendingCount={2}
      weekOffset={0}
      onWeekChange={() => {}}
      roster={[]}
      onValidate={async () => {}}
      onUnvalidate={async () => {}}
      busyClassIds={busyClassIds}
    />
  );
  fireEvent.click(screen.getByTestId("presences-validate-trigger"));
}

describe("ValidateClassesDialog bulk-run guard", () => {
  it("disables every queued class while the run is in flight", () => {
    renderDialog([1, 2]);
    const buttons = screen.getAllByTestId("presences-validate-class");
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button).toBeDisabled();
    expect(screen.getByTestId("presences-validate-selected")).toBeDisabled();
  });

  it("leaves classes outside the run tappable", () => {
    renderDialog([1]);
    const [first, second] = screen.getAllByTestId("presences-validate-class");
    expect(first).toBeDisabled();
    expect(second).toBeEnabled();
  });
});

// PAD-443 (attendance.validation rule 24): a player who still needs a decision stands out —
// an alert icon and a flagged row — until the coach marks them, and the header counts them.
// Criterion: "An undecided player stands out until marked".
describe("ValidateClassesDialog undecided players (PAD-443)", () => {
  function openSilentClass() {
    const silent = klass(1, "First");
    silent.players = [
      { ...silent.players[0], playerId: 11, presenceId: 11, name: "Rui", response: "none" },
      { ...silent.players[0], playerId: 12, presenceId: 12, name: "Ana", response: "confirmed" },
    ];
    render(
      <Dialog
        pending={[silent]}
        validated={[]}
        pendingCount={1}
        weekOffset={0}
        onWeekChange={() => {}}
        roster={[]}
        onValidate={async () => {}}
        onUnvalidate={async () => {}}
        busyClassIds={[]}
      />
    );
    fireEvent.click(screen.getByTestId("presences-validate-trigger"));
    fireEvent.click(screen.getByTestId("presences-open-class"));
  }

  it("flags only the undecided player and counts them in the header", () => {
    openSilentClass();
    expect(screen.getByTestId("validate-player-row-11")).toHaveAttribute("data-undecided", "true");
    expect(screen.getByTestId("validate-undecided-icon-11")).toBeInTheDocument();
    expect(screen.getByTestId("validate-player-row-12")).toHaveAttribute("data-undecided", "false");
    expect(screen.queryByTestId("validate-undecided-icon-12")).toBeNull();
    expect(screen.getByTestId("validate-undecided-summary")).toHaveTextContent("presences.validate.awaiting:1");
  });

  it("drops the flag the moment the player is marked", () => {
    openSilentClass();
    const row = screen.getByTestId("validate-player-row-11");
    fireEvent.click(within(row).getByTestId("presence-mark-present"));
    expect(screen.getByTestId("validate-player-row-11")).toHaveAttribute("data-undecided", "false");
    expect(screen.queryByTestId("validate-undecided-icon-11")).toBeNull();
    expect(screen.queryByTestId("validate-undecided-summary")).toBeNull();
  });
});
