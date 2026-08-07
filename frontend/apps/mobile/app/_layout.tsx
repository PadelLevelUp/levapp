// Must be the first import (react-native-gesture-handler setup requirement).
import "react-native-gesture-handler";
import "../global.css";

import { PortalHost } from "@rn-primitives/portal";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/auth/AuthContext";
import { ToastHost } from "@/components/ui/toast";
import { useAppStateFocus } from "@/hooks/useAppStateFocus";
import { usePushNotificationRouting } from "@/hooks/usePushNotificationRouting";

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
  usePushNotificationRouting();
  // Lets React Query treat a foreground return as a focus event, so data that
  // went stale while iOS had the app suspended refetches on resume.
  useAppStateFocus();

  // Poppins carries display (titles, hero numbers); Plus Jakarta Sans carries
  // everything else. Only the weights the system uses are bundled.
  const [fontsLoaded, fontError] = useFonts({
    Poppins_600SemiBold,
    Poppins_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  // Render nothing until the faces resolve, so text does not paint in the
  // system font and reflow. A font ERROR must not block the app, though —
  // falling back to system type beats a permanently blank screen.
  if (!fontsLoaded && !fontError) return null;

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
