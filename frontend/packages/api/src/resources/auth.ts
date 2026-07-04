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
