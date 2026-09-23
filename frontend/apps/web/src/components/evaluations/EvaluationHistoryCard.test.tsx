/**
 * `evaluations.sharing` rules 8-10 (PAD-402): the history card's third action —
 * always present, whatever the record's `editable`/share state — the "✓
 * Partilhada…" line, "Deixar de partilhar" once shared, and "Atualizar
 * partilha" only while `share.stale`.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { EvaluationRecord } from "@levelup/types";

const unshareMutateAsync = vi.fn(async () => undefined);
const shareMutateAsync = vi.fn(async () => undefined);

vi.mock("@levelup/hooks", () => ({
  useUnshareEvaluation: () => ({ mutateAsync: unshareMutateAsync, isPending: false }),
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
// A shallow stand-in: this file is about the history card's OWN controls, not
// the dialog's steps (covered in ShareEvaluationDialog.test.tsx).
vi.mock("./ShareEvaluationDialog", () => ({
  ShareEvaluationDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="share-dialog-stub" /> : null,
}));

import { EvaluationHistoryCard } from "./EvaluationHistoryCard";

const record = (over: Partial<EvaluationRecord>): EvaluationRecord => ({
  id: 9, evaluatedOn: "2026-09-21", classInstanceId: null, className: null, note: null,
  editable: true, ratings: [{ categoryId: 3, name: "Técnica", key: "technique", score: 4, scaleMin: 1, scaleMax: 5 }],
  share: null, ...over,
});


describe("the share control", () => {
  it("is always rendered, sharing state notwithstanding", () => {
    render(<EvaluationHistoryCard record={record({})} onDelete={vi.fn()} playerId="9" playerName="João Silva" />);
    expect(screen.getByTestId("evaluation-history-share-9")).toBeTruthy();
  });

  it("opens the dialog on tap", () => {
    render(<EvaluationHistoryCard record={record({})} playerId="9" playerName="João Silva" />);
    expect(screen.queryByTestId("share-dialog-stub")).toBeNull();
    fireEvent.click(screen.getByTestId("evaluation-history-share-9"));
    expect(screen.getByTestId("share-dialog-stub")).toBeTruthy();
  });

  it("is absent without a player in hand (the class panel's read-only card)", () => {
    render(<EvaluationHistoryCard record={record({})} />);
    expect(screen.queryByTestId("evaluation-history-share-9")).toBeNull();
  });
});

describe("the share-status line", () => {
  it("shows nothing, and no unshare/update action, while unshared", () => {
    render(<EvaluationHistoryCard record={record({ share: null })} playerId="9" playerName="João Silva" />);
    const status = screen.getByTestId("evaluation-history-share-status-9");
    expect(status.textContent).toBe("");
    expect(screen.queryByTestId("evaluation-history-unshare-9")).toBeNull();
    expect(screen.queryByTestId("evaluation-history-update-share-9")).toBeNull();
  });

  it("names the shared date and offers 'Deixar de partilhar' once shared, no 'Atualizar' unless stale", () => {
    const shared = record({ share: { sharedAt: "2026-09-21T14:05:11", categoryIds: [3], evolution: "last", includeNote: false, stale: false } });
    render(<EvaluationHistoryCard record={shared} playerId="9" playerName="João Silva" />);
    expect(screen.getByTestId("evaluation-history-share-status-9").textContent).toContain("21 set 2026");
    expect(screen.getByTestId("evaluation-history-unshare-9")).toBeTruthy();
    expect(screen.queryByTestId("evaluation-history-update-share-9")).toBeNull();
  });

  it("offers 'Atualizar partilha' when stale: the same POST with the STORED selection, no dialog (rule 7)", async () => {
    const stale = record({ share: { sharedAt: "2026-09-21T14:05:11", categoryIds: [3], evolution: "6m", includeNote: true, stale: true } });
    render(<EvaluationHistoryCard record={stale} playerId="9" playerName="João Silva" />);
    fireEvent.click(screen.getByTestId("evaluation-history-update-share-9"));
    await Promise.resolve();
    expect(shareMutateAsync).toHaveBeenCalledWith({ recordId: 9, input: { categoryIds: [3], evolution: "6m", includeNote: true } });
    expect(screen.queryByTestId("share-dialog-stub")).toBeNull();
  });

  it("un-shares on tap", async () => {
    const shared = record({ share: { sharedAt: "2026-09-21T14:05:11", categoryIds: [3], evolution: "last", includeNote: false, stale: false } });
    render(<EvaluationHistoryCard record={shared} playerId="9" playerName="João Silva" />);
    fireEvent.click(screen.getByTestId("evaluation-history-unshare-9"));
    await Promise.resolve();
    expect(unshareMutateAsync).toHaveBeenCalledWith(9);
  });
});
