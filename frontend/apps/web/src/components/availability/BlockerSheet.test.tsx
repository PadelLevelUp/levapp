/** calendar.student-blockers rule 26, criterion -32 (PAD-772): the block form says, before the save, that classes in the period are marked. */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }) }));

import { BlockerSheet } from "./BlockerSheet";

describe("the block sheet (PAD-772)", () => {
  it("[CALENDAR-STUDENT-BLOCKERS-32] the blocker form says classes in the period are marked", () => {
    const requests = vi.fn();
    render(<BlockerSheet open editing={null} saving={false} onClose={() => {}} onSave={requests} />);
    const notice = screen.getByTestId("blocker-covered-notice");
    expect(notice.textContent).toBe("availability.covered.notice");
    // Above the save button, with no button of its own, and nothing was sent to show it.
    expect(notice.compareDocumentPosition(screen.getByTestId("blocker-save")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.querySelector("button")).toBeNull();
    expect(requests).not.toHaveBeenCalled();
  });
});
