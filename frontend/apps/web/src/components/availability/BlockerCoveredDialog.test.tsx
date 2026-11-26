/**
 * calendar.student-blockers rules 21 and 25 (PAD-772): the Disponibilidade tab asks after a block is saved
 * when the save answers covered classes, and only a yes marks them. Asserted by test id and by what is
 * sent; `t` returns the key (with the count when there is one).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const toast = vi.hoisted(() => vi.fn());
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, o?: { count?: number; title?: string }) =>
      o?.count !== undefined ? `${key}:${o.count}` : o?.title ? `${key}:${o.title}` : key,
    i18n: { language: "pt" },
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/components/layout/AppLayout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/class-requests/ClassRequestsSection", () => ({ ClassRequestsSection: () => null }));
const api = vi.hoisted(() => ({
  listBlockers: vi.fn(),
  createBlocker: vi.fn(),
  updateBlocker: vi.fn(),
  deleteBlocker: vi.fn(),
  declineCoveredClasses: vi.fn(),
}));
vi.mock("@/api/availability", () => api);

import AvailabilityPage from "@/pages/AvailabilityPage";

const wed = { model: "Lesson", originalId: 7, date: "2026-12-02", title: "Quarta", start: "2026-12-02T19:00:00", end: "2026-12-02T20:00:00" };
const tue = { model: "LessonInstance", originalId: 9, date: "2026-12-08", title: "Terça", start: "2026-12-08T18:00:00", end: "2026-12-08T19:00:00" };
const saved = { id: 5, userId: 1, type: "unavailable", title: null, description: null, isRecurring: false, recurrenceRule: null, recurrenceEnd: null, blocksAutoInvitations: true, date: "2026-12-02", startTime: "08:00", endTime: "09:00" };

afterEach(() => {
  vi.clearAllMocks();
});

async function saveABlock() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AvailabilityPage />
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByTestId("availability-create-blocker"));
  fireEvent.change(await screen.findByTestId("blocker-date"), { target: { value: "2026-12-02" } });
  fireEvent.click(screen.getByTestId("blocker-save"));
}

describe("the covered-classes dialog on the Disponibilidade tab (PAD-772)", () => {
  it("[CALENDAR-STUDENT-BLOCKERS-24] asks after the save and marks only on yes", async () => {
    api.listBlockers.mockResolvedValue([saved]);
    api.createBlocker.mockResolvedValue({ ...saved, coveredClasses: [wed, tue] });

    // Keep: the dialog lists both, closes, and nothing else is sent.
    await saveABlock();
    const dialog = await screen.findByTestId("blocker-covered-dialog");
    expect(screen.getByTestId("blocker-covered-item-0").textContent).toContain("Quarta");
    expect(screen.getByTestId("blocker-covered-item-1").textContent).toContain("Terça");
    expect(dialog.textContent).toContain("availability.covered.body:2");
    fireEvent.click(screen.getByTestId("blocker-covered-keep"));
    await waitFor(() => expect(screen.queryByTestId("blocker-covered-dialog")).toBeNull());
    expect(api.declineCoveredClasses).not.toHaveBeenCalled();
  });

  it("[CALENDAR-STUDENT-BLOCKERS-24] yes posts both occurrences and says how many were marked", async () => {
    api.listBlockers.mockResolvedValue([saved]);
    api.createBlocker.mockResolvedValue({ ...saved, coveredClasses: [wed, tue] });
    api.declineCoveredClasses.mockResolvedValue({
      declined: [
        { model: "Lesson", originalId: 7, date: "2026-12-02", lessonInstanceId: 1 },
        { model: "LessonInstance", originalId: 9, date: "2026-12-08", lessonInstanceId: 9 },
      ],
      skipped: [],
    });
    await saveABlock();
    await screen.findByTestId("blocker-covered-dialog");
    fireEvent.click(screen.getByTestId("blocker-covered-decline"));
    await waitFor(() =>
      expect(api.declineCoveredClasses).toHaveBeenCalledWith({
        occurrences: [
          { model: "Lesson", originalId: 7, date: "2026-12-02" },
          { model: "LessonInstance", originalId: 9, date: "2026-12-08" },
        ],
      })
    );
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "availability.covered.marked:2" })));
  });

  it("[CALENDAR-STUDENT-BLOCKERS-24] no covered classes shows no dialog; a failed mark shows an error and the block stays listed", async () => {
    api.listBlockers.mockResolvedValue([saved]);
    api.createBlocker.mockResolvedValue({ ...saved, coveredClasses: [] });
    await saveABlock();
    await waitFor(() => expect(api.createBlocker).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("blocker-sheet")).toBeNull());
    expect(screen.queryByTestId("blocker-covered-dialog")).toBeNull();
  });

  it("[CALENDAR-STUDENT-BLOCKERS-24] a failed mark shows an error with the block still listed", async () => {
    api.listBlockers.mockResolvedValue([saved]);
    api.createBlocker.mockResolvedValue({ ...saved, coveredClasses: [wed] });
    api.declineCoveredClasses.mockRejectedValue(new Error("network"));
    await saveABlock();
    await screen.findByTestId("blocker-covered-dialog");
    fireEvent.click(screen.getByTestId("blocker-covered-decline"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: "availability.covered.failed" })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "availability.couldNotSaveTitle" }));
    expect(await screen.findByTestId("blocker-card-5")).toBeTruthy();
  });
});
