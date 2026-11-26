/**
 * PAD-839: shared fixtures for the setup guide's mobile tests (`src/features/setup-guide/*.test.tsx`,
 * `src/features/availability/schedule-editor.test.tsx`). Not a test file.
 *
 * - `api`: spies for the API calls the guide makes. Each test file mocks the resource modules
 *   (`@levelup/api/src/resources/{auth,availability,dashboard}`) over `importOriginal` with these,
 *   and the REAL `@levelup/hooks` run on top (frontend/CLAUDE.md, the PAD-406 template).
 * - `authModule`: a stand-in for `@/auth/AuthContext` whose `user` is a small external store, so a
 *   `refreshUser()` after a guide write re-renders every reader with the server's answer.
 * - `mount`: renders inside a fresh `QueryClientProvider` (retry off) and lets the queries answer.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { act } from "react-test-renderer";
import { vi } from "vitest";
import { __resetReactNativeMock } from "@/test/mocks/react-native";
import { renderNative, type Native } from "@/test/render-native";

type Me = Record<string, unknown> & {
  roles: string[];
  requestAlerts: boolean;
  coaches: { id: number; name: string; level?: string | null; side?: "left" | "right" | "both" | null }[];
  setupGuide: { snoozedAt: string | null; hidden: boolean; readyClosed: boolean; alwaysAvailable: boolean; alertsConfirmed: boolean };
};

export function makeMe(over: Partial<Omit<Me, "setupGuide">> & { setupGuide?: Partial<Me["setupGuide"]> } = {}): Me {
  const { setupGuide, ...rest } = over;
  return {
    id: 1,
    name: "Rita Sousa",
    email: "rita@example.com",
    roles: ["player"],
    requestAlerts: true,
    coaches: [{ id: 7, name: "Ana", level: "B2", side: "left" }],
    ...rest,
    setupGuide: { snoozedAt: null, hidden: false, readyClosed: false, alwaysAvailable: false, alertsConfirmed: false, ...setupGuide },
  };
}

/** A recurring blocker row as `GET /availability_blockers` lists it. */
export function blockerRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 1,
    type: "unavailable",
    title: null,
    description: null,
    date: "2026-11-01",
    startTime: "09:00",
    endTime: "11:00",
    isRecurring: true,
    recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 2, 3, 4, 5] },
    recurrenceEnd: null,
    blocksAutoInvitations: true,
    scheduleId: null,
    ...over,
  };
}

/** The student dashboard payload, with or without a `profile_incomplete` block. */
export function dashboardPayload(incomplete: { coachId: number; coachName: string; missing: string[]; remindedToday?: boolean; canRemind?: boolean }[] = []) {
  return {
    id: "student-dashboard",
    blocks: incomplete.length
      ? [
          {
            id: "profile_incomplete",
            type: "profile_incomplete",
            data: { coaches: incomplete.map((c) => ({ remindedToday: false, canRemind: true, ...c })) },
          },
        ]
      : [],
  };
}

const store = { user: null as Me | null, answer: null as Me | null, listeners: new Set<() => void>() };

export function setUser(user: Me | null) {
  store.user = user;
  store.answer = null;
  store.listeners.forEach((f) => f());
}

/** What the server answers to a guide PATCH: the user with the keys applied. */
export function applyPatch(user: Me, payload: Record<string, unknown>): Me {
  const g = { ...user.setupGuide };
  if (payload.setupGuideSnooze) g.snoozedAt = new Date().toISOString();
  if ("setupGuideHidden" in payload) g.hidden = payload.setupGuideHidden === true;
  if (payload.setupGuideReadyClosed) g.readyClosed = true;
  if (payload.setupGuideAlertsConfirmed) g.alertsConfirmed = true;
  if ("alwaysAvailable" in payload) g.alwaysAvailable = payload.alwaysAvailable === true;
  const next = { ...user, setupGuide: g };
  if ("requestAlerts" in payload) next.requestAlerts = payload.requestAlerts === true;
  return next;
}

