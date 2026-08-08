import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { queryKeys, useUnreadCount } from "@levelup/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, Tabs } from "expo-router";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { LevAppMark } from "@/components/brand/LevAppMark";
import { useAppEvents } from "@/lib/sse";

export default function TabsLayout() {
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
          title: "Dashboard",
          tabBarButtonTestID: "tab-dashboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
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
          title: "Players",
          tabBarButtonTestID: "tab-players",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
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
          title: "Availability",
          tabBarButtonTestID: "tab-availability",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: "Training",
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
          title: "Settings",
          tabBarButtonTestID: "tab-settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
