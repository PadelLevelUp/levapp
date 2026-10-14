/**
 * PAD-664 (calendar.view rule 23): opening a FULL class offers its waiting list; a class the
 * student already waits for says so; a full class never offers the PAD-131 join request.
 * Located by test id (R-013); the request by its payload.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { CalendarEvent } from "@levelup/types";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1, roles: ["player"] } }) }));
vi.mock("@/api/events", () => ({ subscribeAppEvents: () => () => undefined }));
const api = vi.hoisted(() => ({
  joinClassWaitingList: vi.fn(() => Promise.resolve({ lessonInstanceId: 7, onWaitingList: true })),
  getClassInstance: vi.fn(),
}));
vi.mock("@/api/academyClasses", () => ({ joinClassWaitingList: api.joinClassWaitingList }));
vi.mock("@/api/classes", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getClassInstance: api.getClassInstance,
}));

import i18n from "@/i18n";
import { ClassDetailSheet } from "./ClassDetailSheet";

// The harness renders with the real pt locale (setup.ts); keys are resolved the same way here.
const tr = (key: string) => i18n.t(key);

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
    studentRelation: "full",
    ...extra,
  }) as CalendarEvent;

const instance = {
  id: 7,
  date: "2099-10-19",
  startTime: "09:00",
  endTime: "10:30",
  status: "scheduled",
  presences: [],
  participants: [],
  maxPlayers: 4,
};

function renderSheet(ev: CalendarEvent) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ClassDetailSheet
          event={ev}
          open
          onClose={() => undefined}
          players={[]}
          levels={[]}
          canManage={false}
          onDelete={() => undefined}
          onEdit={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return invalidate;
}

beforeEach(() => {
  api.joinClassWaitingList.mockClear();
  toast.mockClear();
  api.getClassInstance.mockReset().mockResolvedValue({ ...instance });
});

describe("a full class (PAD-664)", () => {
  it("offers the waiting list, never the join request; joining calls the API and flips to 'on'", async () => {
    const ev = event();
    const invalidate = renderSheet(ev);
    const join = await screen.findByTestId("class-waiting-list-join");
    expect(screen.getByTestId("class-waiting-list-student")).toBeTruthy();
    expect(screen.queryByTestId("class-join-request-button")).toBeNull();
    fireEvent.click(join);
    await waitFor(() => expect(api.joinClassWaitingList).toHaveBeenCalledWith(ev));
    expect(await screen.findByTestId("class-waiting-list-on")).toBeTruthy();
    expect(screen.queryByTestId("class-waiting-list-join")).toBeNull();
    expect(toast).toHaveBeenCalledWith({ title: tr("calendar.waitingList.joined") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["calendar-events"] });
  });

  it("a refused join toasts the failure and keeps the button", async () => {
    api.joinClassWaitingList.mockRejectedValueOnce(new Error("nope"));
    renderSheet(event());
    fireEvent.click(await screen.findByTestId("class-waiting-list-join"));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: tr("calendar.waitingList.failed"), variant: "destructive" })
    );
    expect(screen.getByTestId("class-waiting-list-join")).toBeTruthy();
    expect(screen.queryByTestId("class-waiting-list-on")).toBeNull();
  });
});

describe("a class the student waits for (PAD-664)", () => {
  it("says so and offers no button", async () => {
    renderSheet(event({ studentRelation: "waiting" }));
    expect(await screen.findByTestId("class-waiting-list-on")).toBeTruthy();
    // One scheme on both shells: the block is `class-waiting-list-student` in either state.
    expect(screen.getByTestId("class-waiting-list-student")).toBeTruthy();
    expect(screen.queryByTestId("class-waiting-list-join")).toBeNull();
    expect(screen.queryByTestId("class-join-request-button")).toBeNull();
  });
});

describe("an open spot (unchanged)", () => {
  it("keeps the PAD-131 join request and no waiting list", async () => {
    renderSheet(event({ studentRelation: "open_spot" }));
    expect(await screen.findByTestId("class-join-request-button")).toBeTruthy();
    expect(screen.queryByTestId("class-waiting-list-student")).toBeNull();
  });
});
