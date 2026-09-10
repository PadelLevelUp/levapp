import "@/api/client";
import * as registerApi from "@levelup/api/src/resources/register";
import { USE_MOCK_DATA } from "@/config";

export { activationLinkPath } from "@levelup/api/src/resources/register";

export async function registerUser(
  userId: string,
  token: string
): Promise<registerApi.RegistrationLookup> {
  if (USE_MOCK_DATA) {
    console.log("[mock] registerUser", userId);
    return { isActive: false };
  }

  return registerApi.registerUser(userId, token);
}

export async function activateAccount(
  payload: Parameters<typeof registerApi.activateAccount>[0]
): Promise<{ success: boolean }> {
  if (USE_MOCK_DATA) {
    console.log("[mock] activateAccount", payload);
    return { success: true };
  }

  return registerApi.activateAccount(payload);
}
