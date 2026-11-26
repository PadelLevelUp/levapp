/**
 * classes.coach-requests-table rule 12 (PAD-795): the coach's Pedidos de Aula as a screen of its own,
 * opened from Settings' `settings-nav-classRequests` and by the chat bubble's "Propose another time"
 * (`proposeFor`). The screen is `features/class-requests/coach-requests-screen.tsx`.
 */
import { lightTheme } from "@levelup/config";
import { Stack, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { CoachRequestsScreen } from "@/features/class-requests/coach-requests-screen";

export default function ClassRequestsRoute() {
  const { t } = useTranslation();
  const { proposeFor } = useLocalSearchParams<{ proposeFor?: string }>();
  return (
    <View className="flex-1 bg-background" testID="screen-class-requests">
      {/* mobile.status-bar rule 4 (PAD-419): this route paints its own navy top, so it sets light content while shown. */}
      <StatusBar style="light" />
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: "minimal",
          headerTitle: t("classRequests.coachTitle"),
          headerStyle: { backgroundColor: lightTheme.sidebarBackground },
          headerTintColor: lightTheme.sidebarForeground,
          headerTitleStyle: { fontWeight: "700" },
        }}
      />
      <CoachRequestsScreen proposeFor={proposeFor ? Number(proposeFor) : null} />
    </View>
  );
}
