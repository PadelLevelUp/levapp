import { useQuery } from "@tanstack/react-query";
import type { PendingValidationBadge } from "@levelup/types";
import * as presencesApi from "@levelup/api/src/resources/presences";
import { queryKeys } from "./queryKeys";

/**
 * PAD-443 (`attendance.validation` rule 23): the number of classes still to validate, as the
 * dashboard's validation item counts it, for the Presences badge on both shells. Coach-only —
 * pass `enabled: false` for a student. Refetches when the app regains focus; presence writes
 * refresh it through the `presence-pending` prefix.
 */
export function usePendingValidationBadge(enabled = true) {
  return useQuery<PendingValidationBadge>({
    queryKey: queryKeys.pendingValidationBadge,
    queryFn: () => presencesApi.getPendingValidationBadge(),
    enabled,
    refetchOnWindowFocus: true,
  });
}
