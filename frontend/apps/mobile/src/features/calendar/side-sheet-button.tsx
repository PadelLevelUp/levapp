import { lightTheme } from "@levelup/config";
import * as React from "react";
import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";

/**
 * PAD-843: the action buttons of the side sheets. The fill, the text colour and the pressed and
 * disabled looks are a plain `style` OBJECT, never a function of `pressed`: NativeWind's
 * interop wraps every `Pressable`, and a function style comes out unapplied on the phone (no fill,
 * no height, so a white label on the white sheet). Pressed is tracked with state instead.
 * Disabled keeps the fill and dims it (the shared Button's `opacity-50`), so the label stays legible.
 */
export type SideSheetButtonKind = "primary" | "outline" | "ghost";

export function sideSheetButtonStyle(kind: SideSheetButtonKind, disabled: boolean, pressed: boolean) {
  return {
    height: 48,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 16,
    opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
    backgroundColor: kind === "primary" ? lightTheme.primary : "transparent",
    borderWidth: kind === "outline" ? 1 : 0,
    borderColor: lightTheme.border,
  };
}

export function sideSheetButtonTextColor(kind: SideSheetButtonKind): string {
  return kind === "primary" ? lightTheme.primaryForeground : lightTheme.foreground;
}

export function SideSheetButton({
  testID,
  label,
  onPress,
  kind,
  disabled = false,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  kind: SideSheetButtonKind;
  disabled?: boolean;
}) {
  const [pressed, setPressed] = React.useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={sideSheetButtonStyle(kind, disabled, pressed)}
    >
      <Text className="font-semibold" style={{ fontSize: 15, color: sideSheetButtonTextColor(kind) }}>
        {label}
      </Text>
    </Pressable>
  );
}
