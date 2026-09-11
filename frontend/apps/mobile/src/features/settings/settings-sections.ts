import type { Ionicons } from "@expo/vector-icons";

/**
 * The Settings drill-in's section registry, mirroring web's `SettingsTab`
 * union in apps/web/src/pages/SettingsPage.tsx.
 *
 * Web learned this the hard way (see the plan): Seasons, the auto-invite
 * engine, data import and club management are all coach tools that the
 * backend 403s for a player. Offering them in the nav and then rendering an
 * empty pane is worse than not offering them at all — so the SAME list gates
 * the nav and the pane, derived once (see `visibleSections`).
 *
 * PAD-169 adds `myNotifications` — the STUDENT's own notification block
 * preferences (PAD-112). Deliberately NOT called `notifications`: that id is
 * the coach's notification-engine configuration, which a student never sees.
 * Two different audiences, so two different ids — reusing the name would make
 * the student section inherit the coach section's visibility rules
 * (settings.role-scope rule 2).
 */
export type SettingsSectionId =
  | "profile"
  | "preferences"
  | "calendar"
  | "notifications"
  | "classRequests"
  | "myNotifications"
  | "tutorials"
  | "import"
  | "club"
  | "connections"
  | "account"
  | "admin";

/**
 * PAD-169 replaced the original `COACH_ONLY_SECTIONS` list with an explicit
 * per-section audience, exactly as web did in PAD-142 (it replaced a
 * `coachOnly: boolean` there). A second `studentOnly` flag alongside the
 * coach-only list would have made "coach-only AND student-only" representable
 * — a section nobody can see — and left "in neither list" meaning "everyone"
 * only by convention. One field with three values makes every section's
 * audience a single, total statement.
 */
export type SettingsAudience = "everyone" | "coach" | "student" | "superadmin";

export interface SettingsSectionDef {
  id: SettingsSectionId;
  /** i18n key for the row label — the same keys web's nav uses. */
  labelKey: string;
  /** i18n key for the one-line row subtitle. */
  descriptionKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Who may see this section. Every section states it; there is no default. */
  audience: SettingsAudience;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionDef[] = [
  {
    id: "profile",
    labelKey: "settings.nav.profile",
    descriptionKey: "settings.profile.description",
    icon: "person-outline",
    audience: "everyone",
  },
  {
    id: "preferences",
    labelKey: "settings.nav.preferences",
    descriptionKey: "settings.preferences.description",
    icon: "color-palette-outline",
    audience: "everyone",
  },
  {
    id: "calendar",
    labelKey: "settings.nav.calendar",
    descriptionKey: "settings.seasons.description",
    icon: "calendar-outline",
    audience: "coach",
  },
  {
    id: "notifications",
    labelKey: "settings.nav.notifications",
    descriptionKey: "settings.engine.description",
    icon: "notifications-outline",
    audience: "coach",
  },
  {
    // PAD-112 / PAD-169: the student's own opt-outs from class-vacancy
    // invitations. Student-only, matching web after PAD-142 — these are
    // preferences about RECEIVING invitations, and a coach never receives
    // one, so the coach would be looking at controls that cannot affect
    // their account.
    id: "myNotifications",
    labelKey: "settings.nav.myNotifications",
    descriptionKey: "settings.mobile.myNotificationsNavDescription",
    icon: "notifications-off-outline",
    audience: "student",
  },
  {
    // PAD-104: the coach's inbox of students' class requests. Web puts it in
    // the sidebar; the phone tab bar is full, so it lives here.
    id: "classRequests",
    labelKey: "settings.nav.classRequests",
    descriptionKey: "settings.mobile.classRequestsNavDescription",
    icon: "calendar-outline",
    audience: "coach",
  },
  {
    // PAD-196: interactive walkthroughs (settings.tutorials rule 1), right
    // after Notifications on both shells.
    id: "tutorials",
    labelKey: "settings.nav.tutorials",
    descriptionKey: "tutorials.description",
    icon: "school-outline",
    audience: "coach",
  },
  {
    id: "import",
    labelKey: "settings.nav.import",
    // NOT settings.import.description — that promises "upload a file", which
    // this pane cannot do (see import-section.tsx).
    descriptionKey: "settings.mobile.importNavDescription",
    icon: "cloud-upload-outline",
    audience: "coach",
  },
  {
    id: "club",
    labelKey: "settings.nav.club",
    descriptionKey: "settings.club.description",
    icon: "business-outline",
    audience: "coach",
  },
  {
    // PAD-287 (settings.role-scope rule 2): the connection actions that used
    // to sit under Account — the student's coach link and claim requests, the
    // coach's invite-by-link/QR entry, and Blocked users for both.
    id: "connections",
    labelKey: "settings.nav.connections",
    descriptionKey: "settings.mobile.connectionsNavDescription",
    icon: "link-outline",
    audience: "everyone",
  },
  {
    id: "account",
    labelKey: "settings.nav.account",
    descriptionKey: "settings.account.deleteAccountDescription",
    icon: "person-remove-outline",
    audience: "everyone",
  },
  {
    // auth.coach-approval rule 7: the LevApp admin approves self-registered
    // coaches. `superadmin` is orthogonal to coach/student — it is filtered
    // on `isSuperAdmin`, never on role — and hidden for everyone else.
    id: "admin",
    labelKey: "settings.nav.admin",
    descriptionKey: "settings.mobile.adminNavDescription",
    icon: "shield-checkmark-outline",
    audience: "superadmin",
  },
];

/**
 * The sections a given role may see. Single source of truth: the screen uses
 * it to build the nav AND to resolve the open section, so a player can never
 * end up inside a coach pane — not even in the window between the cached
 * `user` and a late `/auth/me` resolving.
 *
 * `isCoach` is the only role signal this app has, so the two audiences are
 * exhaustive: a caller is either a coach or a student.
 */
export function visibleSections(
  isCoach: boolean,
  isSuperAdmin = false,
): readonly SettingsSectionDef[] {
  return SETTINGS_SECTIONS.filter(
    (s) =>
      s.audience === "everyone" ||
      (s.audience === "superadmin" && isSuperAdmin) ||
      (isCoach ? s.audience === "coach" : s.audience === "student"),
  );
}
