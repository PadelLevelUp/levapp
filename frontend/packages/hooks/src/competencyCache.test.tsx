// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";

/**
 * PAD-422 (evaluations.competencies rule 12, "applies when made"): a competency change made from
 * "Gerir competências" must reach the class evaluation panel that is open underneath. The panel
 * builds its form rows from the class read's `competencies` (`classRowCompetencies(active, …)`),
 * which lives under `queryKeys.classEvaluations(ref)`, not under `evaluationCompetencies`. So each
 * competency mutation must mark every class read stale, or the new competency only appears after
 * a reload (the coach's report).
 *
 * Criterion: "A competency created from the class panel appears in its open form".
 */
// vi.mock is hoisted above plain consts, so the fixture it returns is hoisted with it.
const { competency } = vi.hoisted(() => ({
  competency: {
    id: 42, key: null, name: "Bandeja", group: null, scaleMin: 1, scaleMax: 5, isActive: true, sortOrder: null, scoreCount: 0,
  },
}));
vi.mock("@levelup/api/src/resources/evaluationRecords", () => ({
  switchOnCatalogueCompetency: vi.fn(async () => competency),
  createCustomCompetency: vi.fn(async () => competency),
  updateEvaluationCompetency: vi.fn(async () => competency),
  deleteEvaluationCompetency: vi.fn(async () => undefined),
}));

import {
  useCreateCustomCompetency,
  useDeleteEvaluationCompetency,
  useSwitchOnCatalogueCompetency,
  useUpdateEvaluationCompetency,
} from "./evaluations";
import { queryKeys } from "./queryKeys";

const classRef = { model: "LessonInstance", id: 7, date: "2026-09-25" };

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  // A class panel is open: its read is cached and fresh.
  queryClient.setQueryData(queryKeys.classEvaluations(classRef), { competencies: [], participants: [] });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

const classReadIsStale = (queryClient: QueryClient) =>
  queryClient.getQueryState(queryKeys.classEvaluations(classRef))?.isInvalidated === true;

describe("PAD-422: a competency change marks the open class panel's read stale", () => {
  it("creating a custom competency", async () => {
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useCreateCustomCompetency(), { wrapper });
    expect(classReadIsStale(queryClient)).toBe(false);
    await act(() => result.current.mutateAsync("Bandeja"));
    expect(classReadIsStale(queryClient)).toBe(true);
  });

  it("switching a catalogue competency on", async () => {
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useSwitchOnCatalogueCompetency(), { wrapper });
    await act(() => result.current.mutateAsync("technique"));
    expect(classReadIsStale(queryClient)).toBe(true);
  });

  it("renaming or switching one off", async () => {
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useUpdateEvaluationCompetency(), { wrapper });
    await act(() => result.current.mutateAsync({ id: 42, patch: { isActive: false } }));
    expect(classReadIsStale(queryClient)).toBe(true);
  });

  it("deleting one", async () => {
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useDeleteEvaluationCompetency(), { wrapper });
    await act(() => result.current.mutateAsync(42));
    expect(classReadIsStale(queryClient)).toBe(true);
  });
});
