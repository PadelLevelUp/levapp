import { courtsApi } from "@levelup/api";

/**
 * B-266 (clubs.courts rule 7): the query behind the class editor's Court select — the courts of
 * the CLASS's own club, which is what edit_class validates against. Keyed by that club, so two
 * classes at two clubs never share a cache entry. The coach's current club is for NEW classes only.
 */
export function classCourtsQuery(clubId: number | null | undefined) {
  return {
    queryKey: ["class-courts", clubId ?? null] as const,
    queryFn: () => courtsApi.listCourtsForClass({ clubId }),
  };
}
