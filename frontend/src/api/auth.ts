import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import { MOCK_COACH_ID } from "@/data/mockData";

export type MeResponse = {
  id: number;
  username: string;
  name: string;
  roles: string[];
  coachId: string | null;
};

export async function getMe(): Promise<MeResponse> {
  if (USE_MOCK_DATA) {
    return {
      id: 1,
      username: "bernardo.terroso",
      name: "Bernardo Terroso",
      roles: ["coach"],
      coachId: MOCK_COACH_ID,
    };
  }

  const res = await api.get("/api/auth/me");
  return res.data;
}
