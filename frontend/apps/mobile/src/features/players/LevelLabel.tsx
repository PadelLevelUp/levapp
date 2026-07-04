import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface LevelLabelProps {
  /** Short level identifier, e.g. "B1". Rendered emphasised. */
  code: string;
  /** Human-readable level name, e.g. "Beginner". Rendered muted. */
  label: string;
  className?: string;
}

/**
 * Mobile port of the web LevelLabel (PAD-14): keeps the level code visually
 * distinct from its label — bold code, "|" separator, muted label.
 */
export function LevelLabel({ code, label, className }: LevelLabelProps) {
  return (
    <View className={cn("flex-row items-baseline gap-1.5", className)}>
      <Text className="font-semibold">{code}</Text>
      <Text className="text-muted-foreground" aria-hidden>
        |
      </Text>
      <Text className="text-muted-foreground">{label}</Text>
    </View>
  );
}

/** Plain-string variant for Select option labels (code + label distinct). */
export function levelOptionLabel(code: string, label: string): string {
  return `${code} | ${label}`;
}
