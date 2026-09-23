/**
 * PAD-402 (`evaluations.sharing` rules 2, 6). `ShareStep1` and `ShareStep2`
 * (`./share-evaluation-steps.tsx`) are pure presentational pieces of
 * `ShareEvaluationScreen` — deliberately kept in their own module with no
 * react-query and no `@/components/screen` (real `react-native-safe-area-
 * context`, which the harness cannot mount — `mobile-harness-cannot-mount-
 * react-query-hooks`), so they mount directly through `renderNative` with
 * only `@expo/vector-icons` (reached through `@/components/ui/checkbox`) and
 * `react-i18next` mocked, the way `competency-manager.test.tsx` mocks them.
 * Covers what the ticket asks for: step 1's pre-selection and its
 * "Pré-visualizar" gating (`canPreview`), and that the note switch is absent
 * without a note. Assertions are on testIDs and `accessibilityState`/`props`,
 * never rendered copy.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { EvaluationCard, EvaluationRecord } from "@levelup/types";
import { initialShareSelection, type ShareSelection } from "@levelup/config";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { ShareStep1, ShareStep2 } from "./share-evaluation-steps";

function record(over: Partial<EvaluationRecord>): EvaluationRecord {
  return {
    id: 41,
    evaluatedOn: "2026-09-21",
    classInstanceId: null,
    className: null,
    note: null,
    editable: true,
    ratings: [
      { categoryId: 1, name: "Técnica", key: null, score: 4, scaleMin: 1, scaleMax: 5 },
      { categoryId: 2, name: "Tática", key: null, score: 3, scaleMin: 1, scaleMax: 5 },
    ],
    share: null,
    ...over,
  };
}

function card(over: Partial<EvaluationCard> = {}): EvaluationCard {
  return {
    recordId: 41,
    coachName: "Ana",
    evaluatedOn: "2026-09-21",
    className: null,
    sharedAt: null,
    ratings: [{ name: "Técnica", key: null, score: 4, scaleMin: 1, scaleMax: 5 }],
    evolution: [],
    evolutionPeriod: "last",
    note: null,
    ...over,
  };
}

describe("ShareStep1 — evaluations.sharing rule 2 (pre-selection) and rule 6 (gating)", () => {
  it("pre-selects every rated competency, in the record's own order, and defaults evolution to 'last'", async () => {
    const r = record({});
    const selection = initialShareSelection(r);
    expect(selection).toEqual({ categoryIds: [1, 2], evolution: "last", includeNote: false });

    const n = await renderNative(
      createElement(ShareStep1, {
        record: r,
        selection,
        onToggleCategory: vi.fn(),
        onEvolutionChange: vi.fn(),
        onIncludeNoteChange: vi.fn(),
        onPreview: vi.fn(),
        previewing: false,
      }),
    );
    expect(n.byTestId("share-category-1").props.accessibilityState).toEqual({ checked: true });
    expect(n.byTestId("share-category-2").props.accessibilityState).toEqual({ checked: true });
    expect(n.byTestId("share-evolution-last").props.accessibilityState).toEqual({ selected: true });
    expect(n.byTestId("share-preview").props.disabled).toBe(false);
  });

  it("disables Pré-visualizar with every box clear (rule 6)", async () => {
    const r = record({});
    const empty: ShareSelection = { categoryIds: [], evolution: "last", includeNote: false };
    const n = await renderNative(
      createElement(ShareStep1, {
        record: r,
        selection: empty,
        onToggleCategory: vi.fn(),
        onEvolutionChange: vi.fn(),
        onIncludeNoteChange: vi.fn(),
        onPreview: vi.fn(),
        previewing: false,
      }),
    );
    expect(n.byTestId("share-preview").props.disabled).toBe(true);
  });

  it("omits the note switch when the record has no note, off by default when it does", async () => {
    const withoutNote = record({ note: null });
    const n1 = await renderNative(
      createElement(ShareStep1, {
        record: withoutNote,
        selection: initialShareSelection(withoutNote),
        onToggleCategory: vi.fn(),
        onEvolutionChange: vi.fn(),
        onIncludeNoteChange: vi.fn(),
        onPreview: vi.fn(),
        previewing: false,
      }),
    );
    expect(n1.queryByTestId("share-include-note")).toBeNull();

    const withNote = record({ note: "Boa sessão" });
    const n2 = await renderNative(
      createElement(ShareStep1, {
        record: withNote,
        selection: initialShareSelection(withNote),
        onToggleCategory: vi.fn(),
        onEvolutionChange: vi.fn(),
        onIncludeNoteChange: vi.fn(),
        onPreview: vi.fn(),
        previewing: false,
      }),
    );
    expect(n2.queryByTestId("share-include-note")).not.toBeNull();
    expect(n2.byTestId("share-include-note").props.accessibilityState).toEqual({ checked: false });
  });

  it("reports a toggled category and a changed evolution period to the caller", async () => {
    const r = record({});
    const onToggleCategory = vi.fn();
    const onEvolutionChange = vi.fn();
    const n = await renderNative(
      createElement(ShareStep1, {
        record: r,
        selection: initialShareSelection(r),
        onToggleCategory,
        onEvolutionChange,
        onIncludeNoteChange: vi.fn(),
        onPreview: vi.fn(),
        previewing: false,
      }),
    );
    await n.press("share-category-2");
    expect(onToggleCategory).toHaveBeenCalledWith(2);
    await n.press("share-evolution-6m");
    expect(onEvolutionChange).toHaveBeenCalledWith("6m");
  });
});

describe("ShareStep2 — evaluations.sharing rule 3 (the preview is what the player gets)", () => {
  it("disables Partilhar until the preview has answered", async () => {
    const n = await renderNative(createElement(ShareStep2, { card: null, onSubmit: vi.fn(), submitting: false }));
    expect(n.byTestId("share-submit").props.disabled).toBe(true);
  });

  it("submits the previewed card once it has loaded", async () => {
    const onSubmit = vi.fn();
    const n = await renderNative(createElement(ShareStep2, { card: card(), onSubmit, submitting: false }));
    expect(n.byTestId("share-submit").props.disabled).toBe(false);
    await n.press("share-submit");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
