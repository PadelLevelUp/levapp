import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { Link } from "react-router-dom";
import i18n, { AppLanguage } from "@/i18n";
import { getMe, updateMe, type MeResponse, type UpdateMePayload } from "@/api/auth";
import { useAuth } from "@/auth/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Bell,
  BellOff,
  Building2,
  Calendar,
  Palette,
  ChevronLeft, Save,
  GraduationCap,
  ShieldCheck,
  Upload,
  User,
  UserX,
} from "lucide-react";
import { CoachLevelsSection } from "@/components/settings/CoachLevelsSection";
import { SeasonsSection } from "@/components/settings/SeasonsSection";
import { EvaluationCategoriesSection } from "@/components/settings/EvaluationCategoriesSection";
import { DataImportSection } from "@/components/settings/DataImportSection";
import { ImportHistorySection } from "@/components/settings/ImportHistorySection";
import { NotificationsEngineSection } from "@/components/settings/NotificationsEngineSection";
import { ClubSection } from "@/components/settings/ClubSection";
import { AccountSection } from "@/components/settings/AccountSection";
import { BlockedUsersSection } from "@/components/settings/BlockedUsersSection";
import { StudentNotificationBlocksSection } from "@/components/settings/StudentNotificationBlocksSection";
import { TutorialsSection } from "@/components/settings/TutorialsSection";
import { AdminSection } from "@/components/settings/AdminSection";

/**
 * PAD-112 adds `myNotifications` — the STUDENT's own notification block
 * preferences. Deliberately NOT called `notifications`: that id is the coach's
 * notification-engine configuration, which PAD-103 hides from students. Two
 * different audiences, so two different ids — reusing the name would make the
 * student section inherit the coach section's visibility rules.
 */
type SettingsTab =
  | "profile"
  | "preferences"
  | "calendar"
  | "notifications"
  | "tutorials"
  | "myNotifications"
  | "import"
  | "club"
  | "account"
  | "admin";

/**
 * PAD-103: Settings is shared by both roles, but most of it is coach
 * configuration. Seasons, skill levels, evaluation categories, the notification
 * engine, data import and the club panel were all rendered unconditionally, so
 * a student who opened `/settings` (the avatar dropdown links there for
 * everyone, and the URL is directly navigable) got the coach's setup screens.
 *
 * The list lives here, once, and drives BOTH the desktop sidebar and the mobile
 * dropdown — previously two hand-maintained copies that could drift apart and
 * re-open the leak on one of them. Note this is presentation only: the real
 * boundary is `require_coach()` on the endpoints behind these panels
 * (backend `frontend_api.py`, pinned by `test_settings_role_authz.py`).
 */
/**
 * PAD-142 replaced the original `coachOnly: boolean` with an explicit audience.
 * A second `studentOnly` flag alongside `coachOnly` would have made
 * `{coachOnly: true, studentOnly: true}` representable — a tab nobody can see —
 * and left "both false" meaning "everyone" only by convention. One field with
 * three values makes every tab's audience a single, total statement.
 */
/**
 * auth.coach-approval rule 7 adds a fourth audience: `superadmin`, the LevApp
 * admin's own tools. It is orthogonal to the coach/student split — a
 * superadmin is also one of those — so it is filtered on `isSuperAdmin`, not
 * on role, and hidden for everyone else.
 */
type SettingsAudience = "everyone" | "coach" | "student" | "superadmin";

type SettingsTabDef = {
  id: SettingsTab;
  labelKey: string;
  icon: React.ReactNode;
  audience: SettingsAudience;
};

