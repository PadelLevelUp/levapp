/**
 * PAD-925 (classes.detail-visibility rule 6): the class detail shows a "Particular" / "Academia"
 * chip beside the title, for the coach and the student alike. Located by test id (R-013).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { CalendarEvent } from "@levelup/types";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1, roles: ["coach"] } }) }));
vi.mock("@/api/events", () => ({ subscribeAppEvents: () => () => undefined }));
const api = vi.hoisted(() => ({ getApprovalState: vi.fn(), getClassInstance: vi.fn() }));
vi.mock("@/api/notificationEngine", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getApprovalState: api.getApprovalState,
}));
vi.mock("@/api/classes", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getClassInstance: api.getClassInstance,
}));

import { ClassDetailSheet } from "./ClassDetailSheet";

const event = {
  model: "LessonInstance",
  originalId: 7,
  id: "class-7-2099-10-19",
  type: "class",
  isRecurring: false,
  title: "Class",
  date: "2099-10-19",
  startTime: "09:00",
  endTime: "10:30",
  color: "#1355DC",
  openSpot: false,
} as unknown as CalendarEvent;


function classOf(classType: string | undefined) {
  return {
    id: 7, date: "2099-10-19", startTime: "09:00", endTime: "10:30", status: "scheduled",
    presences: [], participants: [], maxPlayers: 4, name: "Aula", classType,
  };
}

async function chip(classType: string | undefined, canManage: boolean) {
  api.getApprovalState.mockReset().mockResolvedValue({ state: "none" });
  api.getClassInstance.mockReset().mockResolvedValue(classOf(classType));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ClassDetailSheet
          event={event}
          open
          onClose={() => undefined}
          players={[]}
          levels={[]}
          canManage={canManage}
          onDelete={() => undefined}
          onEdit={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  await waitFor(() => expect(screen.getByTestId("class-detail-title")).toBeTruthy());
  return screen.queryByTestId("class-type-chip");
}

describe("the class type chip (PAD-925)", () => {
  it.each([true, false])("[CLASSES-DETAIL-VISIBILITY-6] shows the private chip (canManage %s)", async (canManage) => {
    const el = await chip("private", canManage);
    expect(el?.textContent).toMatch(/^(Particular|Private)$/);
  });

  it("[CLASSES-DETAIL-VISIBILITY-6] shows the academy chip", async () => {
    expect((await chip("academy", true))?.textContent).toMatch(/^(Academia|Academy)$/);
  });

  it("[CLASSES-DETAIL-VISIBILITY-6] shows no chip when the type is unknown", async () => {
    expect(await chip(undefined, true)).toBeNull();
  });
});
