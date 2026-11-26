/**
 * PAD-929 (classes.join-requests rule 22): the private-lesson warning on web, not yet placed in any
 * sheet (owner question 2). Located by test id; `t` returns the key.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { PrivateLessonWarningDialog } from "./PrivateLessonWarningDialog";

function mount() {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(<PrivateLessonWarningDialog open onCancel={onCancel} onConfirm={onConfirm} />);
  return { onCancel, onConfirm };
}

describe("PrivateLessonWarningDialog", () => {
  it("asks the ticket's question with SIM and NÃO", () => {
    mount();
    expect(screen.getByTestId("private-lesson-warning-body").textContent).toBe("calendar.privateLessonWarning.body");
    expect(screen.getByTestId("private-lesson-warning-yes").textContent).toBe("calendar.privateLessonWarning.yes");
    expect(screen.getByTestId("private-lesson-warning-no").textContent).toBe("calendar.privateLessonWarning.no");
  });

  it("NÃO cancels and never confirms", () => {
    const { onCancel, onConfirm } = mount();
    fireEvent.click(screen.getByTestId("private-lesson-warning-no"));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("SIM confirms", () => {
    const { onConfirm } = mount();
    fireEvent.click(screen.getByTestId("private-lesson-warning-yes"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows nothing while closed", () => {
    render(<PrivateLessonWarningDialog open={false} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByTestId("private-lesson-warning")).toBeNull();
  });
});
