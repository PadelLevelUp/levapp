import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { Link } from "react-router-dom";
import i18n, { AppLanguage } from "@/i18n";
import { getMe, updateMe } from "@/api/auth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Building2,
  Calendar,
  Palette,
  Save,
  Upload,
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

type SettingsTab = "preferences" | "calendar" | "notifications" | "import" | "club" | "account";

function SettingsNav({
  active,
  onChange,
}: {
  active: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}) {
  const { t } = useTranslation();
  const items: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "preferences", label: t("settings.nav.preferences"), icon: <Palette className="w-4 h-4" /> },
    { id: "calendar", label: t("settings.nav.calendar"), icon: <Calendar className="w-4 h-4" /> },
    { id: "notifications", label: t("settings.nav.notifications"), icon: <Bell className="w-4 h-4" /> },
    { id: "import", label: t("settings.nav.import"), icon: <Upload className="w-4 h-4" /> },
    { id: "club", label: t("settings.nav.club"), icon: <Building2 className="w-4 h-4" /> },
    { id: "account", label: t("settings.nav.account"), icon: <UserX className="w-4 h-4" /> },
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

export default function SettingsPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [tab, setTab] = useState<SettingsTab>("preferences");
  const [language, setLanguage] = useState<AppLanguage>("pt");
  // PAD-57: real dark theme owned by next-themes (persists + toggles `.dark`).
  const { theme, setTheme } = useTheme();

  // Load the current user's language preference on mount.
  useEffect(() => {
    let active = true;
    getMe()
      .then((me) => {
        if (!active) return;
        const lang = (me.language ?? "pt") as AppLanguage;
        setLanguage(lang);
        i18n.changeLanguage(lang);
      })
      .catch(() => {
        // ignore — keep default language
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async () => {
    try {
      await updateMe({ language });
      i18n.changeLanguage(language);
    } catch (e) {
      toast({ title: t("settings.toast.couldNotSaveTitle"), description: t("settings.toast.couldNotSaveDescription") });
      return;
    }

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
                  <SelectItem value="preferences">{t("settings.nav.preferences")}</SelectItem>
                  <SelectItem value="calendar">{t("settings.nav.calendar")}</SelectItem>
                  <SelectItem value="notifications">{t("settings.nav.notifications")}</SelectItem>
                  <SelectItem value="import">{t("settings.nav.import")}</SelectItem>
                  <SelectItem value="club">{t("settings.nav.club")}</SelectItem>
                  <SelectItem value="account">{t("settings.nav.account")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* PREFERENCES */}
            {tab === "preferences" && (
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

                  <Separator />

                  <CoachLevelsSection />

                  <Separator />

                  <EvaluationCategoriesSection />
                </CardContent>
              </Card>
            )}

            {/* CALENDAR */}
            {tab === "calendar" && <SeasonsSection />}

            {/* NOTIFICATIONS */}
            {tab === "notifications" && <NotificationsEngineSection />}

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

            {/* ACCOUNT */}
            {tab === "account" && (
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
    </AppLayout>
  );
}
