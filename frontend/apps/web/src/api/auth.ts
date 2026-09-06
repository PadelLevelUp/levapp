import "@/api/client";
import * as authApi from "@levelup/api/src/resources/auth";
import { USE_MOCK_DATA } from "@/config";
import { MOCK_COACH_ID } from "@/data/mockData";

export type {
  MeResponse,
  UpdateMePayload,
  RegisterPayload,
  RegisterResponse,
  CoachApprovalStatus,
} from "@levelup/api/src/resources/auth";
import type { MeResponse, UpdateMePayload, RegisterPayload, RegisterResponse } from "@levelup/api/src/resources/auth";

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
      abbreviation: "BT",
      email: "bernardo.terroso@example.com",
      phone: "",
      blockAutoInvitations: false,
      blockManualInvitations: false,
      blockAllNotifications: false,
      notificationBlockReason: "",
      coachApproval: "approved",
      clubs: [{ id: 1, name: "Padel Academy" }],
      pendingClubJoinRequest: null,
    };
  }

  return authApi.getMe();
}

/** auth.register: self-service signup. Not mockable — it creates a real account. */
export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  return authApi.register(payload);
}

export async function updateMe(payload: UpdateMePayload): Promise<MeResponse> {
  return authApi.updateMe(payload);
}

/** Soft-deletes the signed-in account and invalidates all sessions server-side (App Store 5.1.1(v)). */
export async function deleteAccount(): Promise<void> {
  if (USE_MOCK_DATA) return;
  return authApi.deleteAccount();
}
