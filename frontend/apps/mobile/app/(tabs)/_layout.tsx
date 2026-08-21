import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { queryKeys, useUnreadCount } from "@levelup/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, Tabs } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { LevAppMark } from "@/components/brand/LevAppMark";
import { Text } from "@/components/ui/text";
import { useHeaderGreeting } from "@/features/dashboard/CoachDashboard";
import { useAppEvents } from "@/lib/sse";

/** Greeting over date, stacked, in the navy app bar. */
function DashboardGreeting({ name }: { name: string }) {
  const firstName = name.trim().split(" ")[0] ?? "";
  const { greeting, date } = useHeaderGreeting(firstName);
  return (
    <View style={{ gap: 2 }}>
      <Text className="text-xs text-sidebar-foreground/70">{date}</Text>
      <Text className="font-display text-xl text-sidebar-foreground">{greeting}</Text>
    </View>
  );
}

/** Account initials. The sidebar/app bar owns identity, so the page header
 * never repeats it. */
function AccountAvatar({ name }: { name: string }) {
  const parts = name.trim().split(" ").filter(Boolean);
  const initials = parts.length
    ? ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase()
    : "?";
  return (
    <View
      style={{ marginRight: 16 }}
      className="h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent"
    >
      <Text className="text-xs font-sans-bold text-sidebar-accent-foreground">{initials}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { user, loading, isAuthenticated } = useAuth();

  // Unread messages badge on the Messages tab, refreshed live over SSE.
  const queryClient = useQueryClient();
  const { data: unreadData } = useUnreadCount({ enabled: isAuthenticated });
  useAppEvents(
    React.useCallback(
      (evt) => {
        if (evt.type.startsWith("message_")) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.unreadCount,
          });
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      },
      [queryClient]
    )
  );
  // Backend returns { unreadCount } (see /app/messages/unread_count).
  const unreadCount = Number(
    (unreadData as { unreadCount?: number; count?: number } | undefined)
      ?.unreadCount ??
      (unreadData as { count?: number } | undefined)?.count ??
      0
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={lightTheme.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  const isCoach = user?.roles?.includes("coach") ?? false;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: lightTheme.sidebarBackground },
        headerTintColor: lightTheme.sidebarForeground,
        headerTitleStyle: { fontWeight: "700" },
        // The mark rides in the header on every tab, so the navy chrome is
        // recognisably LevApp rather than an unbranded dark bar. The wordmark
        // deliberately stays out — the system forbids it at this size.
        headerLeft: () => (
          <View style={{ paddingLeft: 16, justifyContent: "center" }}>
            <LevAppMark size={26} />
          </View>
        ),
        tabBarActiveTintColor: lightTheme.primary,
        tabBarInactiveTintColor: lightTheme.mutedForeground,
        // The bar carried no bottom inset, so its labels sat flush against
        // the home indicator. paddingBottom + height give it the safe area
        // back; paddingTop keeps the icon off the top edge.
        tabBarStyle: {
          backgroundColor: lightTheme.card,
          borderTopColor: lightTheme.border,
          paddingTop: 6,
          paddingBottom: 24,
          height: 84,
        },
        // Six destinations across a 390pt bar: the labels need to be a touch
        // smaller and the items narrower than the four-tab default.
        tabBarLabelStyle: { fontSize: 10, paddingBottom: 2 },
        tabBarItemStyle: { paddingHorizontal: 0 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t("nav.dashboard"),
          tabBarButtonTestID: "tab-dashboard",
          // The navy bar spends its height on the greeting and date — the only
          // orientation a coach needs — instead of repeating "Dashboard", which
          // the tab underneath already says. The mark stays (headerLeft, above),
          // the wordmark does not, and the account avatar takes the right.
          headerTitle: () => <DashboardGreeting name={user?.name ?? ""} />,
          headerTitleAlign: "left",
          headerRight: () => <AccountAvatar name={user?.name ?? ""} />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t("nav.calendar"),
          tabBarButtonTestID: "tab-calendar",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="players"
        options={{
          // Players is coach-only; href: null removes the tab for students.
          href: isCoach ? undefined : null,
          title: t("nav.players"),
          tabBarButtonTestID: "tab-players",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t("nav.messages"),
          tabBarButtonTestID: "tab-messages",
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="availability"
        options={{
          // Availability is student-only (inverse of the players tab, which
          // is coach-only); href: null removes the tab for coaches.
          href: isCoach ? null : undefined,
          title: t("nav.availability"),
          tabBarButtonTestID: "tab-availability",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: t("nav.training"),
          href: isCoach ? undefined : null,
          tabBarButtonTestID: "tab-training",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="barbell-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("nav.settings"),
          tabBarButtonTestID: "tab-settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
