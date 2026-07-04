import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as availabilityApi from "@levelup/api/src/resources/availability";
import type { BlockerInput } from "@levelup/api/src/resources/availability";
import { queryKeys } from "@levelup/hooks";

/**
 * Mutations for student availability blockers (PAD-28), wrapping the
 * @levelup/api resource. The list query itself comes from @levelup/hooks
 * (useAvailabilityBlockers); each mutation invalidates it.
 */

function useBlockersInvalidation() {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({
      queryKey: queryKeys.availabilityBlockers,
    });
}

export function useCreateBlocker() {
  const invalidate = useBlockersInvalidation();
  return useMutation({
    mutationFn: (data: BlockerInput) => availabilityApi.createBlocker(data),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateBlocker() {
  const invalidate = useBlockersInvalidation();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: BlockerInput }) =>
      availabilityApi.updateBlocker(id, data),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteBlocker() {
  const invalidate = useBlockersInvalidation();
  return useMutation({
    // DELETE /app/availability_blockers/<id> with {scope: "all"} — recurring
    // blockers are removed for all occurrences, mirroring the web page.
    mutationFn: (id: number) => availabilityApi.deleteBlocker(id),
    onSuccess: () => invalidate(),
  });
}
