/**
 * PAD-403 (evaluations.legacy-conversion rules 5, 8), iOS twin of the web card test: a
 * rating is drawn from its own scale. A converted legacy category (key null, 1-5) is stars;
 * the stepper remains only for a scale that is not 1-5, which the server no longer holds.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvaluationRecord } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      (opts?.defaultValue as string) ?? (opts && Object.keys(opts).length ? `${key}|${Object.values(opts).join("|")}` : key),
    i18n: { language: "en" },
  }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

// The card calls the PAD-402 share hooks unconditionally (rules of hooks); this file is
// about drawing each rating from its scale, so they are the real @levelup/hooks since PAD-406,
// mounted in a QueryClientProvider and never pressed.
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
import { HistoryCard } from "./history-card";

const RECORD: EvaluationRecord = {
  id: 7, evaluatedOn: "2026-09-10", classInstanceId: null, className: null, note: null, editable: false, share: null,
  ratings: [
    { categoryId: 3, name: "Volley", key: null, score: 3, scaleMin: 1, scaleMax: 5 },      // converted legacy
    { categoryId: 1, name: "Técnica", key: "technique", score: 4, scaleMin: 1, scaleMax: 5 },
    { categoryId: 9, name: "Smash", key: null, score: 7, scaleMin: 1, scaleMax: 10 },       // off-scale: dormant stepper
  ],
};

let client: QueryClient;
const mount = (el: ReactElement) => renderNative(createElement(QueryClientProvider, { client }, el));
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
});

describe("HistoryCard draws each rating from its own scale", () => {
  it("a converted legacy category is stars", async () => {
    const n = await mount(<HistoryCard record={RECORD} />);
    expect(n.queryByTestId("evaluation-stars-3-3")).not.toBeNull();
    expect(n.queryByTestId("evaluation-stepper-3-value-3")).toBeNull();
    expect(n.queryByTestId("evaluation-stars-1-4")).not.toBeNull();
  });

  it("a scale that is not 1-5 stays a number", async () => {
    const n = await mount(<HistoryCard record={RECORD} />);
    expect(n.queryByTestId("evaluation-stars-9-7")).toBeNull();
    expect(n.queryByTestId("evaluation-stepper-9-value-7")).not.toBeNull();
  });
});
