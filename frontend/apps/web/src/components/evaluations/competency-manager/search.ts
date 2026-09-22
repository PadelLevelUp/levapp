// The manager opens over whatever page the coach is on (evaluations.competencies rule
// 11): one query flag, merged into the page's own search so nothing the page keeps in
// the URL — Settings' tab, a class panel's ids — is lost while it is open.

export const COMPETENCY_MANAGER_PARAM = "competencies";
const OPEN = "open";

export function isCompetencyManagerOpen(search: string): boolean {
  return new URLSearchParams(search).get(COMPETENCY_MANAGER_PARAM) === OPEN;
}

/** The current search with the flag added. `""` gives `COMPETENCY_MANAGER_ROUTE.web`. */
export function competencyManagerSearch(search: string): string {
  const params = new URLSearchParams(search);
  params.set(COMPETENCY_MANAGER_PARAM, OPEN);
  return `?${params.toString()}`;
}

/** The current search with only the flag removed (`""` when nothing else is left). */
export function withoutCompetencyManager(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(COMPETENCY_MANAGER_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
