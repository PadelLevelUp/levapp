import * as React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { lightTheme } from "@levelup/config";
import { LevAppMark } from "./LevAppMark";

/**
 * The launch animation.
 *
 * There was no animation before — the app showed a static native splash and
 * cut straight to the first screen. This is the piece that was missing.
 *
 * The motion follows the system's rules rather than the usual app-launch
 * flourish: nothing bounces, nothing springs, nothing overshoots. The mark
 * fades up and settles from 0.92 with the standard entering curve
 * (0.16, 1, 0.3, 1); the wordmark follows one beat later so the eye reads the
 * monogram first and the name second; then the whole thing fades out over the
 * app. Total ~1.4s, which is long enough to register and short enough not to
 * be in the way on the fifth launch of the day.
 *
 * Held deliberately short of anything decorative: the design system's most
 * expressive permitted motion is a progress bar animating its width.
 */

const ENTER = Easing.bezier(0.16, 1, 0.3, 1);
const STANDARD = Easing.bezier(0.2, 0, 0, 1);

export function LaunchAnimation({ onDone }: { onDone: () => void }) {
  const markOpacity = useSharedValue(0);
  const markScale = useSharedValue(0.92);
  const wordOpacity = useSharedValue(0);
  const wordShift = useSharedValue(8);
  const veil = useSharedValue(1);

  React.useEffect(() => {
    markOpacity.value = withTiming(1, { duration: 420, easing: ENTER });
    markScale.value = withTiming(1, { duration: 520, easing: ENTER });

    wordOpacity.value = withDelay(240, withTiming(1, { duration: 360, easing: ENTER }));
    wordShift.value = withDelay(240, withTiming(0, { duration: 360, easing: ENTER }));

    // Hold, then hand over to the app.
    veil.value = withDelay(
      980,
      withTiming(0, { duration: 320, easing: STANDARD }, (finished) => {
        if (finished) runOnJS(onDone)();
      })
    );
  }, []);

  const veilStyle = useAnimatedStyle(() => ({
    opacity: veil.value,
    // Once faded, stop swallowing touches even if the unmount lags a frame.
    pointerEvents: veil.value < 0.02 ? "none" : "auto",
  }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [{ scale: markScale.value }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.value,
    transform: [{ translateX: wordShift.value }],
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.veil, veilStyle]}
      pointerEvents="auto"
      testID="launch-animation"
    >
      <View style={styles.row}>
        <Animated.View style={markStyle}>
          <LevAppMark size={44} />
        </Animated.View>
        <Animated.View style={wordStyle}>
          <Text style={styles.word}>
            Lev<Text style={styles.wordAccent}>App</Text>
          </Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: {
    // The icon's own navy field, so the native splash hands over to this
    // without a visible seam.
    backgroundColor: "#0B1524",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  word: {
    fontFamily: "Poppins_700Bold",
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -0.9,
    color: "#FFFFFF",
  },
  wordAccent: {
    fontFamily: "Poppins_700Bold",
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -0.9,
    color: lightTheme.sidebarPrimary,
  },
});
