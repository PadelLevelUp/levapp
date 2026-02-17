import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";

export async function registerUser(
  userId: string
): Promise<any> {
  if (USE_MOCK_DATA) {
    console.log("[mock] registerUser", userId);
    return { success: true };
  }

  const res = await api.get(`/api/app/register/user/${userId}`);
  return res.data;
}

export async function activateAccount(payload: {
  userId: string;
  content: any;
}): Promise<any> {
  if (USE_MOCK_DATA) {
    console.log("[mock] activateAccount", payload);
    return { success: true };
  }

  const res = await api.post(
    `/app/activate/user/${payload.userId}`,
    payload.content
  );
  return res.data;
}
