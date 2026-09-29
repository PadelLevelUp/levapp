/**
 * PAD-443 (attendance.validation rule 23, "Fresh"): the Presences badge refreshes after a
 * validate, a bulk validate or an undo. The page invalidates `queryKeys.pendingValidationBadge`
 * once the write settles; without it the E2E still passed, so this pins the call itself.
 *
 * The dialog is replaced by three buttons that call the page's own handlers, so what runs is the
 * page's write-then-refresh path, not the dialog.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queryKeys } from "@levelup/hooks";
import PresencesPage from "./PresencesPage";

// Stable across renders, as the real hooks are: the page's loaders depend on `t` and `toast`, and a
// fresh function per render re-runs their effects forever.
vi.mock("react-i18next", () => {
  const translation = { t: (key: string) => key, i18n: { language: "en" } };
  return { useTranslation: () => translation };
});
vi.mock("@/hooks/use-toast", () => {
  const toaster = { toast: () => {} };
  return { useToast: () => toaster };
});
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/presences/PresenceCharts", () => ({ PresenceCharts: () => null }));
vi.mock("@/components/presences/PresencePlayersTable", () => ({ PresencePlayersTable: () => null }));
vi.mock("@/components/presences/ValidateClassesDialog", () => ({
  ValidateClassesDialog: (props: {
    onValidate: (classes: Array<{ lessonInstanceId: number; presences: [] }>) => Promise<void>;
    onUnvalidate: (lessonInstanceId: number) => Promise<void>;
  }) => (
    <div>
      <button data-testid="fake-validate-one" onClick={() => void props.onValidate([{ lessonInstanceId: 1, presences: [] }])} />
      <button
        data-testid="fake-validate-bulk"
        onClick={() =>
          void props.onValidate([
            { lessonInstanceId: 1, presences: [] },
            { lessonInstanceId: 2, presences: [] },
          ])
        }
      />
      <button data-testid="fake-undo" onClick={() => void props.onUnvalidate(1)} />
    </div>
  ),
}));
vi.mock("@/api/presences", () => ({
  getPendingValidation: vi.fn().mockResolvedValue({ pending: [], validated: [] }),
  getPendingValidationCount: vi.fn().mockResolvedValue({ pendingCount: 0 }),
  getPresenceStats: vi.fn().mockResolvedValue(null),
  getPresenceTrend: vi.fn().mockResolvedValue(null),
  unvalidateClass: vi.fn().mockResolvedValue(undefined),
  validateClassPresences: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/api/players", () => ({ getCoachPlayers: vi.fn().mockResolvedValue([]) }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/presences"]}>
        <PresencesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const badgeRefreshes = () =>
    invalidate.mock.calls.filter(
      ([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(queryKeys.pendingValidationBadge)
    ).length;
  return { badgeRefreshes };
}

describe("PresencesPage refreshes the Presences badge after every write (PAD-443)", () => {
  it.each([
    ["a validate", "fake-validate-one"],
    ["a bulk validate", "fake-validate-bulk"],
    ["an undo", "fake-undo"],
  ])("after %s", async (_label, testId) => {
    const { badgeRefreshes } = renderPage();
    const before = badgeRefreshes();
    fireEvent.click(await screen.findByTestId(testId));
    await waitFor(() => expect(badgeRefreshes()).toBe(before + 1));
  });
});
