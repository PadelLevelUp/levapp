import { Ionicons } from "@expo/vector-icons";
import { authApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import i18n from "@/lib/i18n";
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/lib/config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { AutoInviteSection } from "@/features/settings/auto-invite-section";
import { ClubSection } from "@/features/settings/club-section";
import { CoachLevelsSection } from "@/features/settings/coach-levels-section";
import { DeleteAccountSection } from "@/features/settings/delete-account-section";

function LegalLinkRow({
  label,
  url,
  testID,
}: {
  label: string;
  url: string;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => void Linking.openURL(url)}
      className="flex-row items-center justify-between rounded-lg border border-border p-3 active:bg-accent"
    >
      <Text className="text-base">{label}</Text>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={lightTheme.mutedForeground}
      />
    </Pressable>
  );
}

type Language = "pt" | "en";

const LANGUAGE_LABELS: Record<Language, string> = {
  pt: "Português",
  en: "English",
};

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="text-base font-medium">{value}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isCoach = user?.roles?.includes("coach") ?? false;

  // Fresh profile (name/username/language) straight from /auth/me.
  const { data: me } = useQuery({
    queryKey: ["auth-me"],
    queryFn: authApi.getMe,
  });
  const profile = me ?? user;

  const [language, setLanguage] = React.useState<Language>(
    user?.language ?? "pt"
  );
  const [languageStatus, setLanguageStatus] = React.useState<string | null>(
    null
  );

  React.useEffect(() => {
    if (me?.language) setLanguage(me.language);
  }, [me?.language]);

  const handleLanguageChange = async (value: Language) => {
    const previous = language;
    setLanguage(value);
    setLanguageStatus(null);
    try {
      await authApi.updateMe({ language: value });
      void i18n.changeLanguage(value);
      setLanguageStatus("Language preference saved.");
    } catch {
      setLanguage(previous);
      setLanguageStatus("Failed to save language preference.");
    }
  };

  return (
    <View className="flex-1 bg-background" testID="screen-settings">
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: "minimal",
          title: "Settings",
          headerStyle: { backgroundColor: lightTheme.sidebarBackground },
          headerTintColor: lightTheme.sidebarForeground,
          headerTitleStyle: { fontWeight: "700" },
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4 pb-10"
      >
        {/* Profile (read-only; /auth/me does not expose email on mobile) */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your account information.</CardDescription>
          </CardHeader>
          <CardContent className="gap-1">
            <ProfileRow label="Name" value={profile?.name ?? "—"} />
            <ProfileRow
              label="Username"
              value={profile?.username ? `@${profile.username}` : "—"}
            />
            <ProfileRow
              label="Role"
              value={isCoach ? "Coach" : "Player"}
            />
          </CardContent>
        </Card>

        {/* Language preference (persists via PATCH /auth/me, mirrors web) */}
        <Card>
          <CardHeader>
            <CardTitle>Language</CardTitle>
            <CardDescription>
              Language used for notifications and messages.
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-2">
            <Label>Preferred language</Label>
            <Select
              value={{ value: language, label: LANGUAGE_LABELS[language] }}
              onValueChange={(option) => {
                if (option && option.value !== language) {
                  void handleLanguageChange(option.value as Language);
                }
              }}
            >
              <SelectTrigger
                testID="settings-language-select"
                accessibilityLabel="Preferred language"
              >
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="pt"
                  label={LANGUAGE_LABELS.pt}
                  testID="settings-language-pt"
                  accessibilityLabel="Portuguese"
                />
                <SelectItem
                  value="en"
                  label={LANGUAGE_LABELS.en}
                  testID="settings-language-en"
                  accessibilityLabel="English"
                />
              </SelectContent>
            </Select>
            {languageStatus ? (
              <Text className="text-sm text-muted-foreground">
                {languageStatus}
              </Text>
            ) : null}
          </CardContent>
        </Card>

        {/* Coach-only: skill levels editor */}
        {isCoach ? <CoachLevelsSection /> : null}

        {/* Coach-only: club (invite/list/revoke co-coaches) */}
        {isCoach ? <ClubSection /> : null}

        {/* Coach-only: auto-invite engine basic controls */}
        {isCoach ? <AutoInviteSection /> : null}

        {/* All roles: hosted legal pages (App Store 5.1.1) */}
        <Card testID="settings-legal">
          <CardHeader>
            <CardTitle>{t("settings.legal.title")}</CardTitle>
          </CardHeader>
          <CardContent className="gap-2">
            <LegalLinkRow
              testID="settings-privacy-policy"
              label={t("settings.legal.privacyPolicy")}
              url={PRIVACY_POLICY_URL}
            />
            <LegalLinkRow
              testID="settings-terms"
              label={t("settings.legal.termsOfService")}
              url={TERMS_URL}
            />
          </CardContent>
        </Card>

        {/* All roles: App Store 5.1.1(v) in-app account deletion */}
        <DeleteAccountSection />
      </ScrollView>
    </View>
  );
}
