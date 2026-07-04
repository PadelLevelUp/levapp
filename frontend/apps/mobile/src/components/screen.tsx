import * as React from "react";
import { View } from "react-native";
import { SafeAreaView, type Edges } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type ScreenProps = React.ComponentProps<typeof SafeAreaView> & {
  /** Optional header title rendered by the Screen itself. Omit inside tab
   * screens — the Tabs navigator already renders a header. */
  title?: string;
  edges?: Edges;
};

/**
 * Shared page wrapper for feature screens: background, safe-area handling and
 * a stable testID. Tab screens get top/bottom insets from the navigator, so
 * edges defaults to none unless a title header is rendered here.
 */
function Screen({ title, edges, className, children, ...props }: ScreenProps) {
  return (
    <SafeAreaView
      edges={edges ?? (title ? ["top"] : [])}
      className={cn("flex-1 bg-background", className)}
      {...props}
    >
      {title ? (
        <View className="border-b border-border px-4 py-3">
          <Text
            role="heading"
            aria-level={1}
            className="text-xl font-bold text-foreground"
          >
            {title}
          </Text>
        </View>
      ) : null}
      {children}
    </SafeAreaView>
  );
}

export { Screen };
export type { ScreenProps };
