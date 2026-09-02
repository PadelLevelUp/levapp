import { getApi } from "../client";

export async function registerUser(
  userId: string
): Promise<any> {
  const res = await getApi().get(`/app/register/user/${userId}`);
  return res.data;
}

export async function activateAccount(payload: {
  userId: string;
  content: any;
}): Promise<any> {
  const res = await getApi().post(
    `/app/activate/user/${payload.userId}`,
    payload.content
  );
  return res.data;
}