export const api = {
  updateMe: vi.fn(async (payload: Record<string, unknown>) => {
    store.answer = applyPatch(store.user!, payload);
    return store.answer;
  }),
  listBlockers: vi.fn(async (): Promise<unknown[]> => []),
  putSchedule: vi.fn(async (): Promise<unknown[]> => []),
  readScheduleCoveredClasses: vi.fn(async (): Promise<unknown[]> => []),
  declineCoveredClasses: vi.fn(async (): Promise<unknown> => ({ declined: [], skipped: [] })),
  deleteSchedule: vi.fn(async () => undefined),
  getDashboard: vi.fn(async (): Promise<unknown> => dashboardPayload()),
  sendProfileReminder: vi.fn(async () => ({ ok: true as const })),
};

/** `refreshUser()`: the session re-reads `/auth/me`, which now holds the last PATCH's answer. */
export const refreshUser = vi.fn(async () => {
  if (store.answer) {
    store.user = store.answer;
    store.listeners.forEach((f) => f());
  }
  return store.user;
});

function useAuth() {
  const user = React.useSyncExternalStore(
    (f) => {
      store.listeners.add(f);
      return () => store.listeners.delete(f);
    },
    () => store.user
  );
  return { user, refreshUser, isAuthenticated: user != null, loading: false };
}

export const authModule = { useAuth };

/** expo-notifications' permission answer, and the Messages banner's push registrar. */
export const notifications = {
  permission: { status: "undetermined", canAskAgain: true } as { status: string; canAskAgain?: boolean },
  afterRequest: { status: "granted", canAskAgain: true } as { status: string; canAskAgain?: boolean },
  getPermissionsAsync: vi.fn(async () => notifications.permission),
  requestPermissionsAsync: vi.fn(async () => (notifications.permission = notifications.afterRequest)),
};

export const registrar = {
  registerIfPermitted: vi.fn(async () => undefined),
  status: () => "unknown",
  onStatusChange: () => () => undefined,
};

export const nav = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
};

const mounted: Native[] = [];

/** Reset every spy and fixture to its default before a test, and unmount the last test's trees. */
export async function resetGuideFixtures() {
  for (const n of mounted.splice(0)) await act(async () => n.root.unmount());
  __resetReactNativeMock();
  for (const f of Object.values(api)) f.mockClear();
  api.updateMe.mockImplementation(async (payload: Record<string, unknown>) => {
    store.answer = applyPatch(store.user!, payload);
    return store.answer;
  });
  api.listBlockers.mockImplementation(async () => []);
  api.putSchedule.mockImplementation(async () => []);
  api.readScheduleCoveredClasses.mockImplementation(async () => []);
  api.declineCoveredClasses.mockImplementation(async () => ({ declined: [], skipped: [] }));
  api.getDashboard.mockImplementation(async () => dashboardPayload());
  api.sendProfileReminder.mockImplementation(async () => ({ ok: true as const }));
  refreshUser.mockClear();
  notifications.permission = { status: "undetermined", canAskAgain: true };
  notifications.afterRequest = { status: "granted", canAskAgain: true };
  notifications.getPermissionsAsync.mockClear();
  notifications.requestPermissionsAsync.mockClear();
  registrar.registerIfPermitted.mockClear();
  for (const f of Object.values(nav)) f.mockClear();
  nav.canGoBack.mockImplementation(() => true);
  setUser(makeMe());
}

export type Mounted = Native & { client: QueryClient };

/** Render inside a fresh query client and let the mocked requests answer. */
export async function mount(el: React.ReactElement): Promise<Mounted> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const n = await renderNative(<QueryClientProvider client={client}>{el}</QueryClientProvider>);
  mounted.push(n);
  await n.flush();
  await n.flush();
  return Object.assign(n, { client });
}

/** Every string a node renders, joined (Text children nest). */
export function textOf(node: { children?: unknown[] } | null): string {
  if (!node) return "";
  return (node.children ?? []).map((c) => (typeof c === "string" ? c : textOf(c as { children?: unknown[] }))).join("");
}

export async function settle(n: Native) {
  await n.flush();
  await n.flush();
  await act(async () => undefined);
}
