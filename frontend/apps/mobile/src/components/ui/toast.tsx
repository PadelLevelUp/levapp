import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { Portal } from "@rn-primitives/portal";
import * as React from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error";

type ToastRecord = {
  id: number;
  variant: ToastVariant;
  message: string;
  description?: string;
};

const AUTO_DISMISS_MS = 3500;
const MAX_VISIBLE_TOASTS = 3;
const ENTER_DURATION_MS = 200;
const EXIT_DURATION_MS = 150;

/** Minimal sonner-style store: module-level state + subscriber list, read via useSyncExternalStore. */
let toasts: ToastRecord[] = [];
const listeners = new Set<() => void>();
let nextId = 0;

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return toasts;
}

function addToast(variant: ToastVariant, message: string, description?: string) {
  const id = ++nextId;
  toasts = [...toasts, { id, variant, message, description }].slice(
    -MAX_VISIBLE_TOASTS
  );
  emit();
  return id;
}

function removeToast(id: number) {
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

const toast = {
  success: (message: string, description?: string) =>
    addToast("success", message, description),
  error: (message: string, description?: string) =>
    addToast("error", message, description),
};

function ToastItem({ record }: { record: ToastRecord }) {
  const progress = React.useRef(new Animated.Value(0)).current;
  const dismissedRef = React.useRef(false);

  const dismiss = React.useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    Animated.timing(progress, {
      toValue: 0,
      duration: EXIT_DURATION_MS,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(() => removeToast(record.id));
  }, [progress, record.id]);

  React.useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: ENTER_DURATION_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [dismiss, progress]);

  const isSuccess = record.variant === "success";

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [16, 0],
            }),
          },
        ],
      }}
    >
      <Pressable
        onPress={dismiss}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        className={cn(
          "w-full max-w-sm flex-row items-start gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg shadow-black/20",
          isSuccess ? "border-success" : "border-destructive"
        )}
      >
        <Ionicons
          name={isSuccess ? "checkmark-circle" : "alert-circle"}
          size={20}
          color={isSuccess ? lightTheme.success : lightTheme.destructive}
        />
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-medium text-foreground">
            {record.message}
          </Text>
          {record.description ? (
            <Text className="text-xs text-muted-foreground">
              {record.description}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Renders active toasts into the root <PortalHost /> (app/_layout.tsx).
 * Mount once near the app root; call `toast.success`/`toast.error` from anywhere.
 */
function ToastHost() {
  const items = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (items.length === 0) return null;

  return (
    <Portal name="toast-host">
      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 bottom-24 items-center gap-2 px-4"
      >
        {items.map((item) => (
          <ToastItem key={item.id} record={item} />
        ))}
      </View>
    </Portal>
  );
}

export { toast, ToastHost };
export type { ToastRecord, ToastVariant };
