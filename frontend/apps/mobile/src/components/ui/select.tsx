import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as SelectPrimitive from "@rn-primitives/select";
import * as React from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { resolveFontClass } from "@/lib/font-class";
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
  const { open } = SelectPrimitive.useRootContext();

  return (
    <SelectPrimitive.Portal hostName={portalHost}>
      <SelectPrimitive.Overlay style={StyleSheet.absoluteFill}>
        <Animated.View entering={FadeIn} exiting={FadeOut}>
          <SelectPrimitive.Content
            className={cn(
              "relative z-50 max-h-96 min-w-[8rem] rounded-md border border-border bg-popover shadow-md shadow-black/10",
              position === "popper" && "mt-1.5",
              open ? "opacity-100" : "opacity-0",
              className
            )}
            position={position}
            {...props}
          >
            <SelectPrimitive.Viewport className="p-1">
              {children}
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
