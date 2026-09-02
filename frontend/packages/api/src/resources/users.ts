import type { User } from "@levelup/types";
import { getApi } from "../client";

export async function getUsers(): Promise<User[]> {
  const res = await getApi().get("/app/users");
  return res.data;
}

/** Users the caller may start a NEW conversation with (scoped + block-filtered server-side). */
export async function getMessageableUsers(): Promise<User[]> {
  const res = await getApi().get("/app/messageable-users");
  return res.data;
}
