import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type ClassRequestKind = "private" | "academy";

const OPTIONS: { kind: ClassRequestKind; icon: "person-add-outline" | "people-outline" }[] = [
  { kind: "private", icon: "person-add-outline" },
  { kind: "academy", icon: "people-outline" },
];

/** Step 2, "Tipo de aula": a private class (PAD-357) or joining an academy class (PAD-358). */
export function KindStep({
  selected,
  onPick,
}: {
  selected: ClassRequestKind | null;
  onPick: (kind: ClassRequestKind) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium">{t("classRequestWizard.kindStep")}</Text>
      {OPTIONS.map(({ kind, icon }) => (
        <Pressable
          key={kind}
          role="button"
          testID={`wizard-kind-${kind}`}
          accessibilityState={{ selected: selected === kind }}
          onPress={() => onPick(kind)}
          className={cn(
            "flex-row items-start gap-3 rounded-lg border border-border bg-card p-3 active:bg-accent",
            selected === kind && "border-primary"
          )}
        >
          <Ionicons name={icon} size={20} color={lightTheme.primary} />
          <View className="min-w-0 flex-1">
            <Text className="font-medium">{t(`classRequestWizard.kind.${kind}.title`)}</Text>
            <Text className="text-sm text-muted-foreground">
              {t(`classRequestWizard.kind.${kind}.description`)}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
