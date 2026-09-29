/**
 * evaluations.scale rules 1 and 8 (PAD-423) — "Escala de avaliações" on web. Saves on change,
 * `{scaleMax}` only; a failed save puts the previous choice back. By test id, never by rendered
 * copy (t is mocked to return the key).
 */
import * as React from "react";
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

function open(data: EvaluationScale) {
  api.getEvaluationScale.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EvaluationScaleSetting />
    </QueryClientProvider>,
  );
}

afterEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

describe("Escala de avaliações", () => {
  it("shows the server's scale, 1-5 for a coach who never set one", async () => {
    open({ scaleMax: 5 });
    await waitFor(() => expect(screen.getByTestId("settings-evaluation-scale-option-5")).toBeChecked());
    for (const n of [10, 20, 100]) expect(screen.getByTestId(`settings-evaluation-scale-option-${n}`)).not.toBeChecked();
  });

  it("choosing 1-10 saves {scaleMax: 10} at once, and nothing else", async () => {
    open({ scaleMax: 5 });
    api.putEvaluationScale.mockResolvedValue({ scaleMax: 10 });
    await waitFor(() => expect(screen.getByTestId("settings-evaluation-scale-option-5")).toBeChecked());

    fireEvent.click(screen.getByTestId("settings-evaluation-scale-option-10"));

    await waitFor(() => expect(api.putEvaluationScale).toHaveBeenCalledTimes(1));
    expect(api.putEvaluationScale.mock.calls[0][0]).toEqual({ scaleMax: 10 });
    expect(screen.getByTestId("settings-evaluation-scale-option-10")).toBeChecked();
  });

  it("a failed save puts the previous choice back and says so", async () => {
    open({ scaleMax: 20 });
    api.putEvaluationScale.mockRejectedValue(new Error("offline"));
    await waitFor(() => expect(screen.getByTestId("settings-evaluation-scale-option-20")).toBeChecked());

    fireEvent.click(screen.getByTestId("settings-evaluation-scale-option-100"));

    await waitFor(() => expect(screen.getByTestId("settings-evaluation-scale-error")).toBeInTheDocument());
    expect(screen.getByTestId("settings-evaluation-scale-option-20")).toBeChecked();
  });
});
