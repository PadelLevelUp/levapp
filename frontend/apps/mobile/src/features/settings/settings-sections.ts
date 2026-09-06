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
 */
export type SettingsSectionId =
  | "profile"
  | "preferences"
  | "calendar"
  | "notifications"
  | "tutorials"
  | "import"
  | "club"
  | "account";

/** Sections whose every API call is coach-only server-side. */
export const COACH_ONLY_SECTIONS: readonly SettingsSectionId[] = [
  "calendar",
  "notifications",
  "tutorials",
  "import",
  "club",
];

export interface SettingsSectionDef {
  id: SettingsSectionId;
  /** i18n key for the row label — the same keys web's nav uses. */
  labelKey: string;
  /** i18n key for the one-line row subtitle. */
  descriptionKey: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionDef[] = [
  {
    id: "profile",
    labelKey: "settings.nav.profile",
    descriptionKey: "settings.profile.description",
    icon: "person-outline",
  },
  {
    id: "preferences",
    labelKey: "settings.nav.preferences",
    descriptionKey: "settings.preferences.description",
    icon: "color-palette-outline",
  },
  {
    id: "calendar",
    labelKey: "settings.nav.calendar",
    descriptionKey: "settings.seasons.description",
    icon: "calendar-outline",
  },
  {
    id: "notifications",
    labelKey: "settings.nav.notifications",
    descriptionKey: "settings.engine.description",
    icon: "notifications-outline",
  },
  {
    // PAD-196: interactive walkthroughs (settings.tutorials rule 1), right
    // after Notifications on both shells.
    id: "tutorials",
    labelKey: "settings.nav.tutorials",
    descriptionKey: "tutorials.description",
    icon: "school-outline",
  },
  {
    id: "import",
    labelKey: "settings.nav.import",
    // NOT settings.import.description — that promises "upload a file", which
    // this pane cannot do (see import-section.tsx).
    descriptionKey: "settings.mobile.importNavDescription",
    icon: "cloud-upload-outline",
  },
  {
    id: "club",
    labelKey: "settings.nav.club",
    descriptionKey: "settings.club.description",
    icon: "business-outline",
  },
  {
    id: "account",
    labelKey: "settings.nav.account",
    descriptionKey: "settings.account.deleteAccountDescription",
    icon: "person-remove-outline",
  },
];

/**
 * The sections a given role may see. Single source of truth: the screen uses
 * it to build the nav AND to resolve the open section, so a player can never
 * end up inside a coach pane — not even in the window between the cached
 * `user` and a late `/auth/me` resolving.
 */
export function visibleSections(isCoach: boolean): readonly SettingsSectionDef[] {
  return isCoach
    ? SETTINGS_SECTIONS
    : SETTINGS_SECTIONS.filter((s) => !COACH_ONLY_SECTIONS.includes(s.id));
}
