import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n, { AppLanguage } from "@/i18n";
import { getMe, updateMe } from "@/api/auth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Bell,
  Building2,
  Calendar,
  CreditCard,
  Shield,
  User,
  Palette,
  Save,
  LogOut,
  KeyRound,
  Upload,
  Trash2,
} from "lucide-react";
import { CoachLevelsSection } from "@/components/settings/CoachLevelsSection";
import { SeasonsSection } from "@/components/settings/SeasonsSection";
import { EvaluationCategoriesSection } from "@/components/settings/EvaluationCategoriesSection";
import { DataImportSection } from "@/components/settings/DataImportSection";
import { ImportHistorySection } from "@/components/settings/ImportHistorySection";
import { NotificationsEngineSection } from "@/components/settings/NotificationsEngineSection";
import { ClubSection } from "@/components/settings/ClubSection";

type WeekStart = "monday" | "sunday";
type TimeFormat = "24h" | "12h";
type ThemePref = "system" | "light" | "dark";
type SettingsTab = "profile" | "preferences" | "calendar" | "notifications" | "billing" | "security" | "import" | "club";

interface CoachSettings {
  // Profile
  name: string;
  email: string;
  phone?: string;
  abbreviation?: string;
  bio?: string;
  avatarUrl?: string;

  // Preferences
  theme: ThemePref;
  timeFormat: TimeFormat;
  weekStart: WeekStart;
  language: AppLanguage;

  // Calendar defaults
  defaultClassDurationMin: number;
  defaultMaxPlayers: number;
  defaultClassType: "academy" | "private";
  autoFillColor: boolean;

  // Notifications
  notifyUpcomingClass: boolean;
  notifyMissingPlayers: boolean;
  notifyValidationReminders: boolean;
  notifyEmail: boolean;

  // Analytics / misc
  allowAnalytics: boolean;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function SettingsNav({
  active,
  onChange,
}: {
  active: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}) {
  const { t } = useTranslation();
  const items: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: t("settings.nav.profile"), icon: <User className="w-4 h-4" /> },
    { id: "preferences", label: t("settings.nav.preferences"), icon: <Palette className="w-4 h-4" /> },
    { id: "calendar", label: t("settings.nav.calendar"), icon: <Calendar className="w-4 h-4" /> },
    { id: "notifications", label: t("settings.nav.notifications"), icon: <Bell className="w-4 h-4" /> },
    { id: "billing", label: t("settings.nav.billing"), icon: <CreditCard className="w-4 h-4" /> },
    { id: "security", label: t("settings.nav.security"), icon: <Shield className="w-4 h-4" /> },
    { id: "import", label: t("settings.nav.import"), icon: <Upload className="w-4 h-4" /> },
    { id: "club", label: t("settings.nav.club"), icon: <Building2 className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-1">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
            active === it.id
              ? "bg-primary/10 text-primary"
              : "hover:bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {it.icon}
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

function isValidImageFile(file: File) {
  return file.type.startsWith("image/");
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [tab, setTab] = useState<SettingsTab>("profile");

  // In real life you load from API
  const [settings, setSettings] = useState<CoachSettings>({
    name: "Coach Name",
    email: "coach@email.com",
    phone: "",
    abbreviation: "CN",
    bio: "",
    avatarUrl: "",

    theme: "system",
    timeFormat: "24h",
    weekStart: "monday",
    language: "pt",

    defaultClassDurationMin: 90,
    defaultMaxPlayers: 4,
    defaultClassType: "academy",
    autoFillColor: true,

    notifyUpcomingClass: true,
    notifyMissingPlayers: true,
    notifyValidationReminders: true,
    notifyEmail: true,

    allowAnalytics: true,
  });

  /**
   * Avatar state:
   * - avatarFile: what user picked
   * - avatarPreviewUrl: local blob url for immediate preview
   */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarFile) return;
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  // Load the current user's language preference on mount.
  useEffect(() => {
    let active = true;
    getMe()
      .then((me) => {
        if (!active) return;
        const lang = (me.language ?? "pt") as AppLanguage;
        setSettings((s) => ({ ...s, language: lang }));
        i18n.changeLanguage(lang);
      })
      .catch(() => {
        // ignore — keep default language
      });
    return () => {
      active = false;
    };
  }, []);

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const canSubmitPassword = useMemo(() => {
    if (!currentPassword || !newPassword || !confirmPassword) return false;
    if (newPassword !== confirmPassword) return false;
    if (newPassword.length < 8) return false;
    return true;
  }, [currentPassword, newPassword, confirmPassword]);

  // ---- Actions you’ll wire to backend/auth later ----

  const handleSave = async () => {
    // 1) Save settings (API call later)
    // 2) If avatarFile exists, upload it and store returned URL
    // Example pseudo:
    // const avatarUrl = avatarFile ? await api.uploadAvatar(avatarFile) : settings.avatarUrl;
    // await api.updateSettings({...settings, avatarUrl});

    try {
      await updateMe({ language: settings.language });
      i18n.changeLanguage(settings.language);
    } catch (e) {
      toast({ title: t("settings.toast.couldNotSaveTitle"), description: t("settings.toast.couldNotSaveDescription") });
      return;
    }

    toast({
      title: t("settings.toast.settingsSavedTitle"),
      description: avatarFile
        ? t("settings.toast.settingsSavedWithAvatar")
        : t("settings.toast.settingsSavedDescription"),
    });

    // If you want to “commit” the avatar preview as if uploaded (mock behavior)
    if (avatarPreviewUrl) {
      setSettings((s) => ({ ...s, avatarUrl: avatarPreviewUrl }));
      setAvatarFile(null);
      setAvatarPreviewUrl(null);
    }
  };

  const handlePickAvatar = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarSelected = (file: File | null) => {
    if (!file) return;
    if (!isValidImageFile(file)) {
      toast({ title: t("settings.toast.invalidFileTitle"), description: t("settings.toast.invalidFileDescription") });
      return;
    }
    // Optional: size limit (e.g., 5MB)
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast({ title: t("settings.toast.fileTooLargeTitle"), description: t("settings.toast.fileTooLargeDescription") });
      return;
    }
    setAvatarFile(file);
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreviewUrl(null);
    setSettings((s) => ({ ...s, avatarUrl: "" })); // mock removal
    toast({ title: t("settings.toast.avatarRemovedTitle") });
  };

