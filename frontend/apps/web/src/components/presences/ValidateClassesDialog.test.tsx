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

// PAD-443 (rule 24): the class list's inline rows carry the same flag as the class detail.
describe("ValidateClassesDialog undecided players in the class list (PAD-443)", () => {
  function openListWithSilentPlayer() {
    const silent = klass(1, "First");
    silent.players = [
      { ...silent.players[0], playerId: 21, presenceId: 21, name: "Rui", response: "none" },
      { ...silent.players[0], playerId: 22, presenceId: 22, name: "Ana", response: "confirmed" },
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
  }

  it("flags only the undecided player's inline row, until marked", () => {
    openListWithSilentPlayer();
    expect(screen.getByTestId("validate-list-row-1-21")).toHaveAttribute("data-undecided", "true");
    expect(screen.getByTestId("validate-list-undecided-icon-1-21")).toBeInTheDocument();
    expect(screen.getByTestId("validate-list-row-1-22")).toHaveAttribute("data-undecided", "false");
    fireEvent.click(within(screen.getByTestId("validate-list-row-1-21")).getByTestId("presence-mark-present"));
    expect(screen.getByTestId("validate-list-row-1-21")).toHaveAttribute("data-undecided", "false");
    expect(screen.queryByTestId("validate-list-undecided-icon-1-21")).toBeNull();
  });
});

// PAD-442 (attendance.validation rule 25): a class the coach completes stays where it was, with
// its Validate button enabled in place; the group comes from the server's state, not local marks.
// Criterion: "Deciding the last player unblocks the class in place (PAD-442)".
describe("ValidateClassesDialog keeps a completed class in place (PAD-442)", () => {
  function renderQueue() {
    const silent = klass(1, "First");
    silent.players = [
      { ...silent.players[0], playerId: 31, presenceId: 31, name: "Rui", response: "none" },
    ];
    const ready = klass(2, "Second");
    render(
      <Dialog
        pending={[silent, ready]}
        validated={[]}
        pendingCount={2}
        weekOffset={0}
        onWeekChange={() => {}}
        roster={[]}
        onValidate={async () => {}}
        onUnvalidate={async () => {}}
        busyClassIds={[]}
      />
    );
    fireEvent.click(screen.getByTestId("presences-validate-trigger"));
  }

  const cardOf = (rowTestId: string) =>
    screen.getByTestId(rowTestId).closest('[data-testid="presences-class-card"]') as HTMLElement;

  it("keeps the class under needs-input with Validate enabled once its last player is marked", () => {
    renderQueue();
    const needsInput = screen.getByTestId("presences-group-needsInput");
    expect(within(needsInput).getByTestId("validate-list-row-1-31")).toBeInTheDocument();
    expect(within(cardOf("validate-list-row-1-31")).getByTestId("presences-validate-class")).toBeDisabled();

    fireEvent.click(within(screen.getByTestId("validate-list-row-1-31")).getByTestId("presence-mark-present"));

    expect(within(screen.getByTestId("presences-group-needsInput")).getByTestId("validate-list-row-1-31")).toBeInTheDocument();
    expect(within(screen.getByTestId("presences-group-ready")).queryByTestId("validate-list-row-1-31")).toBeNull();
    expect(within(cardOf("validate-list-row-1-31")).getByTestId("presences-validate-class")).toBeEnabled();
  });

  it("still lists a class whose players all answered under ready", () => {
    renderQueue();
    expect(within(screen.getByTestId("presences-group-ready")).getByTestId("validate-list-row-2-20")).toBeInTheDocument();
  });
});

// PAD-538 (attendance.validation rule 27): each class shows how many are present, from the marks
// the rows show — and the number moves when the coach marks someone.
describe("each class shows how many are present (PAD-538)", () => {
  it("counts the confirmed prefill on the card", () => {
    const k = klass(1, "First"); // its one player answered "confirmed": prefill present
    render(
      <Dialog
        pending={[k]}
        validated={[]}
        pendingCount={1}
        pendingTotal={1}
        weekOffset={0}
        onWeekChange={() => {}}
        roster={[]}
        onValidate={vi.fn()}
        onUnvalidate={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("presences-validate-trigger"));
    const count = screen.getByTestId("presences-class-present-count");
    expect(count.textContent).toBe("presences.validate.presentCount:1");
    expect(count.getAttribute("data-count")).toBe("1");
  });

  it("has its own string for nobody present", () => {
    const k = klass(2, "Second");
    k.players = k.players.map((p) => ({ ...p, response: "declined" }));
    render(
      <Dialog
        pending={[k]}
        validated={[]}
        pendingCount={1}
        pendingTotal={1}
        weekOffset={0}
        onWeekChange={() => {}}
        roster={[]}
        onValidate={vi.fn()}
        onUnvalidate={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("presences-validate-trigger"));
    expect(screen.getByTestId("presences-class-present-count").textContent).toBe("presences.validate.presentCountNone");
  });
});

// PAD-539 (attendance.validation rule 18, B-342): the trigger's number is the whole backlog,
// and the week's own count sits under it — so three classes left over from an earlier week
// never read as "nothing to validate" on a clean week.
describe("the trigger shows the backlog and the week's share (PAD-539)", () => {
  function renderTrigger(props: Record<string, unknown>) {
    render(
      <Dialog
        pending={[]}
        validated={[]}
        weekOffset={0}
        onWeekChange={() => {}}
        roster={[]}
        onValidate={vi.fn()}
        onUnvalidate={vi.fn()}
        {...props}
      />
    );
  }

  it("reads the total, not the week, as its number", () => {
    renderTrigger({ pendingCount: 0, pendingTotal: 3 });
    expect(screen.getByTestId("presences-validate-count").textContent).toBe("presences.validate.trigger:3");
    expect(screen.getByTestId("presences-validate-week").textContent).toBe("presences.validate.triggerWeekEmpty");
  });

  it("says how many of them are in this week", () => {
    renderTrigger({ pendingCount: 2, pendingTotal: 5 });
    expect(screen.getByTestId("presences-validate-count").textContent).toBe("presences.validate.trigger:5");
    expect(screen.getByTestId("presences-validate-week").textContent).toBe("presences.validate.triggerWeek:2");
  });

  it("names the shown week when it is not the current one", () => {
    renderTrigger({ pendingCount: 2, pendingTotal: 5, weekOffset: -3 });
    expect(screen.getByTestId("presences-validate-week").textContent).toBe("presences.validate.triggerWeekShown:2");
    renderTrigger({ pendingCount: 0, pendingTotal: 5, weekOffset: 1 });
    expect(screen.getAllByTestId("presences-validate-week").at(-1)?.textContent).toBe("presences.validate.triggerWeekShownEmpty");
  });

  it("reads 'nothing to validate' only when the whole backlog is empty", () => {
    renderTrigger({ pendingCount: 0, pendingTotal: 0 });
    expect(screen.getByTestId("presences-validate-count").textContent).toBe("presences.validate.triggerEmpty");
  });
});
