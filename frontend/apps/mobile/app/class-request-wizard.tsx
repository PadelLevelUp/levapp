/**
 * The "Marcar aula" wizard (PAD-357, with PAD-358's academy step): coach → kind
 * → the private class's three steps (people, when, time: classes.class-requests rule 21) or the academy-class step.
 * Mirrors web's ClassRequestWizard; the screen owns the coach, the kind, the private class's one draft, the back bar
 * and the foot (both outside the ScrollView, inside the keyboard-avoiding view), and Android's back.
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
import { queryKeys, usePrivateRequestDraft, type PrivateStep } from "@levelup/hooks";
import * as classRequestsApi from "@levelup/api/src/resources/classRequests";
import { Text } from "@/components/ui/text";
import { keyboardAvoidingBehavior } from "@/lib/keyboard-avoiding";
import { useNativeHeaderKeyboardOffset } from "@/lib/native-header-offset";
import { useScrollToEndOnKeyboard } from "@/lib/scroll-to-end-on-keyboard";
import { AcademyClassStep } from "@/features/class-requests/wizard/AcademyClassStep";
import { CoachStep } from "@/features/class-requests/wizard/CoachStep";
import { KindStep, type ClassRequestKind } from "@/features/class-requests/wizard/KindStep";
import {
  PrivateFoot,
  PrivatePeopleStep,
  PrivateTimeStep,
  PrivateWhenStep,
  usePrivateSend,
} from "@/features/class-requests/wizard/PrivateSteps";
import { useAndroidBack } from "@/lib/android-back";

type Step = "coach" | "kind" | "private" | "academy";

export default function ClassRequestWizardScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [step, setStep] = React.useState<Step>("coach");
  const [coachId, setCoachId] = React.useState<string | null>(null);
  const [kind, setKind] = React.useState<ClassRequestKind | null>(null);
  const [privateStep, setPrivateStep] = React.useState<PrivateStep>("people");
  const draft = usePrivateRequestDraft(coachId ?? "");

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
    if (step === "private" && privateStep === "time") setPrivateStep("when");
    else if (step === "private" && privateStep === "when") setPrivateStep("people");
    else if (step === "private" || step === "academy") setStep("kind");
    else if (step === "kind" && (coaches?.length ?? 0) > 1) setStep("coach");
  };
  const coach = coaches?.find((c) => c.id === coachId) ?? null;
  const keyboardOffset = useNativeHeaderKeyboardOffset();
  // PAD-487: the note is the last field; once the keyboard is up the form scrolls to it.
  const scrollRef = React.useRef<ScrollView>(null);
  const onNoteFocus = useScrollToEndOnKeyboard(() => scrollRef.current?.scrollToEnd({ animated: true }));
  const finish = () => router.back();
  const send = usePrivateSend(draft, coachId ?? "", finish);
  const advance = () => {
    if (!draft.canAdvance() || !draft.stepAnswered(privateStep)) return;
    if (privateStep === "when") draft.confirmDate();
    setPrivateStep(privateStep === "people" ? "when" : "time");
  };
  // Rule 21: a step opens at its top, and the 400 ms lock runs from the commit that shows it.
  React.useLayoutEffect(() => {
    draft.markShown();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, privateStep]);
  // mobile.android-runtime rule 3: Android's back goes one step back past the first screen, then the navigator has it.
  useAndroidBack(canGoBack, back);
  const inPrivate = step === "private" && !!coachId;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={keyboardAvoidingBehavior()}
      // PAD-487: the native header sits above this view; without its height the note is covered.
      keyboardVerticalOffset={keyboardOffset}
    >
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
      {/* Rule 21: the back control sits in a bar under the native header, outside the scrolled content. */}
      <View className="min-h-11 flex-row items-center gap-2 px-4" testID="class-request-wizard">
        {canGoBack ? (
          <Pressable
            testID="wizard-back"
            role="button"
            accessibilityLabel={t("classRequestWizard.back")}
            onPress={back}
            className="h-11 w-11 items-center justify-center rounded-md active:bg-accent"
          >
            <Ionicons name="chevron-back" size={22} color={lightTheme.mutedForeground} />
          </Pressable>
        ) : null}
        <Text className="flex-1 text-sm text-muted-foreground">
          {coach ? t("classRequestWizard.withCoach", { name: coach.name }) : t("classRequestWizard.intro")}
        </Text>
      </View>
      <ScrollView
        ref={scrollRef}
        testID={`class-request-wizard-${step}`}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: inPrivate ? 16 : insets.bottom + 40, gap: 20 }}
      >
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
              if (k === "private") setPrivateStep("people");
              setStep(k);
            }}
          />
        ) : null}
        {inPrivate && privateStep === "people" ? <PrivatePeopleStep draft={draft} /> : null}
        {inPrivate && privateStep === "when" ? <PrivateWhenStep draft={draft} /> : null}
        {inPrivate && privateStep === "time" ? (
          <PrivateTimeStep draft={draft} coachId={coachId} onChangeWhen={() => setPrivateStep("when")} onNoteFocus={onNoteFocus} />
        ) : null}
        {step === "academy" && coachId ? <AcademyClassStep coachId={coachId} onDone={finish} /> : null}
      </ScrollView>
      {inPrivate ? (
        <View className="border-t border-border bg-background px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }} testID="wizard-foot">
          <PrivateFoot
            step={privateStep}
            answered={draft.stepAnswered(privateStep)}
            sending={draft.sending}
            onContinue={advance}
            onSend={() => draft.canAdvance() && void send()}
          />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
