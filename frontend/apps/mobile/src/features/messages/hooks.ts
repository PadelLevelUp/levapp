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
