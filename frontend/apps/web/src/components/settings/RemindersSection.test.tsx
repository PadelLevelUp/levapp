/**
 * PAD-478 (notifications.config rule 10d): the reminders form sends ONE save per edit, with
 * the final value. Before, every stepper tap and every segment edit of the time field was a
 * save, and each save re-armed every future job of the coach.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const pause = () => act(() => vi.advanceTimersByTimeAsync(600));

describe("RemindersSection saves once per edit (PAD-478)", () => {
  it("five taps on a stepper are one save, with the final value", async () => {
    const onChange = vi.fn();
    render(<RemindersSection reminderTiming={HOURS} onChange={onChange} />);
    const first = within(screen.getByTestId("reminder-first-reminder-timing"));
    const plus = first.getAllByRole("button")[1];

    for (let i = 0; i < 5; i += 1) fireEvent.click(plus);

    // The control shows each tap at once; nothing is sent while the coach is still tapping.
    expect(first.getByText("29")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();

    await pause();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].firstReminder).toEqual({ type: "hours_before", value: 29 });
  });

  it("typing a time is one save, with the time as it stands when the coach stops", async () => {
    const onChange = vi.fn();
    const { container } = render(<RemindersSection reminderTiming={HOURS} onChange={onChange} />);
    const time = container.querySelector('input[type="time"]') as HTMLInputElement;

    // 18:00 → 09:30 passes through valid times on the way (segment by segment).
    fireEvent.change(time, { target: { value: "00:00" } });
    fireEvent.change(time, { target: { value: "09:00" } });
    fireEvent.change(time, { target: { value: "09:30" } });
    expect(onChange).not.toHaveBeenCalled();

    await pause();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].invitationStart).toEqual({ type: "days_before_at_time", days: 1, time: "09:30" });
  });

  it("leaving the time field sends at once", () => {
    const onChange = vi.fn();
    const { container } = render(<RemindersSection reminderTiming={HOURS} onChange={onChange} />);
    const time = container.querySelector('input[type="time"]') as HTMLInputElement;

    fireEvent.change(time, { target: { value: "07:15" } });
    fireEvent.blur(time);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].invitationStart.time).toBe("07:15");
  });

  it("edits to two controls inside one pause travel together in one save", async () => {
    const onChange = vi.fn();
    render(<RemindersSection reminderTiming={HOURS} onChange={onChange} />);
    fireEvent.click(within(screen.getByTestId("reminder-per-student")).getAllByRole("button")[1]);
    fireEvent.click(within(screen.getByTestId("reminder-hours-between")).getAllByRole("button")[1]);

    await pause();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ reminderCount: 3, hoursBetweenReminders: 5 });
  });

  it("closing the section sends what is pending", () => {
    const onChange = vi.fn();
    const { unmount } = render(<RemindersSection reminderTiming={HOURS} onChange={onChange} />);
    fireEvent.click(within(screen.getByTestId("reminder-per-student")).getAllByRole("button")[1]);

    unmount();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].reminderCount).toBe(3);
  });

  it("follows the server's value when nothing is being edited (a failed save reverts)", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<RemindersSection reminderTiming={HOURS} onChange={onChange} />);

    rerender(<RemindersSection reminderTiming={{ ...HOURS, reminderCount: 4 }} onChange={onChange} />);

    expect(within(screen.getByTestId("reminder-per-student")).getByText("4")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("after a save that failed and was rolled back, the control returns to the saved value", async () => {
    let fail!: () => void;
    const onChange = vi.fn(
      () => new Promise<void>((resolve) => (fail = resolve)), // the parent's save() catches and resolves
    );
    const { rerender } = render(<RemindersSection reminderTiming={HOURS} onChange={onChange} />);
    const perStudent = () => within(screen.getByTestId("reminder-per-student"));
    fireEvent.click(perStudent().getAllByRole("button")[1]);
    await pause();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(perStudent().getByText("3")).toBeTruthy();

    // The parent rolls its state back to the confirmed value, then its save() settles.
    rerender(<RemindersSection reminderTiming={{ ...HOURS }} onChange={onChange} />);
    await act(async () => {
      fail();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(perStudent().getByText("2")).toBeTruthy();
  });

  it("closing the section with no session (sign-out) sends nothing", () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <RemindersSection reminderTiming={HOURS} onChange={onChange} flushOnClose={() => false} />,
    );
    fireEvent.click(within(screen.getByTestId("reminder-per-student")).getAllByRole("button")[1]);

    unmount();
    vi.advanceTimersByTime(600);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("a tab that is hidden sends what is still inside the pause", () => {
    const onChange = vi.fn();
    render(<RemindersSection reminderTiming={HOURS} onChange={onChange} />);
    fireEvent.click(within(screen.getByTestId("reminder-per-student")).getAllByRole("button")[1]);
    expect(onChange).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    try {
      document.dispatchEvent(new Event("visibilitychange"));
    } finally {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    }

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].reminderCount).toBe(3);
  });
});
