import { getApi } from "../client";

export type MeResponse = {
  id: number;
  username: string;
  name: string;
  roles: string[];
  coachId: string | null;
  isSuperAdmin: boolean;
  language?: "pt" | "en";
};

export async function getMe(): Promise<MeResponse> {
  const res = await getApi().get("/auth/me");
  return res.data;
}

export async function updateMe(payload: { language?: "pt" | "en" }): Promise<MeResponse> {
  const res = await getApi().patch("/auth/me", payload);
  return res.data;
}

/** Soft-deletes the signed-in account and invalidates all sessions server-side (App Store 5.1.1(v)). */
export async function deleteAccount(): Promise<void> {
  await getApi().delete("/auth/me");
}
