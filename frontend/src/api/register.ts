import { api } from "@/api/client";

export async function registerUser(
  userId: string
): any {
  const res = await api.get(`/api/app/register/user/${userId}`);
  return res.data;
}

export async function activateAccount(payload: {
  userId: string;
  content: any;
}): Promise<any> {
  const res = await api.post(
    `/api/app/activate/user/${payload.userId}`, payload.content
  );

  return res.data;
}