import type { EvaluationRecord, EvaluationShareEvolution, EvaluationShareInput } from "@levelup/types";

// evaluations.sharing (PAD-402). Pure state for the two-step share flow — Step 1
// ("choose what to show") and Step 2 (preview → share) both close over this
// shape, so web (a modal) and iOS (two pushed screens) can't diverge on what
// starts ticked, what a toggle does, or when the flow may move on.

export interface ShareSelection {
  categoryIds: number[];
  evolution: EvaluationShareEvolution;
  includeNote: boolean;
}

/**
 * sharing.spec.md rule 2 — Step 1's defaults: every competency RATED IN THIS
 * RECORD starts ticked, in the record's own (coach) order; the evolution choice
 * starts on "Desde a última avaliação" (`last`); the include-note toggle starts
 * OFF, even when the record carries a note — the note only travels if the coach
 * opts in (it is never pre-ticked).
 */
export function initialShareSelection(record: Pick<EvaluationRecord, "ratings">): ShareSelection {
  return {
    categoryIds: record.ratings.map((rating) => rating.categoryId),
    evolution: "last",
    includeNote: false,
  };
}

/**
 * sharing.spec.md rule 4: order is the coach's competency order, never the order
 * of ticking — re-ticking a competency does not move it. `categoryIds`' own
 * array order is never read downstream to enforce that: the checklist renders in
 * `record.ratings`' order (the coach's order already) and the server re-sorts
 * the chosen ids the same way when it builds the `Card`. So toggling only needs
 * to add or remove the id — it never needs to reposition it.
 */
export function toggleCategory(selection: ShareSelection, categoryId: number): ShareSelection {
  const isSelected = selection.categoryIds.includes(categoryId);
  return {
    ...selection,
    categoryIds: isSelected
      ? selection.categoryIds.filter((id) => id !== categoryId)
      : [...selection.categoryIds, categoryId],
  };
}

/**
 * sharing.spec.md rule 6: "Pré-visualizar" and "Partilhar" are disabled with
 * every box clear — an empty `categoryIds` is refused server-side (400) too,
 * but the control never lets a coach send it.
 */
export function canPreview(selection: ShareSelection): boolean {
  return selection.categoryIds.length > 0;
}

/**
 * sharing.spec.md rule 11: the body both `POST .../share_preview` and
 * `POST .../share` send — `categoryIds`, `evolution` and `includeNote` are all
 * required, never omitted (an absent key means something different to the
 * server than a falsy one).
 */
export function shareInput(selection: ShareSelection): EvaluationShareInput {
  return {
    categoryIds: selection.categoryIds,
    evolution: selection.evolution,
    includeNote: selection.includeNote,
  };
}
