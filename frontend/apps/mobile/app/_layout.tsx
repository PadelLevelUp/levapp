import * as React from "react";
// Must be the first import (react-native-gesture-handler setup requirement).
import "react-native-gesture-handler";
// PAD-587: the launch clock starts with the first app module.
import { launchMark } from "@/lib/launch-timeline";
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
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/auth/AuthContext";
import { LaunchAnimation } from "@/components/brand/LaunchAnimation";
import { PushTapRouter } from "@/components/PushTapRouter";
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
import { startSessionRestore } from "@/auth/AuthContext";
import { useFirstScreenReady } from "@/lib/first-screen-ready";
import { overlayShouldRelease, LAUNCH_RELEASE_GRACE_MS } from "@/lib/launch-overlay";

// PAD-587: the session restore (keychain, /auth/me) starts now, in parallel with the fonts,
// instead of after the root has rendered.
void startSessionRestore().catch(() => undefined);

// Keep the native splash up until the JS launch animation is on screen —
// otherwise there is a white frame between the two.
void SplashScreen.preventAutoHideAsync().catch(() => {});

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
  const [showLaunch, setShowLaunch] = React.useState(true);

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
  React.useEffect(() => {
    if (fontsLoaded || fontError) {
      launchMark("fonts-ready");
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // PAD-587: the overlay ends at the earlier of its own animation and "first screen ready" plus
  // a short grace — never before the fonts (launch-overlay.ts). `release` tells the animation to
  // run its final fade now and to stop catching touches.
  const fontsReady = !!(fontsLoaded || fontError);
  const firstScreenReady = useFirstScreenReady();
  const [firstScreenReadyAt, setFirstScreenReadyAt] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (firstScreenReady && firstScreenReadyAt === null) {
      launchMark("first-screen-ready");
      setFirstScreenReadyAt(Date.now());
    }
  }, [firstScreenReady, firstScreenReadyAt]);
  const [release, setRelease] = React.useState(false);
  React.useEffect(() => {
    if (release || !showLaunch) return;
    const check = () => {
      if (overlayShouldRelease({ fontsReady, firstScreenReadyAt, now: Date.now() })) setRelease(true);
    };
    check();
    const timer = setTimeout(check, LAUNCH_RELEASE_GRACE_MS + 10);
    return () => clearTimeout(timer);
  }, [fontsReady, firstScreenReadyAt, release, showLaunch]);

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
          <PushTapRouter />
          <PortalHost />
          <ToastHost />
          <StatusBar style="light" />
          {showLaunch ? (
            <LaunchAnimation
              release={release}
              onDone={() => {
                launchMark("overlay-gone");
                setShowLaunch(false);
              }}
            />
          ) : null}
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
