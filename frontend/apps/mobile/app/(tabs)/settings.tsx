import { Ionicons } from "@expo/vector-icons";
import { authApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import { useQuery } from "@tanstack/react-query";
import { Stack, useFocusEffect } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { AccountSection } from "@/features/settings/account-section";
import { AutoInviteSection } from "@/features/settings/auto-invite-section";
import { ClubSection } from "@/features/settings/club-section";
import { ImportSection } from "@/features/settings/import-section";
import { PreferencesSection } from "@/features/settings/preferences-section";
import { ProfileSection } from "@/features/settings/profile-section";
import { SeasonsSection } from "@/features/settings/seasons-section";
import { StudentNotificationBlocksSection } from "@/features/settings/student-notification-blocks-section";
import { TutorialsSection } from "@/features/settings/tutorials-section";
import {
  visibleSections,
  type SettingsSectionDef,
  type SettingsSectionId,
} from "@/features/settings/settings-sections";

function SectionRow({
  section,
  onPress,
}: {
  section: SettingsSectionDef;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      testID={`settings-nav-${section.id}`}
      accessibilityLabel={t(section.labelKey)}
      role="button"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-lg p-3 active:bg-accent"
    >
      <Ionicons name={section.icon} size={20} color={lightTheme.primary} />
      {/* min-w-0 lets the label column shrink instead of pushing the chevron
          off a 390pt screen when a translated label runs long. */}
      <View className="min-w-0 flex-1">
        <Text className="text-base font-medium">{t(section.labelKey)}</Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={2}>
          {t(section.descriptionKey)}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={lightTheme.mutedForeground}
      />
    </Pressable>
  );
}

/**
 * Settings — a DRILL-IN, matching the web app's phone layout: the list of
 * sections first, one section at a time with a back control.
 *
 * Role gating happens ONCE, in `visibleSections(isCoach)`: the same list
 * builds the nav and resolves `activeSection`, so a player can never reach a
 * coach pane — not by a stale `openId`, and not in the window before
 * `/auth/me` resolves and flips `isCoach`. Web shipped the opposite bug: a
 * player was offered Club, Import and Seasons and got a blank Notifications
 * pane with three uncaught 403s.
 *
 * Log out stays on the section list rather than moving inside Account: it is
 * the one action people come to Settings to perform, and the More tab that
 * used to hold it is gone.
 */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  // Fresh profile straight from /auth/me; `user` is the cached fallback so the
  // first frame isn't empty.
  const { data: me } = useQuery({
    queryKey: ["auth-me"],
    queryFn: authApi.getMe,
  });
  const isCoach = (me ?? user)?.roles?.includes("coach") ?? false;

  const [openId, setOpenId] = React.useState<SettingsSectionId | null>(null);

  // Web's drill-in resets because navigating away unmounts SettingsPage.
  // expo-router keeps tab screens mounted, so without this, leaving for the
  // Calendar tab and coming back drops you inside whatever section was open,
  // with the list nowhere in sight. Reset on blur to match web.
  useFocusEffect(
    React.useCallback(() => {
      return () => setOpenId(null);
    }, [])
  );

  const sections = visibleSections(isCoach);
  // Re-derived every render from the role-filtered list, so it collapses back
  // to the list the moment a section stops being allowed.
  const activeSection = sections.find((s) => s.id === openId) ?? null;

  const renderSection = (id: SettingsSectionId) => {
    switch (id) {
      case "profile":
        return <ProfileSection />;
      case "preferences":
        return <PreferencesSection isCoach={isCoach} />;
      case "calendar":
        return <SeasonsSection />;
      case "notifications":
        return <AutoInviteSection />;
      case "myNotifications":
        return <StudentNotificationBlocksSection />;
      case "tutorials":
        return <TutorialsSection />;
      case "import":
        return <ImportSection />;
      case "club":
        return <ClubSection />;
      case "account":
        return <AccountSection />;
    }
  };

  return (
    <View className="flex-1 bg-background" testID="screen-settings">
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: "minimal",
          // headerTitle, NOT title: `title` also feeds tabBarLabel, so drilling
          // into a section renamed the Settings TAB after it — the bar read
          // "Preferenc…" truncated, and "Calendar" twice.
          headerTitle: activeSection
            ? t(activeSection.labelKey)
            : t("settings.title"),
          headerStyle: { backgroundColor: lightTheme.sidebarBackground },
          headerTintColor: lightTheme.sidebarForeground,
          headerTitleStyle: { fontWeight: "700" },
        }}
      />

      <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4 pb-10">
        {activeSection === null ? (
          <>
            <Card testID="settings-section-list">
              <CardContent className="gap-1 p-2">
                {sections.map((section) => (
                  <SectionRow
                    key={section.id}
                    section={section}
                    onPress={() => setOpenId(section.id)}
                  />
                ))}
              </CardContent>
            </Card>

            <Pressable
              testID="settings-logout"
              accessibilityLabel={t("settings.mobile.logout")}
              role="button"
              onPress={() => void logout()}
              className="mt-2 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3.5 active:opacity-70"
            >
              <Ionicons
                name="log-out-outline"
                size={18}
                color={lightTheme.destructive}
              />
              <Text
                className="font-semibold"
                style={{ color: lightTheme.destructive }}
              >
                {t("settings.mobile.logout")}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              testID="settings-back"
              accessibilityLabel={t("settings.sections")}
              role="button"
              onPress={() => setOpenId(null)}
              className="flex-row items-center gap-1.5 self-start py-1 active:opacity-70"
            >
              <Ionicons
                name="chevron-back"
                size={18}
                color={lightTheme.mutedForeground}
              />
              <Text className="text-sm font-medium text-muted-foreground">
                {t("settings.sections")}
              </Text>
            </Pressable>

            {renderSection(activeSection.id)}
          </>
        )}
      </ScrollView>
    </View>
  );
}
