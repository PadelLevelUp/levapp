// admin.foundation (PAD-531): the console's only HTTP client. Same origin everywhere
// (admin.levapp.app → /admin/api on the host nginx; the Vite proxy locally), token in
// sessionStorage for the tab (rule 3: 12 h, no refresh), and a 401 ends the session.

export const TOKEN_KEY = "levapp-admin-token";
export const SESSION_KEY = "levapp-admin-session";
export const UNAUTHORIZED_EVENT = "levapp-admin:unauthorized";

export type AdminRoleName = "owner" | "operator" | "support";

export interface AdminSession {
  email: string;
  role: AdminRoleName;
  roleId: number;
  expiresAt: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return storage()?.getItem(TOKEN_KEY) ?? null;
}

export function readSession(): AdminSession | null {
  const raw = storage()?.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AdminSession;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function storeSession(token: string, session: AdminSession) {
  storage()?.setItem(TOKEN_KEY, token);
  storage()?.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  storage()?.removeItem(TOKEN_KEY);
  storage()?.removeItem(SESSION_KEY);
}

export interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  auth?: boolean;
  fetchImpl?: typeof fetch;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, fetchImpl = fetch } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetchImpl(`/admin/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK");
  }
  const text = await response.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    const code = typeof data.error === "string" ? data.error : `HTTP_${response.status}`;
    if (response.status === 401 && auth) {
      clearSession();
      if (typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(response.status, code);
  }
  return data as T;
}

// ── resources ─────────────────────────────────────────────────────────────────

export interface AuthConfig {
  googleClientId: string;
  configured: boolean;
  staffDomain: string;
}

export const adminApi = {
  authConfig: () => api<AuthConfig>("/auth/config", { auth: false }),
  signIn: (credential: string) =>
    api<{ token: string; expiresAt: string; role: AdminRoleName; email: string; roleId: number }>(
      "/auth/google",
      { method: "POST", body: { credential }, auth: false },
    ),
  signOut: () => api<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: () => api<AdminSession>("/auth/me"),
  roles: () => api<{ items: AdminRoleRow[] }>("/roles"),
  grantRole: (email: string, role: AdminRoleName) => api<AdminRoleRow>("/roles", { method: "POST", body: { email, role } }),
  changeRole: (id: number, role: AdminRoleName) => api<AdminRoleRow>(`/roles/${id}`, { method: "POST", body: { role } }),
  revokeRole: (id: number) => api<AdminRoleRow>(`/roles/${id}`, { method: "DELETE" }),
  audit: (params: Record<string, string>) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "")).toString();
    return api<{ items: AuditRow[]; page: number; hasMore: boolean }>(`/audit${query ? `?${query}` : ""}`);
  },
};

export interface AdminRoleRow {
  id: number;
  email: string;
  role: AdminRoleName;
  userId: number | null;
  grantedByEmail: string | null;
  grantedAt: string;
  revokedAt: string | null;
  active: boolean;
}

export interface AuditRow {
  id: number;
  createdAt: string;
  actorEmail: string;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
  requestId: string;
  outcome: "ok" | "denied" | "error";
}
