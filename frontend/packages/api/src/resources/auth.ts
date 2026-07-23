import { getApi } from "../client";

export type MeResponse = {
  id: number;
  username: string;
  name: string;
  roles: string[];
  coachId: string | null;
  isSuperAdmin: boolean;
  language?: "pt" | "en";
  /** PAD-81: profile fields the Settings profile form is hydrated from. */
  abbreviation?: string;
  email?: string | null;
  phone?: string | null;
};

/**
 * PAD-81: partial update of the signed-in user's own profile. Only the keys
 * present are changed server-side, so callers can save a single field.
 */
export type UpdateMePayload = {
  language?: "pt" | "en";
  name?: string;
  abbreviation?: string;
  email?: string;
  phone?: string;
};

export async function getMe(): Promise<MeResponse> {
  const res = await getApi().get("/auth/me");
  return res.data;
}

export async function updateMe(payload: UpdateMePayload): Promise<MeResponse> {
  const res = await getApi().patch("/auth/me", payload);
  return res.data;
}

/** Soft-deletes the signed-in account and invalidates all sessions server-side (App Store 5.1.1(v)). */
export async function deleteAccount(): Promise<void> {
  await getApi().delete("/auth/me");
}
