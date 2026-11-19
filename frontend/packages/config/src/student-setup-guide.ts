/**
 * PAD-839 (dashboard.student-setup-guide rules 1–4, 3a, 7): the student setup guide, worked out on
 * the client from data both shells already fetch. One pure function; neither shell re-derives any
 * part of it.
 */
import { clubDateOfInstant, clubTodayISO } from "./club-date";

/** `const:SETUP_GUIDE_STEPS` — the order the guide shows and walks them. */
export const SETUP_GUIDE_STEPS = [
  "request_alerts",
  "device_push",
  "unavailability",
  "coach_link",
  "profile",
] as const;
export type SetupGuideStep = (typeof SETUP_GUIDE_STEPS)[number];

/** `const:SETUP_GUIDE_STEP_WEIGHT` — percent per finished step. */
export const SETUP_GUIDE_STEP_WEIGHT = 20;
/** `const:SETUP_GUIDE_SNOOZE_CLUB_DAYS` — Lisbon days after the dismissal's day the sheet stays shut. */
export const SETUP_GUIDE_SNOOZE_CLUB_DAYS = 1;

/** Rule 3a: a step is `unknown` until every source it reads has answered. */
export type SetupStepState = "done" | "pending" | "unknown";

/** Rule 7: what step 2 shows on this device. Only `done` counts as done. */
export type DeviceStepState = "ask" | "open_settings" | "padlock" | "done" | "unsupported" | "ios_browser";

/**
 * `native` = the iOS/Android app; `web` = a browser with the Push API question; `web_ios_browser` =
 * Safari (or any browser) on an iPhone/iPad outside an installed web app, which has no push at all.
 */
export type DevicePlatform = "ios" | "android" | "web" | "web_ios_browser";

/**
 * The device's permission as each shell reads it: Expo's `granted | denied | undetermined`, the
 * browser's `granted | denied | default`, or `unsupported` when the browser has no Push API.
 */
export type DevicePermission = "granted" | "denied" | "undetermined" | "default" | "unsupported";

/** Rule 7: one state per platform and permission. */
export function deviceStepState(
  platform: DevicePlatform,
  permission: DevicePermission,
  subscribed = false
): DeviceStepState {
  if (platform === "web_ios_browser") return "ios_browser";
  if (platform === "ios" || platform === "android") {
    if (permission === "granted") return "done";
    if (permission === "denied") return "open_settings";
    return "ask";
  }
  if (permission === "unsupported") return "unsupported";
  if (permission === "denied") return "padlock";
  if (permission === "granted" && subscribed) return "done";
  return "ask";
}

/** The parts of `/auth/me` the guide reads. */
export interface SetupGuideMe {
  roles?: string[];
  requestAlerts?: boolean;
  coaches?: { id: number }[];
  setupGuide?: {
    snoozedAt: string | null;
    hidden: boolean;
    readyClosed: boolean;
    alwaysAvailable: boolean;
    alertsConfirmed: boolean;
  };
}

/** The parts of an availability blocker the guide reads. */
export interface SetupGuideBlocker {
  date: string | null;
  isRecurring: boolean;
  recurrenceEnd: string | null;
}

export interface SetupGuideInput {
  /** `undefined` while `/auth/me` loads (or failed). */
  me: SetupGuideMe | undefined;
  /** `undefined` while the blockers list loads (or failed). */
  blockers: SetupGuideBlocker[] | undefined;
  /**
   * The dashboard's `profile_incomplete` block: `undefined` while the dashboard loads (or failed),
   * `null` when the loaded dashboard has none.
   */
  profileIncomplete: { coaches: unknown[] } | null | undefined;
  /** `undefined` while this device's permission is being read. */
  device: DeviceStepState | undefined;
  now?: Date;
}

