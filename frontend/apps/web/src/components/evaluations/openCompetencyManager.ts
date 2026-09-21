import { COMPETENCY_MANAGER_ROUTE } from "@levelup/config";

/**
 * The one way into "Gerir competências" on web. Pass react-router's `navigate`.
 * PAD-373 swaps the target here (or in `COMPETENCY_MANAGER_ROUTE`); callers do not change.
 */
export function openCompetencyManager(navigate: (to: string) => void): void {
  navigate(COMPETENCY_MANAGER_ROUTE.web);
}
