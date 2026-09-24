import { Ionicons } from "@expo/vector-icons";
import { authApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import { useQuery } from "@tanstack/react-query";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { AccountSection } from "@/features/settings/account-section";
import { AdminSection } from "@/features/settings/admin-section";
import { AutoInviteSection } from "@/features/settings/auto-invite-section";
import { BuildInfoLine } from "@/features/settings/build-info";
import { ClubSection } from "@/features/settings/club-section";
import { ConnectionsSection } from "@/features/settings/connections-section";
import { ClassRequestsSection } from "@/features/class-requests/class-requests-section";
import { ImportSection } from "@/features/settings/import-section";
import { PreferencesSection } from "@/features/settings/preferences-section";
import { ProfileSection } from "@/features/settings/profile-section";
import { SeasonsSection } from "@/features/settings/seasons-section";
import { WorkingHoursSection } from "@/features/settings/working-hours-section";
import { StudentNotificationBlocksSection } from "@/features/settings/student-notification-blocks-section";
import { TutorialsSection } from "@/features/settings/tutorials-section";
import {
  UnsavedRegistryProvider,
  useUnsavedRegistry,
} from "@/features/settings/unsaved-registry";
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
 * It lives OUTSIDE the `(tabs)` group (PAD-193): Settings came off the bottom
 * bar on both platforms (DEC 2026-09-04, PAD-171 §1) and is now pushed onto
 * the root stack from the header avatar (`header-account` in
 * `app/(tabs)/_layout.tsx`), so the coach bar is back to the six destinations
 * its label sizing was tuned for. The route path is unchanged — `/settings`
 * still resolves, so deep links and `router.push("/settings")` callers keep
 * working — and the native stack now gives the screen a real back button.
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
 * used to hold it is gone. Maestro reaches it via the header avatar
 * (`.maestro/subflows/logout.yaml`).
 *
 * B-157 / settings.unsaved-edits: `UnsavedRegistryProvider` wraps the body in
 * its OWN component (`SettingsScreenBody`) rather than this one, because a
 * component cannot consume the context it itself provides in the same
 * render — `useUnsavedRegistry()` needs to be called from a descendant.
 */
export default function SettingsScreen() {
  return (
    <UnsavedRegistryProvider>
      <SettingsScreenBody />
    </UnsavedRegistryProvider>
  );
}

function SettingsScreenBody() {
  const { t } = useTranslation();
  // The list ends under the system bar on Android's edge-to-edge (the transparent
  // 3-button bar): pad by the bottom inset so the last row — logout — is tappable
  // and not behind the Home button (PAD-304; Maestro hit Home 1 run in 5).
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const unsavedRegistry = useUnsavedRegistry();
  // settings.unsaved-edits rule 4: the confirm shown before the back row leaves an
  // unsaved section. Not gated on `activeSection`'s id — the registry is the aggregate
  // of whatever is CURRENTLY mounted under the open pane (rule 3's "the section stays"
  // covers `calendar`'s two panels and `preferences`'s nested CoachLevelsSection alike;
  // see unsaved-registry.tsx).
  const [confirmDiscardOpen, setConfirmDiscardOpen] = React.useState(false);

  // Fresh profile straight from /auth/me; `user` is the cached fallback so the
  // first frame isn't empty.
  const { data: me } = useQuery({
    queryKey: ["auth-me"],
    queryFn: authApi.getMe,
  });
  const isCoach = (me ?? user)?.roles?.includes("coach") ?? false;
  const isSuperAdmin = (me ?? user)?.isSuperAdmin === true;

  // PAD-281: the chat bubble's "Propose another time" on a student's
  // counter-proposal opens the coach's class-requests pane on that request.
  const params = useLocalSearchParams<{ section?: string; proposeFor?: string }>();
  const [openId, setOpenId] = React.useState<SettingsSectionId | null>(
    params.section === "classRequests" ? "classRequests" : null
  );
  const proposeFor = params.proposeFor ? Number(params.proposeFor) : null;

  // Web's drill-in resets because navigating away unmounts SettingsPage.
  // Popping this screen off the stack unmounts it too, so the reset is
  // belt-and-braces now rather than the only thing standing between a coach
  // and a stale open section — it still covers the case where the screen is
  // merely blurred (something pushed on top of it) instead of popped.
  useFocusEffect(
    React.useCallback(() => {
      return () => setOpenId(null);
    }, [])
  );

  const sections = visibleSections(isCoach, isSuperAdmin);
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
        // PAD-357 (settings.coach-working-hours rule 3): working hours sit under
        // Seasons, as on web's calendar tab.
        return (
          <View className="gap-4">
            <SeasonsSection />
            <WorkingHoursSection />
          </View>
        );
      case "notifications":
        return <AutoInviteSection />;
      case "classRequests":
        return <ClassRequestsSection role="coach" proposeFor={proposeFor} />;
      case "connections":
        return <ConnectionsSection />;
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
      case "admin":
        return <AdminSection />;
    }
  };

  return (
    <View className="flex-1 bg-background" testID="screen-settings">
      {/* mobile.status-bar rule 4 (PAD-419): this route paints its own navy top, so it sets light content while shown. */}
      <StatusBar style="light" />
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: "minimal",
          // headerTitle, NOT title: `title` also feeds a tab/back label, and
          // when this screen was a tab, drilling into a section renamed the
          // Settings TAB after it — the bar read "Preferenc…" truncated, and
          // "Calendar" twice. headerTitle keeps the rename to the header.
          headerTitle: activeSection
            ? t(activeSection.labelKey)
            : t("settings.title"),
          headerStyle: { backgroundColor: lightTheme.sidebarBackground },
          headerTintColor: lightTheme.sidebarForeground,
          headerTitleStyle: { fontWeight: "700" },
        }}
      />

      {/*
       * The inset is reserved on the scroll view itself, not only inside its
       * content: under edge-to-edge the app window runs beneath the
       * transparent 3-button navigation bar, so a row resting at the bottom of
       * the window is drawn under the bar and the bar takes the touch. Content
       * padding alone only protects the END of the list, which leaves the last
       * row (logout) untappable whenever a scroll happens to stop there — a
       * real thumb problem, and the one that made every logging-out Maestro
       * flow tap Home instead (PAD-304). Ending the viewport above the bar
       * makes that position unreachable.
       */}
      <ScrollView
        className="flex-1"
        style={{ marginBottom: insets.bottom }}
        contentContainerClassName="gap-4 p-4"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
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

            <BuildInfoLine />
          </>
        ) : (
          <>
            <Pressable
              testID="settings-back"
              accessibilityLabel={t("settings.sections")}
              role="button"
              onPress={() => {
                // settings.unsaved-edits rule 3: the back row is the only way from a
                // section to the section list on iOS, so it is where leaving is asked.
                // Nothing unsaved leaves at once, exactly as before (rule 3's other half).
                if (unsavedRegistry.hasUnsaved()) {
                  setConfirmDiscardOpen(true);
                } else {
                  setOpenId(null);
                }
              }}
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

      {/* settings.unsaved-edits rule 4: "Descartar alterações?" / "Discard changes?",
          keep editing (stay, every edit intact) or discard (leave; the section reloads
          from the server when reopened — nothing here saves anything). */}
      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent testID="settings-unsaved-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.unsavedChanges.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.unsavedChanges.body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              testID="settings-unsaved-keep"
              accessibilityLabel={t("settings.unsavedChanges.keepEditing")}
            >
              <Text>{t("settings.unsavedChanges.keepEditing")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="settings-unsaved-discard"
              accessibilityLabel={t("settings.unsavedChanges.discard")}
              className="bg-destructive"
              onPress={() => {
                setConfirmDiscardOpen(false);
                setOpenId(null);
              }}
            >
              <Text>{t("settings.unsavedChanges.discard")}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}
