import type { User } from "@levelup/types";
import { getApi } from "../client";

export async function getUsers(): Promise<User[]> {
  const res = await getApi().get("/app/users");
  return res.data;
}
