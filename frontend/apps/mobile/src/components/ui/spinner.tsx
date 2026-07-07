import { lightTheme } from "@levelup/config";
import * as React from "react";
import { ActivityIndicator } from "react-native";
import { cn } from "@/lib/utils";

type SpinnerProps = React.ComponentProps<typeof ActivityIndicator>;

/** ActivityIndicator themed to the brand primary color by default. */
function Spinner({ className, color = lightTheme.primary, ...props }: SpinnerProps) {
  return (
    <ActivityIndicator className={cn(className)} color={color} {...props} />
  );
}

export { Spinner };
export type { SpinnerProps };
