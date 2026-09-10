import { getApi } from "../client";

/**
 * auth.activate (PAD-254): both calls carry the link's secret. Without it the
 * backend answers 404 for any id, so a caller with no token should not call
 * at all — the screens render their invalid-link state instead.
 */

/** Builds the shareable activation link for an inactive coach-created account. */
export function activationLinkPath(userId: string | number, token: string): string {
  return `/register/${encodeURIComponent(String(userId))}?t=${encodeURIComponent(token)}`;
}

export type RegistrationLookup = {
  id?: number;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
};

export async function registerUser(
  userId: string,
  token: string
): Promise<RegistrationLookup> {
  const res = await getApi().get(`/app/register/user/${encodeURIComponent(userId)}`, {
    params: { token },
  });
  return res.data;
}

export async function activateAccount(payload: {
  userId: string;
  token: string;
  content: {
    name: string;
    username: string;
    email: string;
    phone?: string;
    password: string;
  };
}): Promise<{ success: boolean }> {
  const res = await getApi().post(
    `/app/activate/user/${encodeURIComponent(payload.userId)}`,
    { ...payload.content, token: payload.token }
  );
  return res.data;
}
