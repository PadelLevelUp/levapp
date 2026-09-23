/**
 * `evaluations.sharing` rules 2-3, 6, 11, 13 (PAD-402): the two-step share flow.
 * `packages/config/src/evaluation-share.ts` runs for real here — this file only
 * proves the dialog wires it up right, never a second, re-derived source of truth.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { EvaluationCard, EvaluationRecord, EvaluationShareInput } from "@levelup/types";

const previewMutateAsync = vi.fn();
const shareMutateAsync = vi.fn();

vi.mock("@levelup/hooks", () => ({
  useShareEvaluationPreview: () => ({ mutateAsync: previewMutateAsync, isPending: false }),
  useShareEvaluation: () => ({ mutateAsync: shareMutateAsync, isPending: false }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      (opts?.defaultValue as string) ?? (opts ? `${key}|${Object.values(opts).join("|")}` : key),
    i18n: { language: "pt" },
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ShareEvaluationDialog } from "./ShareEvaluationDialog";

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

const RECORD: EvaluationRecord = {
  id: 9, evaluatedOn: "2026-09-21", classInstanceId: null, className: null,
  note: "Boa sessão", editable: true,
  ratings: [
    { categoryId: 3, name: "Técnica", key: "technique", score: 4, scaleMin: 1, scaleMax: 5 },
    { categoryId: 5, name: "Tática", key: "tactics", score: 3, scaleMin: 1, scaleMax: 5 },
  ],
  share: null,
};

const CARD: EvaluationCard = {
  recordId: 9, coachName: "Ana Ferreira", evaluatedOn: "2026-09-21", className: null, sharedAt: null,
  ratings: [{ name: "Técnica", key: "technique", score: 4, scaleMin: 1, scaleMax: 5 }],
  evolution: [{ name: "Técnica", key: "technique", delta: 1.0 }], evolutionPeriod: "last", note: null,
};

beforeEach(() => {
  previewMutateAsync.mockReset().mockResolvedValue(CARD);
  shareMutateAsync.mockReset().mockResolvedValue({ ...RECORD, share: { sharedAt: "2026-09-21T14:05:11", categoryIds: [3], evolution: "last", includeNote: false, stale: false } });
});

const open = (record: EvaluationRecord = RECORD, onOpenChange = vi.fn()) =>
  render(<ShareEvaluationDialog open record={record} playerId="9" playerName="João Silva" onOpenChange={onOpenChange} />);

describe("step 1 — choose what to show", () => {
  it("pre-selects every rated competency, and defaults evolution to 'last'", () => {
    open();
    expect((screen.getByTestId("share-category-3") as HTMLInputElement).getAttribute("data-state")).toBe("checked");
    expect((screen.getByTestId("share-category-5") as HTMLInputElement).getAttribute("data-state")).toBe("checked");
    expect(screen.getByTestId("share-evolution-last").getAttribute("aria-pressed")).toBe("true");
  });

  it("offers the note switch, off by default, only when the record has a note", () => {
    const withNote = open();
    expect(screen.getByTestId("share-include-note").getAttribute("data-state")).toBe("unchecked");
    withNote.unmount();

    render(<ShareEvaluationDialog open record={{ ...RECORD, note: null }} playerId="9" playerName="João Silva" onOpenChange={vi.fn()} />);
    expect(screen.queryByTestId("share-include-note")).toBeNull();
  });

  it("disables 'Pré-visualizar' once every box is cleared", () => {
    open();
    fireEvent.click(screen.getByTestId("share-category-3"));
    fireEvent.click(screen.getByTestId("share-category-5"));
    expect((screen.getByTestId("share-preview") as HTMLButtonElement).disabled).toBe(true);
  });

  it("writes nothing when cancelled", () => {
    const onOpenChange = vi.fn();
    open(RECORD, onOpenChange);
    fireEvent.click(screen.getByTestId("share-category-5")); // untick one, then abandon
    fireEvent.click(screen.getByTestId("share-cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(previewMutateAsync).not.toHaveBeenCalled();
    expect(shareMutateAsync).not.toHaveBeenCalled();
  });
});

describe("step 2 — the preview", () => {
  it("previews with the selection made, and renders it through EvaluationCard", async () => {
    open();
    fireEvent.click(screen.getByTestId("share-category-5")); // untick Tática
    fireEvent.click(screen.getByTestId("share-preview"));

    await waitFor(() => expect(screen.getByTestId("evaluation-shared-card-9")).toBeTruthy());
    const sent = previewMutateAsync.mock.calls[0][0] as { recordId: number; input: EvaluationShareInput };
    expect(sent).toEqual({ recordId: 9, input: { categoryIds: [3], evolution: "last", includeNote: false } });
  });

  it("'Voltar' keeps the selection intact", async () => {
    open();
    fireEvent.click(screen.getByTestId("share-category-5"));
    fireEvent.click(screen.getByTestId("share-preview"));
    await waitFor(() => expect(screen.getByTestId("evaluation-shared-card-9")).toBeTruthy());

    fireEvent.click(screen.getByTestId("share-back"));
    expect(screen.getByTestId("share-category-3").getAttribute("data-state")).toBe("checked");
    expect(screen.getByTestId("share-category-5").getAttribute("data-state")).toBe("unchecked");
  });

  it("'Partilhar' sends shareInput(selection) and closes", async () => {
    const onOpenChange = vi.fn();
    open(RECORD, onOpenChange);
    fireEvent.click(screen.getByTestId("share-preview"));
    await waitFor(() => expect(screen.getByTestId("evaluation-shared-card-9")).toBeTruthy());

    fireEvent.click(screen.getByTestId("share-submit"));
    await waitFor(() => expect(shareMutateAsync).toHaveBeenCalled());
    const sent = shareMutateAsync.mock.calls[0][0] as { recordId: number; input: EvaluationShareInput };
    expect(sent).toEqual({ recordId: 9, input: { categoryIds: [3, 5], evolution: "last", includeNote: false } });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
