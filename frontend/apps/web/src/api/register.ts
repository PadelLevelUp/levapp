import "@/api/client";
import * as registerApi from "@levelup/api/src/resources/register";
import { USE_MOCK_DATA } from "@/config";

export async function registerUser(
  userId: string
): Promise<any> {
  if (USE_MOCK_DATA) {
    console.log("[mock] registerUser", userId);
    return { success: true };
  }

  return registerApi.registerUser(userId);
}

export async function activateAccount(payload: {
  userId: string;
  content: any;
}): Promise<any> {
  if (USE_MOCK_DATA) {
    console.log("[mock] activateAccount", payload);
    return { success: true };
  }

  return registerApi.activateAccount(payload);
}
