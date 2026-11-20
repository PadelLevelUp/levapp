/**
 * PAD-839 (dashboard.student-setup-guide rule 4): the guide's dashboard surfaces on iOS/Android —
 * the first-login sheet, the compact card (a skeleton while a step is unknown, rule 3a) and the
 * "Conta pronta" card. Twin of web's `SetupGuideSurfaces.tsx`: which of them shows is
 * `setupGuideState`'s answer; these components only draw it and send the guide's writes.
 */
import { Ionicons } from "@expo/vector-icons";
import { SETUP_GUIDE_STEPS, lightTheme, type SetupGuideStep, type SetupGuideView } from "@levelup/config";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useSetupGuide, type SetupGuide } from "./useSetupGuide";

/** The guide's screen for one step (rule 5); the overview with no step. */
export function setupStepPath(step: SetupGuideStep | null): string {
  return step ? `/setup-guide?step=${step}` : "/setup-guide";
}

/** The 5-part bar: green for a done step, blue for the current one, grey for the rest. */
export function SetupGuideBar({ view }: { view: SetupGuideView }) {
  return (
    <View className="flex-row gap-1" testID="setup-guide-bar" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {SETUP_GUIDE_STEPS.map((s) => {
        const state = view.steps[s];
        const color =
          state === "done" ? lightTheme.success : state === "pending" && s === view.next ? lightTheme.primary : lightTheme.muted;
        return (
          <View
            key={s}
            testID={`setup-guide-bar-${s}`}
            accessibilityValue={{ text: state }}
            style={{ height: 6, flex: 1, borderRadius: 999, backgroundColor: color, opacity: state === "unknown" ? 0.6 : 1 }}
          />
        );
      })}
    </View>
  );
}

