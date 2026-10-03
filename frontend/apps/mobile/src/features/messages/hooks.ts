import { usersApi } from "@levelup/api";
import type { User } from "@levelup/types";
import {
  useQuery,
  type UseQueryOptions,
} from "@tanstack/react-query";

type QueryOverrides<T> = Omit<UseQueryOptions<T>, "queryKey" | "queryFn">;

/**
 * Users the current user may start a NEW conversation with — scoped and
 * block-filtered server-side (GET /app/messageable-users). Used by the
 * "New conversation" picker. (`GET /app/users` answers the same set since PAD-500;
 * no client calls it.)
 */
export function useMessageableUsers(options?: QueryOverrides<User[]>) {
  return useQuery({
    queryKey: ["messageable-users"],
    queryFn: usersApi.getMessageableUsers,
    ...options,
  });
}
