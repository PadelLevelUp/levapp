import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";

export default function TabsLayout() {
  const { user, loading, isAuthenticated } = useAuth();

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
        tabBarActiveTintColor: lightTheme.primary,
        tabBarInactiveTintColor: lightTheme.mutedForeground,
        tabBarStyle: { backgroundColor: lightTheme.card },
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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarButtonTestID: "tab-more",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