/** The five steps as the sheet and the overview list them. */
export function SetupGuideStepList({ view }: { view: SetupGuideView }) {
  const { t } = useTranslation();
  return (
    <View className="gap-2" testID="setup-guide-steps">
      {SETUP_GUIDE_STEPS.map((s, i) => {
        const done = view.steps[s] === "done";
        return (
          <View
            key={s}
            testID={`setup-guide-step-${s}`}
            accessibilityValue={{ text: view.steps[s] }}
            className="flex-row items-center gap-3 rounded-lg border border-border p-3"
          >
            <View
              style={{
                height: 24,
                width: 24,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: done ? lightTheme.success : lightTheme.muted,
              }}
            >
              {done ? (
                <Ionicons name="checkmark" size={14} color={lightTheme.successForeground} />
              ) : (
                <Text className="text-xs text-muted-foreground">{i + 1}</Text>
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-medium">{t(`setupGuide.steps.${s}.title`)}</Text>
              <Text className="text-xs text-muted-foreground">{t(`setupGuide.steps.${s}.hint`)}</Text>
            </View>
            {done ? (
              <Text className="text-xs font-medium text-success">{t("setupGuide.done")}</Text>
            ) : s === view.next ? (
              <Text className="text-xs font-medium text-primary">{t("setupGuide.next")}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function SetupGuideCard({ guide }: { guide: SetupGuide }) {
  const { t } = useTranslation();
  const { view } = guide;
  const [closing, setClosing] = React.useState(false);

  if (view.showReady) {
    return (
      <View testID="setup-guide-ready" className="gap-2 rounded-xl border border-success/40 bg-success/5 p-4">
        <Text className="text-xs font-sans-semibold tracking-wide text-success">{t("setupGuide.ready.eyebrow")}</Text>
        <Text className="font-display text-lg">{t("setupGuide.ready.title")}</Text>
        <Text className="text-sm text-muted-foreground">{t("setupGuide.ready.body")}</Text>
        <View className="flex-row">
          <Button
            size="sm"
            variant="outline"
            disabled={closing}
            testID="setup-guide-ready-close"
            onPress={async () => {
              setClosing(true);
              try {
                await guide.write({ setupGuideReadyClosed: true });
              } catch {
                // Stays shown; the student can close it again.
              } finally {
                setClosing(false);
              }
            }}
          >
            <Text>{t("setupGuide.ready.close")}</Text>
          </Button>
        </View>
      </View>
    );
  }
  if (!view.showCard) return null;

  if (view.percent === null) {
    return (
      <View
        testID="setup-guide-card"
        accessibilityValue={{ text: "loading" }}
        accessibilityState={{ busy: true }}
        className="gap-3 rounded-xl border border-border bg-card p-4"
      >
        <Text className="text-sm text-muted-foreground">{t("setupGuide.card.loading")}</Text>
        <SetupGuideBar view={view} />
      </View>
    );
  }

  const open = () => router.push(setupStepPath(view.next) as never);
  return (
    <Pressable
      testID="setup-guide-card"
      accessibilityValue={{ text: "ready", now: view.percent, min: 0, max: 100 }}
      onPress={open}
      className="gap-3 rounded-xl border border-primary/30 bg-card p-4"
    >
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="text-xs font-sans-semibold tracking-wide text-muted-foreground">
          {t("setupGuide.card.eyebrow", { done: view.doneCount })}
        </Text>
        <Text className="font-display text-lg" testID="setup-guide-percent">
          {`${view.percent}%`}
        </Text>
      </View>
      <Text className="font-display text-base">{t("setupGuide.card.title")}</Text>
      <SetupGuideBar view={view} />
      {view.next ? (
        <Text className="text-sm text-muted-foreground" testID="setup-guide-next">
          {t("setupGuide.card.nextLabel", { step: t(`setupGuide.steps.${view.next}.title`) })}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        <Button size="sm" onPress={open} testID="setup-guide-continue">
          <Text>{t("setupGuide.card.continue")}</Text>
        </Button>
        <Button size="sm" variant="ghost" onPress={() => router.push(setupStepPath(null) as never)} testID="setup-guide-all">
          <Text>{t("setupGuide.card.all")}</Text>
        </Button>
      </View>
    </Pressable>
  );
}

/**
 * The first-login sheet, a native Modal (bottom panel over a dimmed backdrop). Closing it in any
 * way except "Não mostrar mais" snoozes it (rule 4): "Agora não", "Começar" (which also opens the
 * next pending step), a tap on the backdrop, or the system close (`onRequestClose`: Android back).
 * One close sends ONE snooze: the guard keeps a second tap during the close from writing again.
 *
 * Inside the Modal every visual is static or driven by `style` (rn-code: class swaps inside a
 * native Modal once crashed the blocker sheet).
 */
export function SetupGuideSheet({ guide }: { guide: SetupGuide }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { view } = guide;
  const [dismissed, setDismissed] = React.useState(false);
  const closedRef = React.useRef(false);
  const open = view.showSheet && !dismissed;
  // The dashboard tab stays mounted: once the snooze (or hide) has landed and the sheet no longer
  // should show, re-arm it, so it can open again after the next Lisbon midnight.
  React.useEffect(() => {
    if (!view.showSheet && dismissed) {
      setDismissed(false);
      closedRef.current = false;
    }
  }, [view.showSheet, dismissed]);

  const close = (then?: () => void) => {
    if (closedRef.current) return;
    closedRef.current = true;
    setDismissed(true);
    void guide.write({ setupGuideSnooze: true }).catch(() => undefined);
    then?.();
  };

  if (!open) return null;
  return (
    <Modal transparent visible animationType="slide" onRequestClose={() => close()}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          testID="setup-guide-backdrop"
          accessibilityLabel={t("setupGuide.sheet.later")}
          onPress={() => close()}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)" }}
        />
        <View
          testID="setup-guide-sheet"
          className="gap-4 rounded-t-2xl bg-card px-5 pt-5"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="gap-1">
            <Text className="text-xs font-sans-semibold tracking-wide text-muted-foreground">{t("setupGuide.sheet.eyebrow")}</Text>
            <Text className="font-display text-2xl">{t("setupGuide.sheet.title")}</Text>
            <Text className="text-sm text-muted-foreground">{t("setupGuide.sheet.body")}</Text>
          </View>
          <View className="gap-3">
            <Text className="text-sm" testID="setup-guide-progress">
              {t("setupGuide.progress", { done: view.doneCount, percent: view.percent ?? 0 })}
            </Text>
            <SetupGuideBar view={view} />
            <SetupGuideStepList view={view} />
          </View>
          <View className="gap-2">
            <Button testID="setup-guide-start" onPress={() => close(() => router.push(setupStepPath(view.next) as never))}>
              <Text>{t("setupGuide.sheet.start")}</Text>
            </Button>
            <Button variant="outline" testID="setup-guide-later" onPress={() => close()}>
              <Text>{t("setupGuide.sheet.later")}</Text>
            </Button>
            <Button
              variant="ghost"
              testID="setup-guide-hide"
              onPress={() => {
                if (closedRef.current) return;
                closedRef.current = true;
                setDismissed(true);
                void guide.write({ setupGuideHidden: true }).catch(() => undefined);
              }}
            >
              <Text>{t("setupGuide.sheet.hide")}</Text>
            </Button>
            <Text className="text-center text-xs text-muted-foreground">{t("setupGuide.sheet.footer")}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DashboardGuide() {
  const guide = useSetupGuide();
  return (
    <>
      <SetupGuideSheet guide={guide} />
      <SetupGuideCard guide={guide} />
    </>
  );
}

/** The student dashboard's guide: the first-login sheet and the card (rule 4). Never for a coach. */
export function SetupGuideOnDashboard() {
  const { user } = useAuth();
  const student = user != null && !(user.roles ?? []).includes("coach");
  return student ? <DashboardGuide /> : null;
}
