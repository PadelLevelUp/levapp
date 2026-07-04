import "@/api/client";
import * as authApi from "@levelup/api/src/resources/auth";
import { USE_MOCK_DATA } from "@/config";
import { MOCK_COACH_ID } from "@/data/mockData";

export type { MeResponse } from "@levelup/api/src/resources/auth";
import type { MeResponse } from "@levelup/api/src/resources/auth";

export async function getMe(): Promise<MeResponse> {
  if (USE_MOCK_DATA) {
    return {
      id: 1,
      username: "bernardo.terroso",
      name: "Bernardo Terroso",
      roles: ["coach"],
      coachId: MOCK_COACH_ID,
      isSuperAdmin: false,
      language: "pt",
    };
  }

  return authApi.getMe();
}

export async function updateMe(payload: { language?: "pt" | "en" }): Promise<MeResponse> {
  return authApi.updateMe(payload);
}
