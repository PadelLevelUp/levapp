/**
 * settings.explicit-save (PAD-506): the reminders form is controlled. Every change goes to the
 * card at once (it holds it with the rest of the tab until "Guardar alterações"); the section
 * itself pauses, flushes and sends nothing. (PAD-478's one-save-per-edit pause belonged to the
 * save-on-change model; the single Save now makes it one request by construction.)
 */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReminderConfig } from "@/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { RemindersSection } from "./RemindersSection";

const HOURS: ReminderConfig = {
  firstReminder: { type: "hours_before", value: 24 },
  reminderCount: 2,
  hoursBetweenReminders: 4,
  invitationStart: { type: "days_before_at_time", days: 1, time: "18:00" },
};

// Mirrors the engine card: onChange feeds back into the prop; `seen` records what went up.
function Held({ onSeen }: { onSeen: (c: ReminderConfig) => void }) {
  const [value, setValue] = useState(HOURS);
  return (
    <RemindersSection
      reminderTiming={value}
      onChange={(next) => {
        onSeen(next);
        setValue(next);
      }}
    />
  );
}

describe("RemindersSection is controlled (PAD-506)", () => {
  it("each stepper tap goes up at once with the new value; the final value is the sum of the taps", () => {
    const seen = vi.fn();
    render(<Held onSeen={seen} />);
    const first = within(screen.getByTestId("reminder-first-reminder-timing"));
    const plus = first.getAllByRole("button")[1];

    for (let i = 0; i < 5; i += 1) fireEvent.click(plus);

    expect(first.getByText("29")).toBeTruthy();
    expect(seen).toHaveBeenCalledTimes(5);
    expect(seen.mock.calls[4][0].firstReminder).toEqual({ type: "hours_before", value: 29 });
  });

  it("typing a time goes up with the time as typed, other fields intact", () => {
    const onChange = vi.fn();
    const { container } = render(<RemindersSection reminderTiming={HOURS} onChange={onChange} />);
    // PAD-559 PR-2: the shared field commits a typed time on Enter (or on leaving it).
    const time = container.querySelector('[data-testid="reminder-time"]') as HTMLInputElement;

    fireEvent.change(time, { target: { value: "09:30" } });
    fireEvent.keyDown(time, { key: "Enter" });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      ...HOURS,
      invitationStart: { type: "days_before_at_time", days: 1, time: "09:30" },
    });
  });

  it("edits to two controls both reach the held value", () => {
    const seen = vi.fn();
    render(<Held onSeen={seen} />);
    fireEvent.click(within(screen.getByTestId("reminder-per-student")).getAllByRole("button")[1]);
    fireEvent.click(within(screen.getByTestId("reminder-hours-between")).getAllByRole("button")[1]);

    expect(seen.mock.calls.at(-1)![0]).toMatchObject({ reminderCount: 3, hoursBetweenReminders: 5 });
  });

  it("is not controlled by itself: without the parent taking the change, the control keeps the prop value", () => {
    const onChange = vi.fn();
    render(<RemindersSection reminderTiming={HOURS} onChange={onChange} />);
    fireEvent.click(within(screen.getByTestId("reminder-per-student")).getAllByRole("button")[1]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(within(screen.getByTestId("reminder-per-student")).getByText("2")).toBeTruthy();
  });

  it("follows the value it is given", () => {
    const onChange = vi.fn();
    const { rerender } = render(<RemindersSection reminderTiming={HOURS} onChange={onChange} />);

    rerender(<RemindersSection reminderTiming={{ ...HOURS, reminderCount: 4 }} onChange={onChange} />);

    expect(within(screen.getByTestId("reminder-per-student")).getByText("4")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closing the section sends nothing of its own (the held value lives in the card)", () => {
    const onChange = vi.fn();
    const { unmount } = render(<RemindersSection reminderTiming={HOURS} onChange={onChange} />);
    fireEvent.click(within(screen.getByTestId("reminder-per-student")).getAllByRole("button")[1]);
    expect(onChange).toHaveBeenCalledTimes(1);

    unmount();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("a tab that is hidden sends nothing more", () => {
    const onChange = vi.fn();
    render(<RemindersSection reminderTiming={HOURS} onChange={onChange} />);

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    try {
      document.dispatchEvent(new Event("visibilitychange"));
    } finally {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    }

    expect(onChange).not.toHaveBeenCalled();
  });
});
