import "@/api/client";
import type { User } from "@/types";
import * as usersApi from "@levelup/api/src/resources/users";
import { USE_MOCK_DATA } from "@/config";
import { mockUsers } from "@/data/mockData";

export async function getUsers(): Promise<User[]> {
  if (USE_MOCK_DATA) {
    return mockUsers;
  }

  return usersApi.getUsers();
}
