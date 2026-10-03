import type { User } from "@levelup/types";
import { getApi } from "../client";

/** Users the caller may start a NEW conversation with (scoped + block-filtered server-side). */
export async function getMessageableUsers(): Promise<User[]> {
  const res = await getApi().get("/app/messageable-users");
  return res.data;
}
