/**
 * attendance.validation rule 7a (PAD-191, B-033): while a bulk run is in
 * flight, EVERY queued class is disabled — not just the first.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
