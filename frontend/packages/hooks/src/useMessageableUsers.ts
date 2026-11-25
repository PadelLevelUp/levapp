import { useQuery } from "@tanstack/react-query";
import * as usersApi from "@levelup/api/src/resources/users";
import type { User } from "@levelup/types";

import { queryKeys } from "./queryKeys";

/**
 * Users the current user may start a NEW conversation with — scoped and
 * block-filtered server-side (GET /app/messageable-users). Used by the iOS
 * "New conversation" picker and by a coach's Messages search (PAD-831).
 * (`GET /app/users` answers the same set since PAD-500; no client calls it.)
 */
export function useMessageableUsers(options?: {
  enabled?: boolean;
  fetchUsers?: () => Promise<User[]>;
}) {
  return useQuery({
    queryKey: queryKeys.messageableUsers,
    queryFn: options?.fetchUsers ?? usersApi.getMessageableUsers,
    enabled: options?.enabled ?? true,
  });
}