export interface SetupGuideView {
  steps: Record<SetupGuideStep, SetupStepState>;
  /** True when no step is `unknown` (rule 3a). */
  known: boolean;
  doneCount: number;
  /** `null` while anything is unknown: the bar is a skeleton with no number. */
  percent: number | null;
  /** The first pending step in order, or null. */
  next: SetupGuideStep | null;
  /** The account is a student's (the guide never shows to a coach). */
  student: boolean;
  showSheet: boolean;
  showCard: boolean;
  showRing: boolean;
  showReady: boolean;
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Rule 3.3: a one-off dated today or later, or a recurring block whose end is today or later (or none). */
export function blockerIsCurrent(b: SetupGuideBlocker, todayISO: string): boolean {
  if (b.isRecurring) return b.recurrenceEnd == null || b.recurrenceEnd >= todayISO;
  return b.date != null && b.date >= todayISO;
}

/**
 * Rule 4: the sheet is snoozed while the Lisbon date of now is not past the Lisbon date of the
 * dismissal by `SETUP_GUIDE_SNOOZE_CLUB_DAYS`. Never a UTC midnight.
 */
export function sheetIsSnoozed(snoozedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!snoozedAt) return false;
  const opens = addDaysISO(clubDateOfInstant(snoozedAt), SETUP_GUIDE_SNOOZE_CLUB_DAYS);
  return clubTodayISO(now) < opens;
}

export function setupGuideState(input: SetupGuideInput): SetupGuideView {
  const { me, blockers, profileIncomplete, device } = input;
  const now = input.now ?? new Date();
  const today = clubTodayISO(now);
  const guide = me?.setupGuide;
  const student = me != null && !(me.roles ?? []).includes("coach");
  const coachCount = me?.coaches?.length ?? 0;

  const of = (known: boolean, done: boolean): SetupStepState => (!known ? "unknown" : done ? "done" : "pending");
  const steps: Record<SetupGuideStep, SetupStepState> = {
    request_alerts: of(me != null, me?.requestAlerts === true && guide?.alertsConfirmed === true),
    device_push: of(device !== undefined, device === "done"),
    unavailability: of(
      me != null && (guide?.alwaysAvailable === true || blockers !== undefined),
      guide?.alwaysAvailable === true || (blockers ?? []).some((b) => blockerIsCurrent(b, today))
    ),
    coach_link: of(me != null, coachCount > 0),
    profile:
      me == null
        ? "unknown"
        : coachCount === 0
          ? "pending"
          : profileIncomplete === undefined
            ? "unknown"
            : profileIncomplete === null || profileIncomplete.coaches.length === 0
              ? "done"
              : "pending",
  };

  const known = SETUP_GUIDE_STEPS.every((s) => steps[s] !== "unknown");
  const doneCount = SETUP_GUIDE_STEPS.filter((s) => steps[s] === "done").length;
  const percent = known ? doneCount * SETUP_GUIDE_STEP_WEIGHT : null;
  const next = SETUP_GUIDE_STEPS.find((s) => steps[s] === "pending") ?? null;

  const hidden = guide?.hidden === true;
  const readyClosed = guide?.readyClosed === true;
  const open = student && !hidden && !readyClosed;
  // Rule 3a: while a step is unknown the card and the ring show a skeleton (percent null); the sheet
  // never opens and "Conta pronta" never shows until everything is known.
  const showCard = open && (percent === null || percent < 100);
  return {
    steps,
    known,
    doneCount,
    percent,
    next,
    student,
    showCard,
    showRing: showCard,
    showSheet: showCard && known && !sheetIsSnoozed(guide?.snoozedAt, now),
    showReady: open && known && percent === 100,
  };
}

/** Rule 5: the next pending step after `current`, in order; null past the last one. */
export function nextPendingStepAfter(view: SetupGuideView, current: SetupGuideStep): SetupGuideStep | null {
  const from = SETUP_GUIDE_STEPS.indexOf(current) + 1;
  return SETUP_GUIDE_STEPS.slice(from).find((s) => view.steps[s] === "pending") ?? null;
}
