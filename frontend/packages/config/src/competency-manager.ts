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

export interface ManagerSection {
  group: CompetencyGroup;
  rows: ManagerRow[];
}

const GROUP_ORDER: CompetencyGroup[] = ["general", "technique", "tactics", "custom"];

/** Geral → Técnica → Tática → Personalizada; legacy rows sit under Personalizada; an
 *  empty group is hidden. Inside a group: the coach's rows, then what is still available,
 *  each in the order the API gave. */
export function managerSections(data: EvaluationCompetencies): ManagerSection[] {
  return GROUP_ORDER.map((group) => {
    const existing = data.competencies.filter((c) => (c.group ?? "custom") === group);
    const available = group === "custom" ? [] : data.catalogue.filter((entry) => entry.group === group);
    const rows: ManagerRow[] = [
      ...existing.map((competency) => ({ kind: "existing" as const, competency, rowKind: competencyKind(competency) })),
      ...available.map((entry) => ({ kind: "available" as const, entry })),
    ];
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
