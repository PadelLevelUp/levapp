/**
 * PAD-659 (`calendar.event-detail` rule 23): tapping a player opens their profile over the
 * class — side in full, level, "Nesta aula", attendance, last evaluation, contact — and the two
 * detail lines the compact row no longer carries. Closing it closes only the pop-up.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ParticipantPopup } from "./ParticipantPopup";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${Object.values(opts).join(",")}` : key,
    i18n: { language: "pt" },
  }),
}));
vi.mock("@/api/attendance", () => ({ getAttendanceHistory: vi.fn(async () => ({ total: 9 })) }));
vi.mock("@/api/absences", () => ({ getAbsenceHistory: vi.fn(async () => ({ total: 2 })) }));
vi.mock("@/api/players", () => ({
  getPlayerProfile: vi.fn(async () => ({
    playerId: "1",
    evaluations: [
      { evaluatedAt: "2026-09-02T10:00:00Z" },
      { evaluatedAt: "2026-10-01T10:00:00Z" },
    ],
  })),
}));
vi.mock("@/api/messages", () => ({ createConversation: vi.fn(async () => ({ id: "c9" })) }));

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

const row = {
  playerId: "1",
  name: "Ana Lopes",
  side: "right",
  level: { id: "l", label: "3+" },
  state: "planned",
  player: { id: "1", userId: "11", user: { name: "Ana Lopes" } },
  presence: { playerId: "1", attendanceState: "planned", reminderSentAt: "2026-10-13T09:00:00Z" },
  roster: { playerId: "1", name: "Ana Lopes", phone: "+351 912 000 000", email: "ana@x.pt" },
};

function open(onClose = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ParticipantPopup row={row as never} onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return onClose;
}

describe("ParticipantPopup (rule 23)", () => {
  it("shows the player's side in full, level, state in this class, contact and the reminder hint", async () => {
    open();
    const popup = screen.getByTestId("participant-popup");
    expect(popup.getAttribute("role")).toBe("dialog");
    expect(popup.textContent).toContain("Ana Lopes");
    expect(popup.textContent).toContain("calendar.participants.sideLong.right");
    expect(popup.textContent).toContain("calendar.participants.level:3+");
    const state = screen.getByTestId("participant-popup-state");
    expect(state.getAttribute("data-group")).toBe("pending");
    expect(state.textContent).toBe("calendar.participants.state.pending");
    expect(popup.textContent).toContain("+351 912 000 000");
    expect(popup.textContent).toContain("calendar.attendanceState.reminderSent");
    await waitFor(() => expect(popup.textContent).toContain("calendar.participants.attendanceValue:9,2"));
    await waitFor(() => expect(popup.textContent).toContain("2026"));
  });

  it("a coach's validated mark reads as Vai in this class", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ParticipantPopup row={{ ...row, state: "attended", presence: { playerId: "1", attendanceState: "attended" } } as never} onClose={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const state = screen.getByTestId("participant-popup-state");
    expect(state.getAttribute("data-group")).toBe("going");
    expect(state.textContent).toBe("calendar.participants.state.going");
  });

  it("the X closes it", () => {
    const onClose = open();
    fireEvent.click(screen.getByTestId("participant-popup-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("offers a message and the full profile", () => {
    open();
    expect(screen.getByTestId("participant-popup-message").textContent).toBe("calendar.participants.sendMessage");
    expect(screen.getByTestId("participant-popup-profile").textContent).toBe("calendar.participants.fullProfile");
  });
});