const SETTINGS_TABS: SettingsTabDef[] = [
  { id: "profile", labelKey: "settings.nav.profile", icon: <User className="w-4 h-4" />, audience: "everyone" },
  { id: "preferences", labelKey: "settings.nav.preferences", icon: <Palette className="w-4 h-4" />, audience: "everyone" },
  { id: "calendar", labelKey: "settings.nav.calendar", icon: <Calendar className="w-4 h-4" />, audience: "coach" },
  { id: "notifications", labelKey: "settings.nav.notifications", icon: <Bell className="w-4 h-4" />, audience: "coach" },
  // PAD-112 shipped this to everyone, because hiding the student's own opt-outs
  // from students would have defeated that ticket. PAD-142: "everyone" was one
  // step too wide. These are per-user preferences about receiving CLASS-VACANCY
  // INVITATIONS, and a coach never receives those — so the coach saw a tab of
  // controls that could not affect their account. Student-only, not deleted:
  // the panel is still the whole point of PAD-112 for the role that has it.
  { id: "myNotifications", labelKey: "settings.nav.myNotifications", icon: <BellOff className="w-4 h-4" />, audience: "student" },
  // PAD-196: interactive walkthroughs of the engine ("Understand invites").
  // Coach-only — settings.role-scope rule 3; settings.tutorials rule 1.
  { id: "tutorials", labelKey: "settings.nav.tutorials", icon: <GraduationCap className="w-4 h-4" />, audience: "coach" },
  { id: "import", labelKey: "settings.nav.import", icon: <Upload className="w-4 h-4" />, audience: "coach" },
  { id: "club", labelKey: "settings.nav.club", icon: <Building2 className="w-4 h-4" />, audience: "coach" },
  { id: "account", labelKey: "settings.nav.account", icon: <UserX className="w-4 h-4" />, audience: "everyone" },
  // auth.coach-approval rule 7: the LevApp admin approves self-registered coaches here.
  { id: "admin", labelKey: "settings.nav.admin", icon: <ShieldCheck className="w-4 h-4" />, audience: "superadmin" },
];

const visibleSettingsTabs = (isCoach: boolean, isSuperAdmin: boolean) =>
  SETTINGS_TABS.filter(
    (tab) =>
      tab.audience === "everyone" ||
      (tab.audience === "superadmin" && isSuperAdmin) ||
      (isCoach ? tab.audience === "coach" : tab.audience === "student"),
  );

/**
 * PAD-81: the profile fields the coach can edit about themselves. Kept as a
 * single object so the form can be hydrated wholesale from `GET /auth/me` and
 * diffed against the loaded values when saving.
 */
type ProfileForm = {
  name: string;
  abbreviation: string;
  email: string;
  phone: string;
};

const EMPTY_PROFILE: ProfileForm = { name: "", abbreviation: "", email: "", phone: "" };

