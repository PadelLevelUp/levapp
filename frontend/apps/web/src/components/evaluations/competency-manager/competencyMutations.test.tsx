import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Lives under apps/web because no runner collects packages/**/*.test.tsx (the packages
// config takes *.test.ts in a Node environment only).
//
// evaluations.competencies rules 6-9 and 12 (PAD-373): every change the manager makes
// applies when made, and the competency list every evaluation surface reads is
// refreshed from the server afterwards — never patched by hand.

const api = vi.hoisted(() => ({
  getEvaluationCompetencies: vi.fn(async () => ({ competencies: [], catalogue: [] })),
  switchOnCatalogueCompetency: vi.fn(async (key: string) => ({ id: 1, key })),
  createCustomCompetency: vi.fn(async (name: string) => ({ id: 2, name })),
  updateEvaluationCompetency: vi.fn(async (id: number, patch: object) => ({ id, ...patch })),
  deleteEvaluationCompetency: vi.fn(async () => undefined),
  getEvaluationCompetencyImpact: vi.fn(async (id: number) => ({ name: "Saque cruzado", scores: 5, players: 2, id })),
}));
vi.mock("@levelup/api/src/resources/evaluationRecords", () => api);

import {
  evaluationApiErrorCode,
  useCreateCustomCompetency,
  useDeleteEvaluationCompetency,
  useEvaluationCompetencies,
  useEvaluationCompetencyImpact,
  useSwitchOnCatalogueCompetency,
  useUpdateEvaluationCompetency,
  queryKeys,
} from "@levelup/hooks";

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => Object.values(api).forEach((fn) => fn.mockClear()));

describe("queryKeys.evaluationCompetencyImpact", () => {
  it("embeds the competency id, next to the list key and distinct from it", () => {
    expect(queryKeys.evaluationCompetencyImpact(13)).toEqual(["evaluation-competency-impact", 13]);
    expect(queryKeys.evaluationCompetencyImpact(13)[0]).not.toBe(queryKeys.evaluationCompetencies[0]);
  });
});

describe("the competency mutations", () => {
  const cases = [
    ["switch on", () => useSwitchOnCatalogueCompetency(), "bandeja", () => api.switchOnCatalogueCompetency, ["bandeja"]],
    ["create custom", () => useCreateCustomCompetency(), "Saque cruzado", () => api.createCustomCompetency, ["Saque cruzado"]],
    ["update", () => useUpdateEvaluationCompetency(), { id: 13, patch: { isActive: false } }, () => api.updateEvaluationCompetency, [13, { isActive: false }]],
    ["delete", () => useDeleteEvaluationCompetency(), 13, () => api.deleteEvaluationCompetency, [13]],
  ] as const;

  it.each(cases)("%s calls the v2 client once and re-lists the competencies", async (_name, useHook, input, fn, args) => {
    const { wrapper } = harness();
    const list = renderHook(() => useEvaluationCompetencies(), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    expect(api.getEvaluationCompetencies).toHaveBeenCalledTimes(1);
    const mutation = renderHook(() => (useHook as () => { mutateAsync: (v: unknown) => Promise<unknown> })(), { wrapper });

    await act(async () => {
      await mutation.result.current.mutateAsync(input);
    });

    expect(fn()).toHaveBeenCalledTimes(1);
    expect(fn()).toHaveBeenCalledWith(...args);
    await waitFor(() => expect(api.getEvaluationCompetencies).toHaveBeenCalledTimes(2));
  });

  it("a false isActive and a zero sortOrder reach the client as themselves", async () => {
    const { wrapper } = harness();
    const mutation = renderHook(() => useUpdateEvaluationCompetency(), { wrapper });

    await act(async () => {
      await mutation.result.current.mutateAsync({ id: 13, patch: { isActive: false, sortOrder: 0 } });
    });

    expect(api.updateEvaluationCompetency).toHaveBeenCalledWith(13, { isActive: false, sortOrder: 0 });
  });
});

describe("useEvaluationCompetencyImpact", () => {
  it("reads nothing until it is asked to, then reads that competency's impact", async () => {
    const { wrapper } = harness();
    const { result, rerender } = renderHook(({ id, on }: { id: number | null; on: boolean }) =>
      useEvaluationCompetencyImpact(id, on), { wrapper, initialProps: { id: null as number | null, on: false } });
    await new Promise((r) => setTimeout(r, 20));
    expect(api.getEvaluationCompetencyImpact).not.toHaveBeenCalled();

    rerender({ id: 13, on: true });

    await waitFor(() => expect(result.current.data).toEqual({ name: "Saque cruzado", scores: 5, players: 2, id: 13 }));
    expect(api.getEvaluationCompetencyImpact).toHaveBeenCalledWith(13);
  });
});

describe("evaluationApiErrorCode", () => {
  it("reads the v2 API's {error: code} and nothing else", () => {
    expect(evaluationApiErrorCode({ response: { status: 409, data: { error: "duplicate_name" } } })).toBe("duplicate_name");
    expect(evaluationApiErrorCode({ response: { status: 500, data: "<html>" } })).toBeNull();
    expect(evaluationApiErrorCode(new Error("Network Error"))).toBeNull();
    expect(evaluationApiErrorCode(null)).toBeNull();
  });
});
