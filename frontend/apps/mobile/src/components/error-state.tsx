import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type ErrorStateProps = React.ComponentProps<typeof View> & {
  icon?: keyof typeof Ionicons.glyphMap;
  title?: string;
  message?: string;
  /** When provided, renders a retry button (testID "error-state-retry"). */
  onRetry?: () => void;
  retryLabel?: string;
};

function ErrorState({
  icon = "alert-circle-outline",
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  className,
  testID = "error-state",
  ...props
}: ErrorStateProps) {
  return (
    <View
      className={cn("flex-1 items-center justify-center gap-2 p-8", className)}
      testID={testID}
      {...props}
    >
      <Ionicons name={icon} size={40} color={lightTheme.destructive} />
      <Text className="text-center text-lg font-semibold">{title}</Text>
      {message ? (
        <Text className="text-center text-sm text-muted-foreground">
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onPress={onRetry}
          testID="error-state-retry"
        >
          <Text>{retryLabel}</Text>
        </Button>
      ) : null}
    </View>
  );
}

export { ErrorState };
export type { ErrorStateProps };
