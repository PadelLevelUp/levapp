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
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
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
  // admin.engine-health (PAD-534): read-only.
  engineHealth: () => api<EngineHealth>("/engine-health"),
  engineHealthCoaches: (q: string) =>
    api<{ coaches: { coachId: number; name: string }[] }>(`/engine-health/coaches?q=${encodeURIComponent(q)}`),
  engineHealthCoach: (coachId: number) => api<CoachEngine>(`/engine-health/coaches/${coachId}`),
  // ── clubs and switches (PAD-533, admin.clubs-and-switches rules 1–3, 5, 6) ──
  clubs: (q: string, page = 1) =>
    api<{ items: ClubRow[]; page: number; hasMore: boolean }>(`/clubs?${new URLSearchParams({ q, page: String(page) }).toString()}`),
  club: (id: number) => api<ClubDetail>(`/clubs/${id}`),
  editClub: (id: number, body: Partial<Pick<ClubRow, "name" | "description" | "location">>) =>
    api<ClubDetail>(`/clubs/${id}`, { method: "PATCH", body }),
  addCourt: (clubId: number, name: string) => api<CourtRow>(`/clubs/${clubId}/courts`, { method: "POST", body: { name } }),
  renameCourt: (id: number, name: string) => api<CourtRow>(`/courts/${id}`, { method: "PATCH", body: { name } }),
  deleteCourt: (id: number) => api<{ deleted: boolean }>(`/courts/${id}`, { method: "DELETE" }),
  reorderCourts: (clubId: number, ids: number[]) => api<CourtRow[]>(`/clubs/${clubId}/courts/order`, { method: "PUT", body: { ids } }),
  linkCoach: (clubId: number, coachId: number) =>
    api<{ linked: boolean; changed: boolean }>(`/clubs/${clubId}/coaches`, { method: "POST", body: { coachId } }),
  unlinkCoach: (clubId: number, coachId: number) =>
    api<{ unlinked: boolean; warning?: "COACH_HAS_NO_CLUB" }>(`/clubs/${clubId}/coaches/${coachId}`, { method: "DELETE" }),
  capabilities: () => api<{ items: CapabilityRow[] }>("/settings/capabilities"),
  setCapability: (capability: string, off: boolean, reason: string | null) =>
    api<{ items: CapabilityRow[] }>(`/settings/capabilities/${capability}`, { method: "PUT", body: { off, reason } }),
};

export type DeployIdentity = { gitSha: string; alembicHead: string | null };
export type IncidentKind = "email_failed" | "push_failed" | "reminder_skipped_past_due";

export interface EngineHealth {
  computedAt: string;
  vacancies: {
    open: number;
    byRoundAndBatch: { round: number; batch: number; count: number }[];
    pendingApproval: number;
    oldestOpenAgeSeconds: number | null;
  };
  invitations: { live: number; byRound: { round: number | null; count: number }[] };
  scheduler:
    | { available: false }
    | { available: true; total: number; byFamily: Record<string, number>; overdue: number; singletons: Record<string, boolean> };
  incidents: {
    last24h: Record<IncidentKind, number>;
    last7d: Record<IncidentKind, number>;
    recent: { id: number; createdAt: string; kind: IncidentKind; channel: string; userId: number | null; subjectType: string | null; subjectId: number | null; errorClass: string | null; detail: string | null }[];
  };
  accounts: { users: Record<string, number>; coaches: Record<string, number>; players: number; createdLast7d: number };
  deploy: { this: DeployIdentity; other: DeployIdentity | string };
}

export interface CoachEngine {
  coachId: number;
  name: string;
  settings: Record<string, unknown> & { autoNotifyEnabled: boolean; invitationMode: string };
  openVacancies: number;
  liveInvitations: number;
  scheduledJobs: { id: string; nextRunTime: string | null }[];
}

export interface ClubRow {
  id: number;
  name: string;
  description: string | null;
  location: string | null;
  coaches: number;
  players: number;
  courts: number;
  lessons: number;
}

export interface CourtRow {
  id: number;
  name: string;
  position: number;
}

export interface ClubDetail extends ClubRow {
  courtsList: CourtRow[];
  coachesList: { coachId: number; name: string | null; email: string | null; linkedAt: string | null }[];
}

export interface CapabilityRow {
  capability: string;
  kind: "feature" | "compat";
  off: boolean;
  reason: string | null;
  changedAt: string | null;
  changedBy: string | null;
}

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
