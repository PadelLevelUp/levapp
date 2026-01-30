import { api } from "@/api/client";

export type MeResponse = {
  id: number;
  username: string;
  name: string;
  roles: string[];
  coachId: number | null;
};

export async function getMe(): Promise<MeResponse> {
  const res = await api.get("/api/auth/me");
  return res.data;
}
