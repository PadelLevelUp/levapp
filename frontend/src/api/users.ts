import type { User } from "@/types";
import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import { mockUsers } from "@/data/mockData";

export async function getUsers(): Promise<User[]> {
  if (USE_MOCK_DATA) {
    return mockUsers;
  }

  const res = await api.get("/app/users");
  return res.data;
}
