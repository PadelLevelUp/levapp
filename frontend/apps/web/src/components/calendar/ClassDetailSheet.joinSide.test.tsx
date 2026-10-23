/**
 * PAD-672 slice 1 (classes.join-requests rule 20): "Pedir para entrar" opens the side sheet with
 * the class's profile side pre-selected; the request carries the side; a request already sent
 * shows "Lado: … · aguarda o …"; the coach's row shows the side chip and "Usar … no perfil".
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { CalendarEvent } from "@levelup/types";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const auth = vi.hoisted(() => ({ roles: ["player"] }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1, roles: auth.roles } }) }));
vi.mock("@/api/events", () => ({ subscribeAppEvents: () => () => undefined }));
const api = vi.hoisted(() => ({
  createClassJoinRequest: vi.fn(),
  getClassInstance: vi.fn(),
  setPlayerProfileSide: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/api/classJoinRequests", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createClassJoinRequest: api.createClassJoinRequest,
}));
vi.mock("@/api/players", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  setPlayerProfileSide: api.setPlayerProfileSide,
}));
vi.mock("@/api/classes", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getClassInstance: api.getClassInstance,
}));

import { ClassDetailSheet } from "./ClassDetailSheet";

const event = (extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    model: "ClassInstance",
    originalId: 7,
    id: "class-7-2099-10-19",
    type: "class",
    isRecurring: false,
    title: "PEAK PERFORMANCE",
    date: "2099-10-19",
    startTime: "09:00",
    endTime: "10:30",
    color: "#1355DC",
    openSpot: true,
    studentRelation: "open_spot",
    coachName: "Ana Maria Costa",
    ...extra,
  }) as CalendarEvent;

const instance = (extra: Record<string, unknown> = {}) => ({
  id: 7,
  date: "2099-10-19",
  startTime: "09:00",
  endTime: "10:30",
  status: "scheduled",
  presences: [],
  participants: [],
  maxPlayers: 4,
  ...extra,
});

function renderSheet(ev: CalendarEvent, canManage = false) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ClassDetailSheet
          event={ev}
          open
          onClose={() => undefined}
          players={[]}
          levels={[]}
          canManage={canManage}
          onDelete={() => undefined}
          onEdit={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  toast.mockClear();
  auth.roles = ["player"];
  api.createClassJoinRequest.mockReset().mockResolvedValue({ id: 1, status: "pending", side: "right" });
  api.setPlayerProfileSide.mockClear();
  api.getClassInstance.mockReset().mockResolvedValue(instance({ profileSide: "right" }));
});

describe("Pedir para entrar (PAD-672)", () => {
  it("opens the sheet with the profile side pre-selected and sends it", async () => {
    const ev = event();
    renderSheet(ev);
    fireEvent.click(await screen.findByTestId("class-join-request-button"));
    const right = await screen.findByTestId("class-side-right");
    expect(right.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("class-side-usual-right")).toBeTruthy();
    fireEvent.click(screen.getByTestId("class-side-send"));
    await waitFor(() => expect(api.createClassJoinRequest).toHaveBeenCalledWith(ev, undefined, "right"));
  });

  it("with no profile side the question is mandatory", async () => {
    api.getClassInstance.mockResolvedValue(instance({ profileSide: null }));
    renderSheet(event());
    fireEvent.click(await screen.findByTestId("class-join-request-button"));
    await screen.findByTestId("class-side-choice");
    expect((screen.getByTestId("class-side-send") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a request already sent shows its side and the coach, and can be cancelled", async () => {
    api.getClassInstance.mockResolvedValue(
      instance({ myJoinRequest: { id: 5, status: "pending", side: "left", playerId: "1", coachId: "2" } }),
    );
    renderSheet(event());
    expect((await screen.findByTestId("class-join-request-sent-line")).textContent).toBe(
      "Lado: esquerda · aguarda o Ana Costa",
    );
    expect(screen.getByTestId("class-join-withdraw").textContent).toBe("Cancelar pedido");
  });
});

describe("accepted at once (PAD-672 slice 2, join-requests rule 21)", () => {
  it("a 201 accepted answer says the student is in, and re-reads the class", async () => {
    api.createClassJoinRequest.mockResolvedValue({ id: 1, status: "accepted", side: "right" });
    renderSheet(event());
    fireEvent.click(await screen.findByTestId("class-join-request-button"));
    await screen.findByTestId("class-side-right");
    const reads = api.getClassInstance.mock.calls.length;
    fireEvent.click(screen.getByTestId("class-side-send"));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: "Está marcado! Estás inscrito/a nesta aula." }),
    );
    await waitFor(() => expect(api.getClassInstance.mock.calls.length).toBeGreaterThan(reads));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Pedido enviado" }));
  });

  it("a pending answer keeps today's \"request sent\" toast", async () => {
    renderSheet(event());
    fireEvent.click(await screen.findByTestId("class-join-request-button"));
    await screen.findByTestId("class-side-right");
    fireEvent.click(screen.getByTestId("class-side-send"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Pedido enviado" })));
  });
});

describe("the student's own side once the class is full (PAD-672 slice 3, rule 13a)", () => {
  const own = (assignedSide: "left" | "right" | null) =>
    instance({
      openSpot: false,
      presences: [
        { id: "9", lessonInstanceId: "7", playerId: "1", invited: true, confirmed: true, validated: false, side: "both", assignedSide },
      ],
    });

  it("reads Ambos → esquerda for a both player with an assigned side", async () => {
    api.getClassInstance.mockResolvedValue(own("left"));
    renderSheet(event({ openSpot: false, studentRelation: "enrolled" } as Partial<CalendarEvent>));
    expect((await screen.findByTestId("class-own-assigned-side")).textContent).toBe(
      "O teu lado nesta aula: Ambos → esquerda",
    );
  });

  it("shows nothing while the class has a place (no assigned side)", async () => {
    api.getClassInstance.mockResolvedValue(own(null));
    renderSheet(event({ openSpot: false, studentRelation: "enrolled" } as Partial<CalendarEvent>));
    await screen.findByTestId("attendance-state").catch(() => undefined);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("class-own-assigned-side")).toBeNull();
  });
});

describe("the coach's join-request row (PAD-672)", () => {
  it("shows the requested side and saves the suggested profile side", async () => {
    auth.roles = ["coach"];
    api.getClassInstance.mockResolvedValue(
      instance({
        joinRequests: [
          {
            id: 9,
            playerId: "3",
            coachId: "2",
            playerName: "Rui Neves",
            status: "pending",
            side: "left",
            suggestedProfileSide: "left",
          },
        ],
      }),
    );
    renderSheet(event({ openSpot: false }), true);
    expect((await screen.findByTestId("class-join-request-side-chip")).textContent).toBe("Esquerda");
    const use = screen.getByTestId("class-join-request-use-side");
    expect(use.textContent).toBe("Usar esquerda no perfil");
    fireEvent.click(use);
    await waitFor(() => expect(api.setPlayerProfileSide).toHaveBeenCalledWith("2", "3", "left"));
    await waitFor(() => expect(screen.queryByTestId("class-join-request-use-side")).toBeNull());
  });

  it("offers no link when the student already has a profile side", async () => {
    auth.roles = ["coach"];
    api.getClassInstance.mockResolvedValue(
      instance({
        joinRequests: [
          { id: 9, playerId: "3", coachId: "2", playerName: "Rui Neves", status: "pending", side: "both", suggestedProfileSide: null },
        ],
      }),
    );
    renderSheet(event({ openSpot: false }), true);
    expect((await screen.findByTestId("class-join-request-side-chip")).textContent).toBe("Ambos");
    expect(screen.queryByTestId("class-join-request-use-side")).toBeNull();
  });
});