function SettingsNav({
  active,
  onChange,
  items,
  // This nav renders TWICE — the desktop sidebar and the mobile section list —
  // so the test hooks must be namespaced. Two elements sharing a testid is a
  // strict-mode violation even when one of them is display:none.
  testIdPrefix = "settings-nav",
  badges = {},
}: {
  active: SettingsTab;
  onChange: (tab: SettingsTab) => void;
  items: SettingsTabDef[];
  testIdPrefix?: string;
  /** Count badge per tab id; zero or missing renders nothing. */
  badges?: Partial<Record<SettingsTab, number>>;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-1">
      {items.map((it) => (
        <button
          key={it.id}
          data-testid={`${testIdPrefix}-${it.id}`}
          onClick={() => onChange(it.id)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
            active === it.id
              ? "bg-primary/10 text-primary"
              : "hover:bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {it.icon}
          <span className="flex-1 text-left">{t(it.labelKey)}</span>
          {(badges[it.id] ?? 0) > 0 && (
            <span
              className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
              data-testid={`${testIdPrefix}-${it.id}-badge`}
            >
              {badges[it.id]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  // PAD-103: backend roles are mutually exclusive (`["coach"] if user.coach else
  // ["player"]`), so a single flag is enough to decide what this page offers.
  const { user } = useAuth();
  const isCoach = user?.roles?.includes("coach") ?? false;
  const isSuperAdmin = user?.isSuperAdmin === true;
  const tabs = visibleSettingsTabs(isCoach, isSuperAdmin);
  // Badge on the Admin entry: how many coaches are waiting (auth.coach-approval rule 7).
  const [pendingCoachCount, setPendingCoachCount] = useState<number | null>(null);
  useEffect(() => {
    if (!isSuperAdmin) return;
    let active = true;
    import("@/api/admin")
      .then((m) => m.listPendingCoaches())
      .then((rows) => {
        if (active) setPendingCoachCount(rows.length);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isSuperAdmin]);
  // Default tab stays "preferences" (unchanged): Profile is reachable from the
  // nav, and several existing flows/tests land on Preferences first.
  const [tab, setTab] = useState<SettingsTab>("preferences");
  // Mobile is a DRILL-IN, not a dropdown: the phone shows the list of sections
  // first and opens one on tap. Landing straight inside Preferences with a
  // section picker above it hid what else existed and made the page read as a
  // pile of unrelated controls.
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("pt");
  // PAD-81: the profile form is hydrated from the API. `savedProfile` keeps the
  // last server-confirmed values so we only PATCH what actually changed.
  const [profile, setProfile] = useState<ProfileForm>(EMPTY_PROFILE);
  const [savedProfile, setSavedProfile] = useState<ProfileForm>(EMPTY_PROFILE);
  const [isSaving, setIsSaving] = useState(false);
  // Set as soon as the coach edits a field, so a late `getMe()` response can
  // refresh the "what's on the server" baseline without wiping what they typed.
  const profileDirty = useRef(false);
  // PAD-57: real dark theme owned by next-themes (persists + toggles `.dark`).
  const { theme, setTheme } = useTheme();

  // PAD-103: `tab` is plain state and `isCoach` only settles once the session is
  // restored, so the selected tab can briefly be one this role may not see.
  // Deriving the rendered tab (rather than resetting state in an effect) means
  // a coach-only panel is never rendered for a student, not even for one frame.
  const activeTab: SettingsTab = tabs.some((it) => it.id === tab) ? tab : tabs[0].id;

  // Load the current user's profile + language preference on mount.
  useEffect(() => {
    let active = true;
    getMe()
      .then((me) => {
        if (!active) return;
        const lang = (me.language ?? "pt") as AppLanguage;
        setLanguage(lang);
        i18n.changeLanguage(lang);
        const loaded: ProfileForm = {
          name: me.name ?? "",
          abbreviation: me.abbreviation ?? "",
          email: me.email ?? "",
          phone: me.phone ?? "",
        };
        setSavedProfile(loaded);
        if (!profileDirty.current) setProfile(loaded);
      })
      .catch(() => {
        // ignore — keep default language
      });
    return () => {
      active = false;
    };
  }, []);

  const setProfileField = (field: keyof ProfileForm, value: string) => {
    profileDirty.current = true;
    setProfile((p) => ({ ...p, [field]: value }));
  };

  const handleSave = async () => {
    // PAD-81: send only the fields that actually changed, so saving language
    // from the Preferences tab doesn't re-submit (and re-validate) the profile.
    const payload: UpdateMePayload = { language };
    if (profile.name !== savedProfile.name) payload.name = profile.name;
    if (profile.abbreviation !== savedProfile.abbreviation)
      payload.abbreviation = profile.abbreviation;
    if (profile.email !== savedProfile.email) payload.email = profile.email;
    if (profile.phone !== savedProfile.phone) payload.phone = profile.phone;

    setIsSaving(true);
    let updated: MeResponse;
    try {
      // PAD-81: the success toast fires only once the API confirms the write —
      // it used to be shown unconditionally while nothing was ever persisted.
      updated = await updateMe(payload);
      i18n.changeLanguage(language);
    } catch (e) {
      toast({
        title: t("settings.toast.couldNotSaveTitle"),
        description: t("settings.toast.couldNotSaveDescription"),
        variant: "destructive",
      });
      return;
    } finally {
      setIsSaving(false);
    }

    // Re-hydrate from the server response so the form shows exactly what was
    // stored (trimmed name, uppercased abbreviation, derived abbreviation…).
    const confirmed: ProfileForm = {
      name: updated.name ?? "",
      abbreviation: updated.abbreviation ?? "",
      email: updated.email ?? "",
      phone: updated.phone ?? "",
    };
    setProfile(confirmed);
    setSavedProfile(confirmed);
    profileDirty.current = false;

    toast({
      title: t("settings.toast.settingsSavedTitle"),
      description: t("settings.toast.settingsSavedDescription"),
    });
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("settings.subtitle")}
            </p>
          </div>

          {/* Nothing to save while the phone is showing the section list. */}
          <Button
            onClick={handleSave}
            className={cn("gap-2", !mobileSectionOpen && "hidden lg:inline-flex")}
            disabled={isSaving}
          >
            <Save className="w-4 h-4" />
            {t("settings.saveChanges")}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left nav (desktop) */}
          <Card className="lg:col-span-3 h-fit hidden lg:block">
            <CardHeader>
              <CardTitle className="text-base">{t("settings.sections")}</CardTitle>
              <CardDescription>{t("settings.quickNavigation")}</CardDescription>
            </CardHeader>
            <CardContent>
              <SettingsNav
                active={activeTab}
                onChange={setTab}
                items={tabs}
                badges={{ admin: pendingCoachCount ?? 0 }}
              />
            </CardContent>
          </Card>

          {/* Main panel */}
          <div className="lg:col-span-9 space-y-4">
            {/* Mobile: the section list. Shown until one is opened. */}
            <div className={cn("lg:hidden", mobileSectionOpen && "hidden")}>
              <Card>
                <CardContent className="p-2">
                  <SettingsNav
                    active={activeTab}
                    items={tabs}
                    badges={{ admin: pendingCoachCount ?? 0 }}
                    testIdPrefix="settings-mobile-nav"
                    onChange={(id) => {
                      setTab(id);
                      setMobileSectionOpen(true);
                    }}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Mobile: back out of a section. */}
            {mobileSectionOpen && (
              <button
                type="button"
                onClick={() => setMobileSectionOpen(false)}
                data-testid="settings-mobile-back"
                className="lg:hidden flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-4 h-4" />
                {t("settings.sections")}
              </button>
            )}

            {/* Sections. On mobile these stay closed until one is picked. */}
            <div
              className={cn(
                "space-y-4",
                !mobileSectionOpen && "hidden lg:block"
              )}
            >
            {/* PROFILE — PAD-81: real, server-backed profile editing. */}
            {activeTab === "profile" && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.profile.title")}</CardTitle>
                  <CardDescription>{t("settings.profile.description")}</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">{t("settings.profile.name")}</Label>
                    <Input
                      id="profile-name"
                      value={profile.name}
                      onChange={(e) => setProfileField("name", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="profile-abbreviation">
                      {t("settings.profile.abbreviation")}
                    </Label>
                    <Input
                      id="profile-abbreviation"
                      maxLength={4}
                      placeholder={t("settings.profile.abbreviationPlaceholder")}
                      value={profile.abbreviation}
                      onChange={(e) => setProfileField("abbreviation", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="profile-email">{t("settings.profile.email")}</Label>
                    <Input
                      id="profile-email"
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfileField("email", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="profile-phone">{t("settings.profile.phone")}</Label>
                    <Input
                      id="profile-phone"
                      type="tel"
                      value={profile.phone}
                      onChange={(e) => setProfileField("phone", e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* PREFERENCES */}
            {activeTab === "preferences" && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.preferences.title")}</CardTitle>
                  <CardDescription>{t("settings.preferences.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="max-w-xs space-y-2">
                    <Label htmlFor="language-select">{t("settings.language")}</Label>
                    <Select
                      value={language}
                      onValueChange={(v) => {
                        const lang = v as AppLanguage;
                        setLanguage(lang);
                        i18n.changeLanguage(lang);
                      }}
                    >
                      <SelectTrigger id="language-select" aria-label={t("settings.language")}>
                        <SelectValue placeholder={t("settings.language")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pt">{t("settings.portuguese")}</SelectItem>
                        <SelectItem value="en">{t("settings.english")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="max-w-xs space-y-2">
                    <Label htmlFor="theme-select">{t("settings.preferences.theme")}</Label>
                    <Select value={theme} onValueChange={(v) => setTheme(v)}>
                      <SelectTrigger id="theme-select" aria-label={t("settings.preferences.theme")}>
                        <SelectValue placeholder={t("settings.preferences.theme")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">{t("settings.preferences.themeSystem")}</SelectItem>
                        <SelectItem value="light">{t("settings.preferences.themeLight")}</SelectItem>
                        <SelectItem value="dark">{t("settings.preferences.themeDark")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* PAD-103: language + theme are per-user and stay for both
                      roles; skill levels and evaluation categories are the
                      coach's own configuration. */}
                  {isCoach && (
                    <>
                      <Separator />

                      <CoachLevelsSection />

                      <Separator />

                      <EvaluationCategoriesSection />
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* CALENDAR */}
            {activeTab === "calendar" && <SeasonsSection />}

            {/* NOTIFICATIONS — the coach's notification-engine configuration. */}
            {activeTab === "notifications" && <NotificationsEngineSection />}

            {/* TUTORIALS — PAD-196: coach-only walkthroughs (settings.tutorials). */}
            {activeTab === "tutorials" && <TutorialsSection />}

            {/* MY NOTIFICATIONS — PAD-112: the student's own block preferences.
                Visible to both roles; only a student has any use for it, but
                nothing here is coach-hostile and the endpoint behind it
                (`PATCH /auth/me`) is per-user, not coach-scoped.
                Gated on PAD-103's `activeTab`, not the raw `tab` state — the
                rest of this switch does, and `tab` can still hold a section id
                that isn't in the current role's visible list. */}
            {activeTab === "myNotifications" && <StudentNotificationBlocksSection />}

            {/* IMPORT DATA */}
            {activeTab === "import" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="w-5 h-5" />
                    {t("settings.import.title")}
                  </CardTitle>
                  <CardDescription>
                    {t("settings.import.description")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  <DataImportSection />
                  <Separator />
                  <ImportHistorySection />
                </CardContent>
              </Card>
            )}

            {/* CLUB */}
            {activeTab === "club" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    {t("settings.club.title")}
                  </CardTitle>
                  <CardDescription>
                    {t("settings.club.description")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ClubSection />
                </CardContent>
              </Card>
            )}

            {/* ADMIN — auth.coach-approval rule 7: superadmin only. */}
            {activeTab === "admin" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5" />
                    {t("settings.admin.title")}
                  </CardTitle>
                  <CardDescription>{t("settings.admin.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <AdminSection onCountChange={setPendingCoachCount} />
                </CardContent>
              </Card>
            )}

            {/* ACCOUNT */}
            {activeTab === "account" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserX className="w-5 h-5" />
                    {t("settings.account.title")}
                  </CardTitle>
                  <CardDescription>
                    {t("settings.account.deleteAccountDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <BlockedUsersSection />
                  <Separator />
                  {!isCoach && (
                    /* players.join-token rule 8: Settings → Account is one of the
                       three ways a student reaches "Connect with a coach". */
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                      <span className="text-sm">{t("players.connect.settingsLink")}</span>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/connect" data-testid="settings-connect-coach">
                          {t("players.connect.go")}
                        </Link>
                      </Button>
                    </div>
                  )}
                  <AccountSection />
                  <Separator />
                  <p className="text-xs text-muted-foreground">
                    <Link to="/privacy" className="underline hover:text-foreground">
                      {t("auth.legal.privacyPolicy")}
                    </Link>{" "}
                    {t("auth.legal.separator")}{" "}
                    <Link to="/terms" className="underline hover:text-foreground">
                      {t("auth.legal.terms")}
                    </Link>
                  </p>
                </CardContent>
              </Card>
            )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
