import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as SelectPrimitive from "@rn-primitives/select";
import * as React from "react";
import { Platform, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { resolveFontClass } from "@/lib/font-class";
import { useAndroidBack } from "@/lib/android-back";
import { dialogEntering, dialogExiting } from "@/lib/dialog-motion";
import { cn } from "@/lib/utils";

type Option = SelectPrimitive.Option;

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;

function SelectValue({ className, ...props }: SelectPrimitive.ValueProps) {
  return (
    <SelectPrimitive.Value
      className={cn("text-base text-foreground", className)}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.TriggerProps) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "h-12 flex-row items-center justify-between gap-2 rounded-md border border-input bg-background px-3",
        props.disabled && "opacity-50",
        className
      )}
      {...props}
    >
      <>{children}</>
      <Ionicons
        name="chevron-down"
        size={16}
        color={lightTheme.mutedForeground}
        aria-hidden
      />
    </SelectPrimitive.Trigger>
  );
}

type SelectContentProps = SelectPrimitive.ContentProps & {
  /** Portal host name; defaults to the root <PortalHost /> in app/_layout.tsx. */
  portalHost?: string;
};

/**
 * PAD-655 (B-549, mobile.android-runtime rule 9b): the option list's height. The content box is
 * capped at max-h-96 (384) and @rn-primitives' native `Viewport` is a bare fragment, so a list
 * taller than the box ran off the screen and nothing could scroll it. The options live in a
 * ScrollView that fits inside the box: 384 less the viewport's padding (p-1) and the border.
 */
const SELECT_LIST_MAX_HEIGHT = 384 - 8 - 2;

/** Space kept between the list and a system bar on Android (PAD-727). */
const SELECT_EDGE_GAP = 8;

/**
 * PAD-727 (B-605, rule 9b): where the list may go. The app draws edge to edge on Android, so the
 * window runs under the status and navigation bars. @rn-primitives' popper already moves a list
 * that would run off the bottom up until it fits (`avoidCollisions`), but it measures against
 * the window and sees no bars, so on Android the last options landed under the navigation bar
 * and could not be reached (Maestro flow 280). Android passes the safe-area insets plus a gap to
 * the popper and caps the list to the height between them, so the whole list is on screen,
 * moved up over the trigger when there is no room below. iOS keeps the values it had.
 */
export function selectListLayout(
  os: string,
  insets: { top: number; bottom: number; left: number; right: number },
  windowHeight: number
): { insets?: { top: number; bottom: number; left: number; right: number }; maxHeight: number } {
  if (os !== "android") return { maxHeight: SELECT_LIST_MAX_HEIGHT };
  const edges = {
    top: insets.top + SELECT_EDGE_GAP,
    bottom: insets.bottom + SELECT_EDGE_GAP,
    left: insets.left,
    right: insets.right,
  };
  // the room between the bars, less the viewport's padding and border (as above)
  const room = windowHeight - edges.top - edges.bottom - 8 - 2;
  return { insets: edges, maxHeight: Math.max(0, Math.min(SELECT_LIST_MAX_HEIGHT, room)) };
}

/**
 * Renders through @rn-primitives/portal — the root layout already mounts a
 * <PortalHost />, so no extra setup is needed by consumers.
 */
function SelectContent({
  className,
  children,
  position = "popper",
  portalHost,
  ...props
}: SelectContentProps) {
  const { open, onOpenChange } = SelectPrimitive.useRootContext();
  // Android back closes the list (mobile.android-runtime rule 3).
  useAndroidBack(open, () => onOpenChange(false));
  const safeArea = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const layout = selectListLayout(Platform.OS, safeArea, windowHeight);

  return (
    <SelectPrimitive.Portal hostName={portalHost}>
      <SelectPrimitive.Overlay style={StyleSheet.absoluteFill}>
        {/*
         * B-067: the wrapper must fill the overlay. The content below is
         * absolutely positioned (popper), so a shrink-wrapped wrapper measures
         * 0x0 and the list renders OUTSIDE its parent's bounds. iOS delivers
         * touches there anyway; Android does not — it neither hit-tests nor
         * exposes such children to accessibility, so on Android every option
         * was invisible to taps (and to Maestro) while plainly on screen.
         * `box-none` keeps a tap outside the list falling through to the
         * overlay, which is what closes it. Geometry is unchanged on both
         * platforms: the content is positioned from the same origin.
         */}
        <Animated.View
          style={StyleSheet.absoluteFill}
          pointerEvents="box-none"
          entering={dialogEntering()}
          exiting={dialogExiting()}
        >
          <SelectPrimitive.Content
            className={cn(
              "relative z-50 max-h-96 min-w-[8rem] rounded-md border border-border bg-popover shadow-md shadow-black/10",
              position === "popper" && "mt-1.5",
              open ? "opacity-100" : "opacity-0",
              className
            )}
            position={position}
            insets={layout.insets}
            {...props}
          >
            <SelectPrimitive.Viewport className="p-1">
              <ScrollView
                style={{ maxHeight: layout.maxHeight }}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {children}
              </ScrollView>
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </Animated.View>
      </SelectPrimitive.Overlay>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: SelectPrimitive.LabelProps) {
  return (
    <SelectPrimitive.Label
      // @rn-primitives Label renders a native Text directly — R-025.
      className={resolveFontClass(
        cn(
          "py-1.5 pl-8 pr-2 text-sm font-semibold text-popover-foreground",
          className
        )
      )}
      {...props}
    />
  );
}

function SelectItem({ className, ...props }: SelectPrimitive.ItemProps) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative w-full flex-row items-center rounded-sm py-2 pl-8 pr-2 active:bg-accent",
        props.disabled && "opacity-50",
        className
      )}
      {...props}
    >
      <View className="absolute left-2 h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Ionicons name="checkmark" size={14} color={lightTheme.primary} />
        </SelectPrimitive.ItemIndicator>
      </View>
      <SelectPrimitive.ItemText className="text-base text-popover-foreground" />
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.SeparatorProps) {
  return (
    <SelectPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-muted", className)}
      {...props}
    />
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
export type { Option };
