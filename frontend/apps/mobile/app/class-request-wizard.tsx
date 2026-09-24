/**
 * The "Marcar aula" wizard (PAD-357, with PAD-358's academy step): coach → kind
 * → the private-class step or the academy-class step. Mirrors web's
 * ClassRequestWizard; the steps own their data, the shell owns the coach, the
 * kind and back.
 *
 * A screen pushed on the root stack rather than a sheet (web uses a bottom
 * sheet): the wizard is a long form with pickers, and PAD-356's block sheet —
 * a native Modal — crashed on className swaps that a normal screen tolerates.
 */
import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { useQuery } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as React from "react";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { queryKeys } from "@levelup/hooks";
import * as classRequestsApi from "@levelup/api/src/resources/classRequests";
import { Text } from "@/components/ui/text";
import { keyboardAvoidingBehavior } from "@/lib/keyboard-avoiding";
import { AcademyClassStep } from "@/features/class-requests/wizard/AcademyClassStep";
import { CoachStep } from "@/features/class-requests/wizard/CoachStep";
import { KindStep, type ClassRequestKind } from "@/features/class-requests/wizard/KindStep";
import { PrivateClassStep } from "@/features/class-requests/wizard/PrivateClassStep";

type Step = "coach" | "kind" | "private" | "academy";

export default function ClassRequestWizardScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [step, setStep] = React.useState<Step>("coach");
  const [coachId, setCoachId] = React.useState<string | null>(null);
  const [kind, setKind] = React.useState<ClassRequestKind | null>(null);

  const coachesQuery = useQuery({
    queryKey: queryKeys.classRequestCoaches,
    queryFn: classRequestsApi.listClassRequestCoaches,
  });
  const coaches = coachesQuery.data ?? (coachesQuery.isError ? [] : null);

  // One coach: skip the choice that has only one answer.
  React.useEffect(() => {
    if (coaches && coaches.length === 1 && step === "coach" && !coachId) {
      setCoachId(coaches[0].id);
      setStep("kind");
    }
  }, [coaches, step, coachId]);

  const canGoBack =
    step === "private" || step === "academy" || (step === "kind" && (coaches?.length ?? 0) > 1);
  const back = () => {
    if (step === "private" || step === "academy") setStep("kind");
    else if (step === "kind" && (coaches?.length ?? 0) > 1) setStep("coach");
  };
  const coach = coaches?.find((c) => c.id === coachId) ?? null;
  const finish = () => router.back();

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={keyboardAvoidingBehavior()}>
      {/* mobile.status-bar rule 4 (PAD-419): this route paints its own navy top, so it sets light content while shown. */}
      <StatusBar style="light" />
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: "minimal",
          headerTitle: t("classRequestWizard.title"),
          headerStyle: { backgroundColor: lightTheme.sidebarBackground },
          headerTintColor: lightTheme.sidebarForeground,
          headerTitleStyle: { fontWeight: "700" },
        }}
      />
      <ScrollView
        testID={`class-request-wizard-${step}`}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 20 }}
      >
        <View className="flex-row items-center gap-2" testID="class-request-wizard">
          {canGoBack ? (
            <Pressable
              testID="wizard-back"
              role="button"
              accessibilityLabel={t("classRequestWizard.back")}
              hitSlop={8}
              onPress={back}
              className="h-9 w-9 items-center justify-center rounded-md active:bg-accent"
            >
              <Ionicons name="chevron-back" size={20} color={lightTheme.mutedForeground} />
            </Pressable>
          ) : null}
          <Text className="flex-1 text-sm text-muted-foreground">
            {coach ? t("classRequestWizard.withCoach", { name: coach.name }) : t("classRequestWizard.intro")}
          </Text>
        </View>

        {step === "coach" ? (
          <CoachStep
            coaches={coaches}
            selected={coachId}
            onPick={(id) => {
              setCoachId(id);
              setStep("kind");
            }}
          />
        ) : null}
        {step === "kind" && coachId ? (
          <KindStep
            selected={kind}
            onPick={(k) => {
              setKind(k);
              setStep(k);
            }}
          />
        ) : null}
        {step === "private" && coachId ? <PrivateClassStep coachId={coachId} onDone={finish} /> : null}
        {step === "academy" && coachId ? <AcademyClassStep coachId={coachId} onDone={finish} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
