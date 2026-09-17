import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import type { ClassRequestCoach } from "@levelup/api/src/resources/classRequests";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/** Step 1, "Treinador": the coaches the student trains with (mirrors web's CoachStep). */
export function CoachStep({
  coaches,
  selected,
  onPick,
}: {
  coaches: ClassRequestCoach[] | null;
  selected: string | null;
  onPick: (coachId: string) => void;
}) {
  const { t } = useTranslation();
  if (coaches === null) return <Spinner size="small" />;
  if (coaches.length === 0) {
    return (
      <Text className="text-sm text-muted-foreground" testID="wizard-no-coaches">
        {t("classRequests.noCoaches")}
      </Text>
    );
  }
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium">{t("classRequestWizard.coachStep")}</Text>
      {coaches.map((c) => (
        <Pressable
          key={c.id}
          role="button"
          testID={`wizard-coach-${c.id}`}
          accessibilityState={{ selected: selected === c.id }}
          onPress={() => onPick(c.id)}
          className={cn(
            "rounded-lg border border-border bg-card p-3 active:bg-accent",
            selected === c.id && "border-primary"
          )}
        >
          <Text className="font-medium">{c.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}
