import type {
  CompetencyGroup,
  EvaluationCatalogueEntry,
  EvaluationCompetencies,
  EvaluationCompetency,
} from "@levelup/types";

// What "Gerir competências" lists, shared by web and iOS (PAD-373;
// evaluations.competencies rules 2 and 5). Pure: it orders and labels what the API
// returned and adds nothing to it — a catalogue entry the server left out of
// `catalogue[]` (rule 4's hidden twin) must stay out.

/** Rule 2. Catalogue: toggle only. Custom and legacy: toggle, rename by id, delete. */
export type CompetencyRowKind = "catalogue" | "custom" | "legacy";

export function competencyKind(competency: Pick<EvaluationCompetency, "key" | "group">): CompetencyRowKind {
  if (competency.key) return "catalogue";
  return competency.group === null ? "legacy" : "custom";
}

/** A row the coach holds, or a built-in entry they have not switched on (no row exists yet). */
export type ManagerRow =
  | { kind: "existing"; competency: EvaluationCompetency; rowKind: CompetencyRowKind }
  | { kind: "available"; entry: EvaluationCatalogueEntry };

/** A section of the manager. `legacy` is not an API group: it is the client-side home of
 *  the categories a coach already had (`group: null`), see `managerSections`. */
export type ManagerSectionId = CompetencyGroup | "legacy";

export interface ManagerSection {
  group: ManagerSectionId;
  rows: ManagerRow[];
}

const SECTION_ORDER: ManagerSectionId[] = ["legacy", "general", "technique", "tactics", "custom"];

/**
 * The catalogue's own display order (evaluations.competencies rule 1) — the same 17 keys, in
 * the same order, as `backend/padel_app/services/evaluation_catalogue.py`; the test beside
 * this file reads that file and fails if the two drift. The client needs it because the API
 * answers rows and not-yet-rows in two lists: without the fixed order, an entry switched on
 * for the first time would jump above the entries still available, under the coach's finger.
 */
export const CATALOGUE_ORDER: readonly string[] = [
  "technique", "tactics", "consistency",
  "forehand", "backhand", "volley", "bandeja", "vibora", "smash", "glass_exit", "double_glass", "serve",
  "defensive_position", "attacking_position", "transition", "decision_making", "doubles_play",
];

/** A key this client does not know (a catalogue grown after it shipped) sorts after the known ones. */
function cataloguePosition(key: string | null): number {
  const index = key === null ? -1 : CATALOGUE_ORDER.indexOf(key);
  return index === -1 ? CATALOGUE_ORDER.length : index;
}

function rowKey(row: ManagerRow): string | null {
  return row.kind === "available" ? row.entry.key : row.competency.key;
}

/**
 * [the coach's existing categories] → Geral → Técnica → Tática → Personalizada, an empty
 * section hidden (Q31, Session-B 2026-09-21). An existing coach opens onto their own
 * things, switched on, and scrolls down to discover the catalogue; a new coach has no
 * legacy row, so they see exactly the canvas's order. Legacy rows get a section of their
 * own because they ARE a different kind of thing — their own scale, never stars.
 *
 * The order is static: nothing moves under the finger when a switch is flipped — including
 * the FIRST time, when an entry that was not a row becomes one. So Geral, Técnica and Tática
 * list the catalogue's fixed order, rows and not-yet-rows interleaved (Session-B's review of
 * d9d8c6b21, 2026-09-21); the two sections that hold rows only — the coach's existing
 * categories and "Personalizada" — keep the order the API gave (sortOrder, then name).
 */
export function managerSections(data: EvaluationCompetencies): ManagerSection[] {
  return SECTION_ORDER.map((group) => {
    const existing = data.competencies.filter((c) => (c.group ?? "legacy") === group);
    const available = group === "legacy" || group === "custom" ? [] : data.catalogue.filter((entry) => entry.group === group);
    const listed: ManagerRow[] = [
      ...existing.map((competency) => ({ kind: "existing" as const, competency, rowKind: competencyKind(competency) })),
      ...available.map((entry) => ({ kind: "available" as const, entry })),
    ];
    const fixed = group === "general" || group === "technique" || group === "tactics";
    const rows = fixed
      ? listed
          .map((row, listedAt) => ({ row, listedAt, at: cataloguePosition(rowKey(row)) }))
          .sort((a, b) => a.at - b.at || a.listedAt - b.listedAt)
          .map(({ row }) => row)
      : listed;
    return { group, rows };
  }).filter((section) => section.rows.length > 0);
}

/** A legacy category keeps its own scale and says so ("1–10"); stars need no label (rule 3). */
export function legacyScaleLabel(competency: Pick<EvaluationCompetency, "group" | "scaleMin" | "scaleMax">): string | null {
  return competency.group === null ? `${competency.scaleMin}–${competency.scaleMax}` : null;
}

/** Rule 13: zero is allowed, and the manager says what it means. */
export function activeCount(data: EvaluationCompetencies): number {
  return data.competencies.filter((c) => c.isActive).length;
}
