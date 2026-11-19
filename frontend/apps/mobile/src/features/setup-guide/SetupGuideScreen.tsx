/**
 * PAD-839 (dashboard.student-setup-guide rules 5–8, 12, 13): the setup guide's screen on
 * iOS/Android, the twin of web's `pages/SetupGuidePage.tsx`. `app/setup-guide.tsx` routes here:
 * with no step it lists the five; with `step` it opens that step.
 *
 * Rule 5: finishing or skipping a step goes to the next pending step after it, in order (done
 * steps are skipped); past the last one the guide returns to the dashboard. "Saltar" (not on step
 * 5) and each step's leave button write nothing. Moving between steps replaces the screen, so the
 * stack stays dashboard → guide and leaving is one step back.
 */
import { Ionicons } from "@expo/vector-icons";
import { SETUP_GUIDE_STEPS, lightTheme, nextPendingStepAfter, type SetupGuideStep } from "@levelup/config";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { SetupGuideBar, SetupGuideStepList, setupStepPath } from "./setup-guide-surfaces";
import { StepUnavailability } from "./StepUnavailability";
import { StepCoachLink, StepDevicePush, StepProfile, StepRequestAlerts } from "./steps";
import { useSetupGuide } from "./useSetupGuide";

export function isSetupGuideStep(value: unknown): value is SetupGuideStep {
  return typeof value === "string" && (SETUP_GUIDE_STEPS as readonly string[]).includes(value);
}

/** Back to wherever the guide was opened from (the dashboard), or the dashboard itself. */
function leaveGuide() {
  if (router.canGoBack()) router.back();
  else router.replace("/(tabs)/dashboard");
}

function HeaderButton({ testID, label, onPress, icon }: { testID: string; label: string; onPress: () => void; icon: "chevron-back" | "close" }) {
  return (
    <Pressable testID={testID} role="button" accessibilityLabel={label} onPress={onPress} style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon} size={22} color={lightTheme.foreground} />
    </Pressable>
  );
}

export function SetupGuideScreen({ step }: { step: SetupGuideStep | null }) {
  const { t } = useTranslation();
  const guide = useSetupGuide();
  const { view } = guide;

  if (!step) {
    return (
      <Screen edges={["top", "bottom"]} testID="setup-guide-overview">
        <View className="flex-row items-center px-2">
          <HeaderButton testID="setup-guide-overview-close" label={t("setupGuide.step.back")} icon="close" onPress={leaveGuide} />
        </View>
        <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4 pb-8">
          <Text className="font-display text-2xl">{t("setupGuide.sheet.title")}</Text>
          {view.percent !== null ? (
            <Text className="text-sm text-muted-foreground" testID="setup-guide-progress">
              {t("setupGuide.progress", { done: view.doneCount, percent: view.percent })}
            </Text>
          ) : null}
          <SetupGuideBar view={view} />
          <SetupGuideStepList view={view} />
          {view.next ? (
            <Button testID="setup-guide-overview-continue" onPress={() => router.replace(setupStepPath(view.next) as never)}>
              <Text>{t("setupGuide.card.continue")}</Text>
            </Button>
          ) : null}
        </ScrollView>
      </Screen>
    );
  }

  /** Rule 5: the next pending step after this one, or back to the dashboard past the last. */
  const goNext = () => {
    const next = nextPendingStepAfter(view, step);
    if (next) router.replace(setupStepPath(next) as never);
    else leaveGuide();
  };
  const n = SETUP_GUIDE_STEPS.indexOf(step) + 1;

  return (
    <Screen edges={["top", "bottom"]} testID={`setup-step-${step}`}>
      <View className="flex-row items-center justify-between px-2">
        <HeaderButton
          testID="setup-step-back"
          label={t("setupGuide.step.back")}
          icon="chevron-back"
          onPress={() => router.replace(setupStepPath(null) as never)}
        />
        <Text className="text-sm text-muted-foreground" testID="setup-step-counter">
          {t("setupGuide.step.counter", { n })}
        </Text>
        {step !== "profile" ? (
          <Button variant="ghost" size="sm" onPress={goNext} testID="setup-step-skip">
            <Text>{t("setupGuide.step.skip")}</Text>
          </Button>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-8">
        {step === "request_alerts" ? <StepRequestAlerts guide={guide} onDone={goNext} onLeave={leaveGuide} /> : null}
        {step === "device_push" ? <StepDevicePush guide={guide} onDone={goNext} onLeave={leaveGuide} /> : null}
        {step === "unavailability" ? <StepUnavailability guide={guide} onDone={goNext} onLeave={leaveGuide} /> : null}
        {step === "coach_link" ? <StepCoachLink onLeave={leaveGuide} /> : null}
        {step === "profile" ? <StepProfile guide={guide} onLeave={leaveGuide} /> : null}
      </ScrollView>
    </Screen>
  );
}
