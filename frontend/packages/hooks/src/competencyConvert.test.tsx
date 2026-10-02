// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";

/**
 * PAD-480 (evaluations.competencies rule 18): converting a legacy category, then moving the default's
 * strays under it. Criterion "A move that fails after the conversion is said": the conversion stands,
 * the failed move is reported by id, and the other moves still happen.
 */
const { api } = vi.hoisted(() => ({
  api: {
    convertEvaluationCompetency: vi.fn(),
    updateEvaluationCompetency: vi.fn(),
  },
}));
vi.mock("@levelup/api/src/resources/evaluationRecords", () => api);

import { useConvertEvaluationCompetency } from "./evaluations";
import { queryKeys } from "./queryKeys";

const converted = { id: 5, key: "technique", name: "Técnica", group: "general", parentId: null,
  scaleMin: 1, scaleMax: 5, isActive: true, sortOrder: null, scoreCount: 6 };

function setup(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useConvertEvaluationCompetency(), { wrapper });
}

describe("useConvertEvaluationCompetency (rule 18, PAD-480)", () => {
  beforeEach(() => {
    api.convertEvaluationCompetency.mockReset().mockResolvedValue(converted);
    api.updateEvaluationCompetency.mockReset();
  });

  it("converts, then moves each checked stray under the converted row", async () => {
    api.updateEvaluationCompetency.mockImplementation(async (id: number) => ({ ...converted, id, parentId: 5 }));
    const { result } = setup();

    const out = await act(() => result.current.mutateAsync({ id: 5, catalogueKey: "technique", moveIds: [8, 9] }));

    expect(api.convertEvaluationCompetency).toHaveBeenCalledWith(5, "technique");
    expect(api.updateEvaluationCompetency.mock.calls).toEqual([[8, { parentId: 5 }], [9, { parentId: 5 }]]);
    expect(out.notMoved).toEqual([]);
  });

  it("a move that fails is reported, and the others still happen", async () => {
    api.updateEvaluationCompetency.mockImplementation(async (id: number) => {
      if (id === 8) throw { response: { status: 400 } };
      return { ...converted, id, parentId: 5 };
    });
    const { result } = setup();

    const out = await act(() => result.current.mutateAsync({ id: 5, catalogueKey: "technique", moveIds: [8, 9] }));

    expect(out).toEqual({ competency: converted, notMoved: [8] });
    expect(api.updateEvaluationCompetency).toHaveBeenCalledWith(9, { parentId: 5 });
  });

  it("a refused conversion moves nothing and rejects", async () => {
    api.convertEvaluationCompetency.mockRejectedValue({ response: { status: 409, data: { error: "default_held" } } });
    const { result } = setup();

    await act(async () => {
      await expect(result.current.mutateAsync({ id: 5, catalogueKey: "technique", moveIds: [8] })).rejects.toBeTruthy();
    });
    expect(api.updateEvaluationCompetency).not.toHaveBeenCalled();
  });

  it("writes the converted row and each moved one into the list, then re-lists it and the class reads", async () => {
    const classRef = { model: "LessonInstance", id: 7, date: "2026-09-25" };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const legacy = { ...converted, key: null, name: "Técnica ", group: null };
    const bandeja = { ...converted, id: 8, key: "bandeja", name: "Bandeja", group: "technique", parentId: null };
    queryClient.setQueryData(queryKeys.evaluationCompetencies, { competencies: [legacy, bandeja], catalogue: [] });
    queryClient.setQueryData(queryKeys.classEvaluations(classRef), { competencies: [], participants: [] });
    api.updateEvaluationCompetency.mockImplementation(async (id: number) => ({ ...bandeja, id, parentId: 5 }));
    const { result } = setup(queryClient);

    await act(() => result.current.mutateAsync({ id: 5, catalogueKey: "technique", moveIds: [8] }));

    const list = queryClient.getQueryData<{ competencies: typeof converted[] }>(queryKeys.evaluationCompetencies)!;
    expect(list.competencies.find((c) => c.id === 5)).toMatchObject({ key: "technique", group: "general" });
    expect(list.competencies.find((c) => c.id === 8)).toMatchObject({ parentId: 5 });
    expect(queryClient.getQueryState(queryKeys.evaluationCompetencies)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(queryKeys.classEvaluations(classRef))?.isInvalidated).toBe(true);
  });
});
