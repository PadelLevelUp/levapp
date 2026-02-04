import type { User } from "@/types";
import { api } from "@/api/client";

export async function getUsers(): Promise<User[]> {
  const res = await api.get("/api/app/users");
  return res.data;
}
