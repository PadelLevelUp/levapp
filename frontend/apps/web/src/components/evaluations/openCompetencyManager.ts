import { competencyManagerSearch } from "@/components/evaluations/competency-manager/search";

/**
 * The one way into "Gerir competências" on web. Pass react-router's `navigate`.
 * PAD-373 swaps the target here (or in `COMPETENCY_MANAGER_ROUTE`); callers do not change.
 */
export function openCompetencyManager(navigate: (to: string) => void): void {
  // PAD-373: the manager opens over the page the coach is on. A search-only navigate
  // REPLACES the search, so the flag is merged into it (`""` gives COMPETENCY_MANAGER_ROUTE.web).
  navigate(competencyManagerSearch(window.location.search));
}
