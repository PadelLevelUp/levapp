/**
 * evaluations.scale rules 1 and 8 (PAD-423) — "Escala de avaliações" on web. settings.explicit-save
 * (PAD-506): a choice is held until the tab's one Save (the harness's `harness-save`), which sends
 * `{scaleMax}` only. By test id, never by rendered copy (t is mocked to return the key).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvaluationScale } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: "pt" },
  }),
}));

const api = vi.hoisted(() => ({
  getEvaluationScale: vi.fn(),
  putEvaluationScale: vi.fn(),
}));
vi.mock("@levelup/api/src/resources/evaluationScale", () => api);

import { EvaluationScaleSetting } from "./EvaluationScaleSetting";
import { SettingsUnsavedTestHarness } from "@/test/settingsUnsavedTestHarness";

function open(data: EvaluationScale) {
  api.getEvaluationScale.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SettingsUnsavedTestHarness>
        <EvaluationScaleSetting />
      </SettingsUnsavedTestHarness>
    </QueryClientProvider>,
  );
}

afterEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

const scale = (n: number) => screen.getByTestId(`settings-evaluation-scale-option-${n}`);
const unsavedIds = () => screen.getByTestId("unsaved-ids").textContent;

describe("Escala de avaliações", () => {
  it("shows the server's scale, 1-5 for a coach who never set one", async () => {
    open({ scaleMax: 5 });
    await waitFor(() => expect(scale(5)).toBeChecked());
    for (const n of [10, 20, 100]) expect(scale(n)).not.toBeChecked();
  });

  it("choosing 1-10 is held; the Save sends {scaleMax: 10} once, and nothing else", async () => {
    open({ scaleMax: 5 });
    api.putEvaluationScale.mockResolvedValue({ scaleMax: 10 });
    await waitFor(() => expect(scale(5)).toBeChecked());

    fireEvent.click(scale(10));
    expect(scale(10)).toBeChecked();
    expect(api.putEvaluationScale).not.toHaveBeenCalled();
    expect(unsavedIds()).toBe("evaluationScale");

    fireEvent.click(screen.getByTestId("harness-save"));
    await waitFor(() => expect(api.putEvaluationScale).toHaveBeenCalledTimes(1));
    expect(api.putEvaluationScale.mock.calls[0][0]).toEqual({ scaleMax: 10 });
    await waitFor(() => expect(unsavedIds()).toBe(""));
  });

  it("a failed Save keeps the choice held and unsaved", async () => {
    open({ scaleMax: 20 });
    api.putEvaluationScale.mockRejectedValue(new Error("offline"));
    await waitFor(() => expect(scale(20)).toBeChecked());

    fireEvent.click(scale(100));
    fireEvent.click(screen.getByTestId("harness-save"));

    await waitFor(() => expect(screen.getByTestId("save-failed")).toHaveTextContent("evaluationScale"));
    expect(scale(100)).toBeChecked();
    expect(unsavedIds()).toBe("evaluationScale");
  });

  it("choosing a scale and back is clean", async () => {
    open({ scaleMax: 5 });
    await waitFor(() => expect(scale(5)).toBeChecked());

    fireEvent.click(scale(10));
    fireEvent.click(scale(5));

    expect(unsavedIds()).toBe("");
  });
});
