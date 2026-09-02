import { usersApi } from "@levelup/api";
import type { User } from "@levelup/types";
import {
  useQuery,
  type UseQueryOptions,
} from "@tanstack/react-query";

type QueryOverrides<T> = Omit<UseQueryOptions<T>, "queryKey" | "queryFn">;

/** Users the current user can start a conversation with (GET /app/users). */
export function useUsers(options?: QueryOverrides<User[]>) {
  return useQuery({
    queryKey: ["users"],
    queryFn: usersApi.getUsers,
    ...options,
  });
}

/**
 * Users the current user may start a NEW conversation with — scoped and
 * block-filtered server-side (GET /app/messageable-users). Used by the
 * "New conversation" picker instead of useUsers, which returns every active
 * user regardless of messaging scope or block state.
 */
export function useMessageableUsers(options?: QueryOverrides<User[]>) {
  return useQuery({
    queryKey: ["messageable-users"],
    queryFn: usersApi.getMessageableUsers,
    ...options,
  });
}
