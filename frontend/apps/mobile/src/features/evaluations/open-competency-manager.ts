import { COMPETENCY_MANAGER_ROUTE } from "@levelup/config";

/**
 * The one way into "Gerir competências" on iOS. Pass expo-router's `router`.
 * PAD-373 swaps the target here (or in `COMPETENCY_MANAGER_ROUTE`); callers do not change.
 */
export function openCompetencyManager(router: { push: (href: string) => void }): void {
  router.push(COMPETENCY_MANAGER_ROUTE.mobile);
}
