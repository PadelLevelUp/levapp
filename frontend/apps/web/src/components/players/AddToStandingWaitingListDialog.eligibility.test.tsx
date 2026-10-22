/**
 * PAD-724 (PAD-669 R5; notifications.waiting-list rule 2a) on web: before adding a student to the
 * standing list, the classes it would reach whose bar they fail are named and the button turns into
 * "Adicionar mesmo assim"; a second press adds. With nothing to name, the first press adds (control).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const api = vi.hoisted(() => ({
  addToStandingWaitingList: vi.fn(() => Promise.resolve({ id: 1 })),
  renewStandingWaitingListEntry: vi.fn(),
  checkStandingEligibility: vi.fn(),
}));
vi.mock("@/api/notificationEngine", () => api);

import { AddToStandingWaitingListDialog } from "./AddToStandingWaitingListDialog";

const failing = [{ lessonInstanceId: 9, title: "Sábado 18h", startDatetime: "2026-10-24T18:00:00", ineligible: [] }];

beforeEach(() => {
  api.addToStandingWaitingList.mockClear();
});

function mount() {
  render(<AddToStandingWaitingListDialog open onClose={() => {}} playerId={2} playerName="Ana Pinto" />);
}

describe("PAD-724 the standing list warns before adding a student who fails some classes' bar", () => {
  it("names the classes on the first press, adds on the second", async () => {
    api.checkStandingEligibility.mockResolvedValue({ classes: failing });
    mount();
    fireEvent.click(screen.getByTestId("standing-wl-confirm"));
    await waitFor(() => expect(screen.getByTestId("standing-wl-eligibility-warning")).toBeInTheDocument());
    expect(screen.getByTestId("standing-wl-eligibility-warning").textContent).toContain("Sábado 18h · 24/10 18:00");
    expect(api.addToStandingWaitingList).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("standing-wl-confirm"));
    await waitFor(() => expect(api.addToStandingWaitingList).toHaveBeenCalledTimes(1));
  });

  it("with nothing to name, the first press adds", async () => {
    api.checkStandingEligibility.mockResolvedValue({ classes: [] });
    mount();
    fireEvent.click(screen.getByTestId("standing-wl-confirm"));
    await waitFor(() => expect(api.addToStandingWaitingList).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("standing-wl-eligibility-warning")).toBeNull();
  });
});
