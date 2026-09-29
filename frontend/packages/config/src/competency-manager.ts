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

// ── PAD-431: categories and sub-categories ───────────────────────────────────────────────

/**
 * A section of "Definir categorias de avaliação" (evaluations.competencies rule 15). `legacy`
 * holds the categories the coach already had (flat, first, as Q31 set). A `category` section is
 * one category — its own row, or a default not yet held (`available`), or `null` when a default
 * cannot be offered because the coach already holds a row of its name — with its sub-categories.
 * `parentId` is the id new sub-categories are created under, `null` when there is none yet (a
 * default's sub-categories are then added without one, and the server brings the default back).
 */
export interface CategorySection {
  id: string;
  kind: "legacy" | "category";
  head: ManagerRow | null;
  /** The default's key when `head` is null — what the section is called. */
  headKey: string | null;
  subs: ManagerRow[];
  parentId: number | null;
}

/** The three default categories, in the catalogue's order (rule 1). */
const DEFAULT_CATEGORIES = ["technique", "tactics", "consistency"] as const;
/** A default category whose group word names sub-level entries (rule 1). */
const SUB_LEVEL: readonly string[] = ["technique", "tactics"];

const existingRow = (competency: EvaluationCompetency): ManagerRow => ({
  kind: "existing", competency, rowKind: competencyKind(competency),
});

/** Sub-categories in the catalogue's fixed order, held and offered interleaved, so nothing moves
 *  the first time an entry becomes a row; the coach's own (no key) follow in the API's order. */
function orderedSubs(held: EvaluationCompetency[], offered: EvaluationCatalogueEntry[]): ManagerRow[] {
  const keyed: ManagerRow[] = [
    ...held.filter((c) => c.key).map(existingRow),
    ...offered.map((entry) => ({ kind: "available" as const, entry })),
  ];
  const sorted = keyed
    .map((row, listedAt) => ({ row, listedAt, at: cataloguePosition(rowKey(row)) }))
    .sort((a, b) => a.at - b.at || a.listedAt - b.listedAt)
    .map(({ row }) => row);
  return [...sorted, ...held.filter((c) => !c.key).map(existingRow)];
}

/**
 * [the coach's legacy categories] → the three defaults in the catalogue's order → the coach's
 * own categories (the API's order), each with its sub-categories. Static: toggling moves nothing.
 */
export function categorySections(data: EvaluationCompetencies): CategorySection[] {
  const rows = data.competencies;
  const children = new Map<number, EvaluationCompetency[]>();
  for (const c of rows) {
    if (c.parentId != null) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
  }
  const sections: CategorySection[] = [];

  const legacy = rows.filter((c) => c.group === null);
  if (legacy.length) {
    sections.push({ id: "legacy", kind: "legacy", head: null, headKey: null, subs: legacy.map(existingRow), parentId: null });
  }

  for (const key of DEFAULT_CATEGORIES) {
    const held = rows.find((c) => c.key === key && c.parentId == null);
    const available = data.catalogue.find((entry) => entry.key === key);
    const offered = SUB_LEVEL.includes(key) ? data.catalogue.filter((entry) => entry.group === key) : [];
    const kids = held ? children.get(held.id) ?? [] : [];
    if (!held && !available && offered.length === 0) continue;
    sections.push({
      id: `key-${key}`,
      kind: "category",
      head: held ? existingRow(held) : available ? { kind: "available", entry: available } : null,
      headKey: key,
      subs: orderedSubs(kids, offered),
      parentId: held?.id ?? null,
    });
  }

  const ids = new Set(rows.map((c) => c.id));
  for (const c of rows) {
    const isDefault = c.key !== null && (DEFAULT_CATEGORIES as readonly string[]).includes(c.key);
    // A row whose category is not in the list (never from the server) is shown on its own, not lost.
    const underParent = c.parentId != null && ids.has(c.parentId);
    if (c.group === null || underParent || (isDefault && c.parentId == null)) continue;
    // A sub-level catalogue row the server left top-level (its default's name was taken) is scored
    // as a category but cannot hold sub-categories (rule 15: two levels, defaults by group word).
    const orphan = c.key !== null && SUB_LEVEL.includes(c.group);
    sections.push({
      id: c.key ? `key-${c.key}` : `id-${c.id}`,
      kind: "category",
      head: existingRow(c),
      headKey: null,
      subs: orderedSubs(children.get(c.id) ?? [], []),
      parentId: orphan || c.parentId != null ? null : c.id,
    });
  }
  return sections;
}
