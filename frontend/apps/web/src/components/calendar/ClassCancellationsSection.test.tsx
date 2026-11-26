/** PAD-840 (classes.delete rule 14): the web class detail's list of kept cancellations. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@levelup/api/src/resources/classes", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getClassCancellations: api.get,
}));
vi.mock("react-i18next", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "pt" } }),
}));

import { ClassCancellationsSection } from "./ClassCancellationsSection";

const mount = (props: { lessonId?: string; enabled: boolean }) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ClassCancellationsSection {...props} />
    </QueryClientProvider>,
  );

beforeEach(() =>
  api.get.mockReset().mockResolvedValue([
    { date: "2099-12-01", scope: "future", reason: "Fim da época", sentToStudents: false },
    { date: "2099-11-24", scope: "single", reason: "Chuva", sentToStudents: true },
  ]),
);

describe("the class detail's cancellations (PAD-840)", () => {
  it("[CLASSES-DELETE-20] the detail lists each cancellation with its date, reason and whether it was sent", async () => {
    mount({ lessonId: "9", enabled: true });
    await waitFor(() => expect(screen.getAllByTestId("class-cancellation-row")).toHaveLength(2));
    expect(api.get).toHaveBeenCalledWith("9");
    const [future, single] = screen.getAllByTestId("class-cancellation-row").map((r) => r.textContent);
    expect(future).toMatch(/1 dez/);
    for (const part of ["calendar.cancellations.andFollowing", "Fim da época", "calendar.cancellations.notSent"])
      expect(future).toContain(part);
    expect(single).toMatch(/24 nov/);
    for (const part of ["Chuva", "calendar.cancellations.sent"]) expect(single).toContain(part);
    expect(single).not.toContain("andFollowing");
  });

  it("[CLASSES-DELETE-20] a class with none shows no section, and nobody but the coach asks", async () => {
    api.get.mockResolvedValue([]);
    mount({ lessonId: "9", enabled: true });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("class-cancellations")).toBeNull();
    mount({ lessonId: "9", enabled: false });
    mount({ enabled: true });
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
