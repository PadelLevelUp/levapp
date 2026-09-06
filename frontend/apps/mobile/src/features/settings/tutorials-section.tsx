import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { UnderstandInvitesTutorial } from "@/features/settings/understand-invites-tutorial";

/**
 * PAD-196 — Settings › Tutorials (settings.tutorials rules 1–2, 7).
 *
 * Mirrors web's TutorialsSection: a static registry of walkthroughs rendered
 * as rows, drilled into in place with a back control (the same pattern the
 * Settings screen itself uses). v1 has one entry, "Understand invites".
 */
type TutorialId = "understand-invites";

type TutorialDef = {
  id: TutorialId;
  titleKey: string;
  descriptionKey: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const TUTORIALS: readonly TutorialDef[] = [
  {
    id: "understand-invites",
    titleKey: "tutorials.understandInvites.title",
    descriptionKey: "tutorials.understandInvites.description",
    icon: "paper-plane-outline",
  },
];

export function TutorialsSection() {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState<TutorialId | null>(null);

  if (open === "understand-invites") {
    return (
      <View className="gap-3">
        <Pressable
          testID="tutorial-back"
          accessibilityLabel={t("tutorials.back")}
          role="button"
          onPress={() => setOpen(null)}
          className="flex-row items-center gap-1.5 self-start py-1 active:opacity-70"
        >
          <Ionicons name="chevron-back" size={18} color={lightTheme.mutedForeground} />
          <Text className="text-sm font-medium text-muted-foreground">
            {t("tutorials.back")}
          </Text>
        </Pressable>
        <UnderstandInvitesTutorial />
      </View>
    );
  }

  return (
    <Card testID="settings-tutorials">
      <CardHeader>
        <CardTitle>{t("tutorials.title")}</CardTitle>
        <CardDescription>{t("tutorials.description")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-1">
        {TUTORIALS.map((tutorial) => (
          <Pressable
            key={tutorial.id}
            testID={`tutorial-${tutorial.id}`}
            accessibilityLabel={t(tutorial.titleKey)}
            role="button"
            onPress={() => setOpen(tutorial.id)}
            className="flex-row items-center gap-3 rounded-lg border border-border p-3 active:bg-accent"
          >
            <Ionicons name={tutorial.icon} size={20} color={lightTheme.primary} />
            <View className="min-w-0 flex-1">
              <Text className="text-base font-medium">{t(tutorial.titleKey)}</Text>
              <Text className="text-xs text-muted-foreground" numberOfLines={2}>
                {t(tutorial.descriptionKey)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={lightTheme.mutedForeground} />
          </Pressable>
        ))}
      </CardContent>
    </Card>
  );
}
