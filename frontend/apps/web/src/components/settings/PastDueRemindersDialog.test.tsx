/**
 * PAD-478 (notifications.config rule 10f): the question the coach is asked when a saved timing
 * puts a class's reminder time in the past. Copy approved by the owner on 2026-10-02: the body
 * ENDS with the question, and the two buttons name the two things that can happen.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
    i18n: { language: "en" },
  }),
}));

import { PastDueRemindersDialog } from "./PastDueRemindersDialog";

const cls = (n: number) => ({ key: `i:${n}`, title: `Class ${n}`, startsAt: `2027-07-1${n}T18:30:00`, students: 3 });
const base = { quietUntil: null, sending: false, failed: false, onSend: vi.fn(), onDecline: vi.fn() };

describe("PastDueRemindersDialog", () => {
  it("one class: names the class, its day and its time, and asks send now or not send", () => {
    render(<PastDueRemindersDialog {...base} classes={[cls(1)]} />);
    const dialog = screen.getByTestId("past-due-dialog");

    expect(within(dialog).getByText("settings.engine.pastDue.title")).toBeTruthy();
    const body = within(dialog).getByTestId("past-due-body").textContent ?? "";
    expect(body).toContain("settings.engine.pastDue.bodyOne");
    expect(body).toContain("Class 1");
    expect(body).toContain("18:30");
    expect(body).toMatch(/July|Jul/);
    expect(within(dialog).queryByTestId("past-due-list")).toBeNull();
    expect(within(dialog).getByTestId("past-due-send")).toHaveTextContent("settings.engine.pastDue.sendOne");
    expect(within(dialog).getByTestId("past-due-decline")).toHaveTextContent("settings.engine.pastDue.decline");
  });

  it("several classes: the list sits above the question, which ends the body", () => {
    render(<PastDueRemindersDialog {...base} classes={[cls(1), cls(2), cls(3)]} />);
    const body = screen.getByTestId("past-due-body");
    const list = within(body).getByTestId("past-due-list");

    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(body.textContent).toContain('settings.engine.pastDue.introMany {"count":3}');
    expect(body.lastElementChild).toHaveTextContent("settings.engine.pastDue.questionMany");
    expect(screen.getByTestId("past-due-send")).toHaveTextContent("settings.engine.pastDue.sendMany");
  });

  it("more than five classes: five are listed and the rest are counted", () => {
    render(<PastDueRemindersDialog {...base} classes={[1, 2, 3, 4, 5, 6, 7].map(cls)} />);
    const items = within(screen.getByTestId("past-due-list")).getAllByRole("listitem");

    expect(items).toHaveLength(6);
    expect(items[5]).toHaveTextContent('settings.engine.pastDue.andMore {"count":2}');
  });

  it("quiet hours: says when it is sent, and the button says the time, not 'now'", () => {
    render(<PastDueRemindersDialog {...base} classes={[cls(1)]} quietUntil="2027-07-11T06:00:00Z" />);
    const time = new Date("2027-07-11T06:00:00Z").toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });

    expect(screen.getByTestId("past-due-body").textContent).toContain("settings.engine.pastDue.bodyOneQuiet");
    expect(screen.getByTestId("past-due-body").textContent).toContain(time);
    expect(screen.getByTestId("past-due-send")).toHaveTextContent(`settings.engine.pastDue.sendAt {"time":"${time}"}`);
  });

  it("the two buttons do the two things; nothing is chosen for the coach", () => {
    const onSend = vi.fn();
    const onDecline = vi.fn();
    render(<PastDueRemindersDialog {...base} classes={[cls(1)]} onSend={onSend} onDecline={onDecline} />);

    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("past-due-send"));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onDecline).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("past-due-decline"));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("dismissing with Escape is 'do not send'", () => {
    const onSend = vi.fn();
    const onDecline = vi.fn();
    render(<PastDueRemindersDialog {...base} classes={[cls(1)]} onSend={onSend} onDecline={onDecline} />);

    fireEvent.keyDown(screen.getByTestId("past-due-dialog"), { key: "Escape" });

    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("while sending, neither button can be pressed again; a failure says so and stays open", () => {
    const { rerender } = render(<PastDueRemindersDialog {...base} classes={[cls(1)]} sending />);
    expect(screen.getByTestId("past-due-send")).toBeDisabled();
    expect(screen.getByTestId("past-due-decline")).toBeDisabled();

    rerender(<PastDueRemindersDialog {...base} classes={[cls(1)]} failed />);
    expect(screen.getByTestId("past-due-error")).toHaveTextContent("settings.engine.pastDue.sendFailed");
    expect(screen.getByTestId("past-due-send")).not.toBeDisabled();
  });
});