  const handleChangePassword = async () => {
    // Never change passwords purely client-side.
    // This should call your auth backend: api.changePassword(currentPassword, newPassword)
    setPwLoading(true);
    try {
      // mock success
      await new Promise((r) => setTimeout(r, 400));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: t("settings.toast.passwordUpdatedTitle"), description: t("settings.toast.passwordUpdatedDescription") });
    } catch {
      toast({ title: t("settings.toast.passwordUpdateFailedTitle"), description: t("settings.toast.passwordUpdateFailedDescription"), });
    } finally {
      setPwLoading(false);
    }
  };

  const handleLogout = async () => {
    // Wire this to your auth system:
    // - NextAuth: signOut()
    // - Firebase: auth.signOut()
    // - Custom: clear tokens + navigate to /login
    toast({ title: t("settings.toast.loggedOutTitle"), description: t("settings.toast.loggedOutDescription") });
  };

  const avatarSrc = avatarPreviewUrl || settings.avatarUrl || undefined;

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

          <Button onClick={handleSave} className="gap-2">
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
              <SettingsNav active={tab} onChange={setTab} />
            </CardContent>
          </Card>

          {/* Main panel */}
          <div className="lg:col-span-9 space-y-4">
            {/* Mobile: dropdown */}
            <div className="lg:hidden">
              <Select value={tab} onValueChange={(v) => setTab(v as SettingsTab)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("settings.selectSection")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="profile">{t("settings.nav.profile")}</SelectItem>
                  <SelectItem value="preferences">{t("settings.nav.preferences")}</SelectItem>
                  <SelectItem value="calendar">{t("settings.nav.calendar")}</SelectItem>
                  <SelectItem value="notifications">{t("settings.nav.notifications")}</SelectItem>
                  <SelectItem value="billing">{t("settings.nav.billing")}</SelectItem>
                  <SelectItem value="security">{t("settings.nav.security")}</SelectItem>
                  <SelectItem value="import">{t("settings.nav.import")}</SelectItem>
                  <SelectItem value="club">{t("settings.nav.club")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* PROFILE */}
            {tab === "profile" && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.profile.title")}</CardTitle>
                  <CardDescription>{t("settings.profile.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Avatar section */}
                  <div className="flex items-center gap-4">
                    <Avatar className="w-16 h-16">
                      <AvatarImage src={avatarSrc} alt={settings.name} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(settings.name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                      <p className="font-medium">{settings.name}</p>
                      <p className="text-sm text-muted-foreground">{settings.email}</p>
                      {avatarFile && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("settings.profile.selected", { name: avatarFile.name })}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleAvatarSelected(e.target.files?.[0] ?? null)}
                      />
                      <Button variant="outline" onClick={handlePickAvatar} className="gap-2">
                        <Upload className="w-4 h-4" />
                        {t("settings.profile.upload")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleRemoveAvatar}
                        className="gap-2"
                        disabled={!settings.avatarUrl && !avatarPreviewUrl}
                      >
                        <Trash2 className="w-4 h-4" />
                        {t("settings.profile.remove")}
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">{t("settings.profile.name")}</Label>
                      <Input
                        id="name"
                        value={settings.name}
                        onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="abbr">{t("settings.profile.abbreviation")}</Label>
                      <Input
                        id="abbr"
                        placeholder={t("settings.profile.abbreviationPlaceholder")}
                        value={settings.abbreviation ?? ""}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, abbreviation: e.target.value }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">{t("settings.profile.email")}</Label>
                      <Input
                        id="email"
                        value={settings.email}
                        onChange={(e) => setSettings((s) => ({ ...s, email: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">{t("settings.profile.phone")}</Label>
                      <Input
                        id="phone"
                        value={settings.phone ?? ""}
                        onChange={(e) => setSettings((s) => ({ ...s, phone: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio">{t("settings.profile.bio")}</Label>
                    <Textarea
                      id="bio"
                      placeholder={t("settings.profile.bioPlaceholder")}
                      value={settings.bio ?? ""}
                      onChange={(e) => setSettings((s) => ({ ...s, bio: e.target.value }))}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* PREFERENCES */}
            {tab === "preferences" && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.preferences.title")}</CardTitle>
                  <CardDescription>{t("settings.preferences.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>{t("settings.preferences.theme")}</Label>
                      <Select
                        value={settings.theme}
                        onValueChange={(v) =>
                          setSettings((s) => ({ ...s, theme: v as ThemePref }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("settings.preferences.theme")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="system">{t("settings.preferences.themeSystem")}</SelectItem>
                          <SelectItem value="light">{t("settings.preferences.themeLight")}</SelectItem>
                          <SelectItem value="dark">{t("settings.preferences.themeDark")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>{t("settings.preferences.timeFormat")}</Label>
                      <Select
                        value={settings.timeFormat}
                        onValueChange={(v) =>
                          setSettings((s) => ({ ...s, timeFormat: v as TimeFormat }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("settings.preferences.timeFormat")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="24h">24h</SelectItem>
                          <SelectItem value="12h">12h</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>{t("settings.preferences.weekStartsOn")}</Label>
                      <Select
                        value={settings.weekStart}
                        onValueChange={(v) =>
                          setSettings((s) => ({ ...s, weekStart: v as WeekStart }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("settings.preferences.weekStartsOn")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monday">{t("settings.preferences.monday")}</SelectItem>
                          <SelectItem value="sunday">{t("settings.preferences.sunday")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="language-select">{t("settings.language")}</Label>
                      <Select
                        value={settings.language}
                        onValueChange={(v) => {
                          const lang = v as AppLanguage;
                          setSettings((s) => ({ ...s, language: lang }));
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
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{t("settings.preferences.enableAnalytics")}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.preferences.enableAnalyticsDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.allowAnalytics}
                      onCheckedChange={(v) => setSettings((s) => ({ ...s, allowAnalytics: v }))}
                    />
                  </div>

                  <Separator />

                  <CoachLevelsSection />

                  <Separator />

                  <EvaluationCategoriesSection />
                </CardContent>
              </Card>
            )}

            {/* CALENDAR */}
            {tab === "calendar" && (
              <>
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.calendar.title")}</CardTitle>
                  <CardDescription>{t("settings.calendar.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("settings.calendar.defaultClassType")}</Label>
                      <Select
                        value={settings.defaultClassType}
                        onValueChange={(v) =>
                          setSettings((s) => ({
                            ...s,
                            defaultClassType: v as "academy" | "private",
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("settings.calendar.classTypePlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="academy">{t("settings.calendar.academy")}</SelectItem>
                          <SelectItem value="private">{t("settings.calendar.private")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>{t("settings.calendar.defaultDuration")}</Label>
                      <Input
                        type="number"
                        min={30}
                        step={15}
                        value={settings.defaultClassDurationMin}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            defaultClassDurationMin: Number(e.target.value || 0),
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{t("settings.calendar.defaultMaxPlayers")}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={settings.defaultMaxPlayers}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            defaultMaxPlayers: Number(e.target.value || 0),
                          }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{t("settings.calendar.autoPickColor")}</p>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.calendar.autoPickColorDescription")}
                        </p>
                      </div>
                      <Switch
                        checked={settings.autoFillColor}
                        onCheckedChange={(v) => setSettings((s) => ({ ...s, autoFillColor: v }))}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                    {t("settings.calendar.tip")}
                  </div>
                </CardContent>
              </Card>

              <Separator />

              <SeasonsSection />
              </>
            )}

            {/* NOTIFICATIONS */}
            {tab === "notifications" && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.notifications.title")}</CardTitle>
                  <CardDescription>{t("settings.notifications.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{t("settings.notifications.upcomingClass")}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.notifications.upcomingClassDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.notifyUpcomingClass}
                      onCheckedChange={(v) =>
                        setSettings((s) => ({ ...s, notifyUpcomingClass: v }))
                      }
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{t("settings.notifications.missingPlayers")}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.notifications.missingPlayersDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.notifyMissingPlayers}
                      onCheckedChange={(v) =>
                        setSettings((s) => ({ ...s, notifyMissingPlayers: v }))
                      }
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{t("settings.notifications.validationReminders")}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.notifications.validationRemindersDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.notifyValidationReminders}
                      onCheckedChange={(v) =>
                        setSettings((s) => ({ ...s, notifyValidationReminders: v }))
                      }
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{t("settings.notifications.sendViaEmail")}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.notifications.sendViaEmailDescription")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.notifyEmail}
                      onCheckedChange={(v) => setSettings((s) => ({ ...s, notifyEmail: v }))}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {tab === "notifications" && (
              <NotificationsEngineSection />
            )}

            {/* BILLING */}
            {tab === "billing" && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.billing.title")}</CardTitle>
                  <CardDescription>{t("settings.billing.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium">{t("settings.billing.plan")}</p>
                      <p className="text-sm text-muted-foreground">{t("settings.billing.coachPro")}</p>
                    </div>
                    <Badge variant="secondary">{t("settings.billing.active")}</Badge>
                  </div>

                  <Button variant="outline" disabled>
                    {t("settings.billing.manageBilling")}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* SECURITY */}
            {tab === "security" && (
              <div className="space-y-4">
                {/* Change password */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4" />
                      {t("settings.security.changePassword")}
                    </CardTitle>
                    <CardDescription>
                      {t("settings.security.changePasswordDescription")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="current-password">{t("settings.security.currentPassword")}</Label>
                      <Input
                        id="current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-password">{t("settings.security.newPassword")}</Label>
                        <Input
                          id="new-password"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                        {newPassword.length > 0 && newPassword.length < 8 && (
                          <p className="text-xs text-muted-foreground">
                            {t("settings.security.minChars")}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="confirm-password">{t("settings.security.confirmNewPassword")}</Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                        {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                          <p className="text-xs text-muted-foreground">
                            {t("settings.security.passwordsDontMatch")}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        onClick={handleChangePassword}
                        disabled={!canSubmitPassword || pwLoading}
                      >
                        {pwLoading ? t("settings.security.updating") : t("settings.security.updatePassword")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Logout */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <LogOut className="w-4 h-4" />
                      {t("settings.security.logout")}
                    </CardTitle>
                    <CardDescription>
                      {t("settings.security.logoutDescription")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex justify-end">
                    <Button variant="destructive" onClick={handleLogout} className="gap-2">
                      <LogOut className="w-4 h-4" />
                      {t("settings.security.logout")}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* IMPORT DATA */}
            {tab === "import" && (
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
            {tab === "club" && (
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
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
