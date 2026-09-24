import * as React from "react";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaView, type Edge, type Edges } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type ScreenProps = React.ComponentProps<typeof SafeAreaView> & {
  /** Optional header title rendered by the Screen itself. Omit inside tab
   * screens — the Tabs navigator already renders a header. */
  title?: string;
  edges?: Edges;
};

// `Array.isArray` does not narrow a readonly array type, so `Edges` needs its own guard.
const isEdgeList = (edges: Edges): edges is readonly Edge[] => Array.isArray(edges);

/**
 * Shared page wrapper for feature screens: background, safe-area handling and
 * a stable testID. Tab screens get top/bottom insets from the navigator, so
 * edges defaults to none unless a title header is rendered here.
 */
function Screen({ title, edges, className, children, ...props }: ScreenProps) {
  const resolvedEdges = edges ?? (title ? ["top"] : []);
  // mobile.status-bar rule 2 (PAD-419): owning the top edge means this screen paints the
  // status-bar area with the light background, so it asks for dark content while shown. The
  // root's "light" (for the navy headers) returns when it unmounts (rule 3).
  const ownsTopEdge = isEdgeList(resolvedEdges)
    ? resolvedEdges.includes("top")
    : resolvedEdges.top !== undefined && resolvedEdges.top !== "off";
  return (
    <SafeAreaView
      edges={resolvedEdges}
      className={cn("flex-1 bg-background", className)}
      {...props}
    >
      {ownsTopEdge ? <StatusBar style="dark" /> : null}
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
