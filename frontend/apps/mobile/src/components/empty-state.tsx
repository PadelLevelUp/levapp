import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type EmptyStateProps = React.ComponentProps<typeof View> & {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
};

function EmptyState({
  icon = "file-tray-outline",
  title,
  message,
  className,
  testID = "empty-state",
  children,
  ...props
}: EmptyStateProps) {
  return (
    <View
      className={cn("flex-1 items-center justify-center gap-2 p-8", className)}
      testID={testID}
      {...props}
    >
      <Ionicons name={icon} size={40} color={lightTheme.mutedForeground} />
      <Text className="text-center text-lg font-semibold">{title}</Text>
      {message ? (
        <Text className="text-center text-sm text-muted-foreground">
          {message}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export { EmptyState };
export type { EmptyStateProps };
