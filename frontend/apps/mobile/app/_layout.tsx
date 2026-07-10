// Must be the first import (react-native-gesture-handler setup requirement).
import "react-native-gesture-handler";
import "../global.css";

import { PortalHost } from "@rn-primitives/portal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/auth/AuthContext";
import { ToastHost } from "@/components/ui/toast";

// Known-noisy RN Animated warning; its LogBox toast covers the tab bar and
// breaks taps (both for users of dev builds and for UI automation).
LogBox.ignoreLogs([
  "Sending `onAnimatedValueUpdate` with no listeners registered",
]);

// Registers the API singleton (initApi) before anything uses getApi().
import "@/lib/api";
// i18next init (side effect) — must run before any screen calls useTranslation().
import "@/lib/i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="(tabs)" />
          </Stack>
          <PortalHost />
          <ToastHost />
          <StatusBar style="light" />
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
