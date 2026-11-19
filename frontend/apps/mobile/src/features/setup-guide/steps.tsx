/**
 * PAD-839 (dashboard.student-setup-guide rules 6, 7, 12, 13): steps 1, 2, 4 and 5 on iOS/Android,
 * the twins of the step components in web's `pages/SetupGuidePage.tsx`. Step 3 lives in
 * `StepUnavailability.tsx`.
 */
import { Ionicons } from "@expo/vector-icons";
import { dashboardApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { NotificationsBlockedBanner } from "@/features/notifications/notifications-blocked-banner";
import { setupStepPath } from "./setup-guide-surfaces";
import type { SetupGuide } from "./useSetupGuide";

export function LeaveButton({ onLeave, label, variant = "ghost" }: { onLeave: () => void; label: string; variant?: "ghost" | "default" }) {
  return (
    <Button variant={variant} onPress={onLeave} testID="setup-step-later">
      <Text>{label}</Text>
    </Button>
  );
}

function Box({ title, body, testID }: { title: string; body: string; testID?: string }) {
  return (
    <View className="gap-1 rounded-lg border border-border bg-card p-3" testID={testID}>
      <Text className="text-sm font-medium">{title}</Text>
      <Text className="text-xs text-muted-foreground">{body}</Text>
    </View>
  );
}

/** Rule 6: switch request alerts on straight away (no Settings save), then update the session. */
export function StepRequestAlerts({ guide, onDone, onLeave }: { guide: SetupGuide; onDone: () => void; onLeave: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const items = ["invites", "reminders", "presence", "answers"] as const;

  const enable = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await guide.write({ requestAlerts: true, setupGuideAlertsConfirmed: true });
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-4" testID="setup-alerts">
      <Text className="font-display text-2xl">{t("setupGuide.alerts.title")}</Text>
      <Text className="text-sm text-muted-foreground">{t("setupGuide.alerts.body")}</Text>
      <Text className="text-xs font-sans-semibold tracking-wide text-muted-foreground">{t("setupGuide.alerts.youGet")}</Text>
      <View className="gap-2">
        {items.map((k) => (
          <View key={k} className="flex-row items-center gap-2">
            <Ionicons name="checkmark" size={16} color={lightTheme.success} />
            <Text className="flex-1 text-sm">{t(`setupGuide.alerts.items.${k}`)}</Text>
          </View>
        ))}
      </View>
      <Box title={t("setupGuide.alerts.switchLabel")} body={t("setupGuide.alerts.switchHint")} />
      {failed ? (
        <Text className="text-sm text-destructive" role="alert" testID="setup-alerts-failed">
          {t("setupGuide.alerts.failed")}
        </Text>
      ) : null}
      <Button onPress={() => void enable()} disabled={busy} testID="setup-alerts-enable">
        <Text>{t("setupGuide.alerts.enable")}</Text>
      </Button>
      <LeaveButton onLeave={onLeave} label={t("setupGuide.step.later")} />
    </View>
  );
}

/**
 * Rule 7 on iOS/Android, under OQ-C (a). The step explains first; its button IS the Messages
 * banner (`NotificationsBlockedBanner`): it asks the system only while the permission is
 * undetermined, opens Settings when denied, and re-registers when registration failed. Opening
 * the step never prompts — nothing here calls `requestPermissionsAsync`.
 *
 * When the permission turns granted while the step is open (the banner's grant, or a return from
 * Settings), the step is done and the guide moves on, as web's subscribe does.
 */
export function StepDevicePush({ guide, onDone, onLeave }: { guide: SetupGuide; onDone: () => void; onLeave: () => void }) {
  const { t } = useTranslation();
  const state = guide.device;
  const android = Platform.OS === "android";
  const seen = React.useRef(state);
  React.useEffect(() => {
    const before = seen.current;
    seen.current = state;
    if (state === "done" && before !== undefined && before !== "done") onDone();
  }, [state, onDone]);

  return (
    <View className="gap-4" testID="setup-device" accessibilityValue={{ text: state ?? "unknown" }}>
      <Text className="font-display text-2xl">
        {android ? t("setupGuide.device.titleAndroid") : t("setupGuide.device.titleIos")}
      </Text>
      <Text className="text-sm text-muted-foreground">{t("setupGuide.device.body")}</Text>
      {state === "ask" ? (
        <View className="gap-1" testID="setup-device-how-to">
          <Text className="text-xs font-sans-semibold tracking-wide text-muted-foreground">{t("setupGuide.device.howTo")}</Text>
          <Text className="text-sm">{`1. ${t("setupGuide.device.howToTap")}`}</Text>
          <Text className="text-sm">
            {`2. ${android ? t("setupGuide.device.hintAndroid") : t("setupGuide.device.hintIos")}`}
          </Text>
        </View>
      ) : null}
      {state === "open_settings" ? (
        <Box
          testID={android ? "setup-device-path-android" : "setup-device-path-ios"}
          title={t("setupGuide.device.deniedTitle")}
          body={android ? t("setupGuide.device.deniedAndroid") : t("setupGuide.device.deniedIos")}
        />
      ) : null}
      {state === "done" ? (
        <Text className="text-sm text-success" testID="setup-device-done">
          {t("setupGuide.device.doneBody")}
        </Text>
      ) : null}
      {/* The step's button: the Messages banner itself (rule 7; messaging.push-notifications rule 15). */}
      {/* Only while the step is not done: a granted permission renders no banner, and an empty
          bordered box would be left behind. */}
      {state !== "done" ? (
        <View className="overflow-hidden rounded-lg border border-border">
          <NotificationsBlockedBanner />
        </View>
      ) : null}
      <LeaveButton onLeave={onLeave} label={t("setupGuide.step.later")} />
    </View>
  );
}

/** Rule 12: a coach's link links the student by itself; otherwise the existing connect flow. */
export function StepCoachLink({ onLeave }: { onLeave: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const coaches = user?.coaches ?? [];
  return (
    <View className="gap-4" testID="setup-coach">
      <Text className="font-display text-2xl">{t("setupGuide.coach.title")}</Text>
      <Text className="text-sm text-muted-foreground">{t("setupGuide.coach.body")}</Text>
      {coaches.length > 0 ? (
        <Text className="text-sm text-success" testID="setup-coach-linked">
          {t("setupGuide.coach.linked", { names: coaches.map((c) => c.name).join(", ") })}
        </Text>
      ) : null}
      <Box title={t("setupGuide.coach.linkTitle")} body={t("setupGuide.coach.linkBody")} />
      <Box title={t("setupGuide.coach.noCoachTitle")} body={t("setupGuide.coach.noCoachBody")} />
      <Button testID="setup-connect" onPress={() => router.push("/connect")}>
        <Text>{t("setupGuide.coach.connect")}</Text>
      </Button>
      <LeaveButton onLeave={onLeave} label={t("setupGuide.coach.later")} />
    </View>
  );
}

/**
 * Rule 13: each linked coach's level and side (from `/auth/me`), "Por definir" when unset; one
 * "Lembrar treinador" per coach the dashboard lists as incomplete and remindable. The student can
 * never mark this step done.
 */
export function StepProfile({ guide, onLeave }: { guide: SetupGuide; onLeave: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const coaches = user?.coaches ?? [];
  const [sentNow, setSentNow] = React.useState<Set<number>>(() => new Set());
  const [sending, setSending] = React.useState<number | null>(null);
  const [failed, setFailed] = React.useState<number | null>(null);
  const incomplete = new Map(guide.incompleteCoaches.map((c) => [c.coachId, c]));
  const anyReminded = guide.incompleteCoaches.some((c) => c.remindedToday) || sentNow.size > 0;

  const remind = async (coachId: number) => {
    setSending(coachId);
    setFailed(null);
    try {
      await dashboardApi.sendProfileReminder(coachId);
      setSentNow((prev) => new Set(prev).add(coachId));
    } catch (error) {
      const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === "already_reminded") setSentNow((prev) => new Set(prev).add(coachId));
      else setFailed(coachId);
    } finally {
      setSending(null);
    }
  };

  return (
    <View className="gap-4" testID="setup-profile">
      <Text className="font-display text-2xl">{t("setupGuide.profile.title")}</Text>
      <Text className="text-sm text-muted-foreground">{t("setupGuide.profile.body")}</Text>
      {coaches.length === 0 ? (
        <View className="gap-2">
          <Text className="text-sm" testID="setup-profile-no-coach">
            {t("setupGuide.profile.noCoach")}
          </Text>
          {/* Rule 13: with no coach, step 5 sends the student to step 4. */}
          <Button variant="outline" testID="setup-profile-to-coach" onPress={() => router.replace(setupStepPath("coach_link") as never)}>
            <Text>{t("setupGuide.coach.connect")}</Text>
          </Button>
        </View>
      ) : null}
      {guide.view.steps.profile === "done" ? (
        <Text className="text-sm text-success" testID="setup-profile-all-set">
          {t("setupGuide.profile.allSet")}
        </Text>
      ) : null}
      {coaches.map((c) => {
        const entry = incomplete.get(c.id);
        const reminded = Boolean(entry?.remindedToday) || sentNow.has(c.id);
        return (
          <View key={c.id} className="gap-2 rounded-lg border border-border bg-card p-3" testID={`setup-profile-coach-${c.id}`}>
            <Text className="text-sm">
              <Text className="text-muted-foreground">{`${t("setupGuide.profile.coach")}: `}</Text>
              <Text className="font-medium">{c.name}</Text>
            </Text>
            <View className="flex-row gap-2">
              <Text className="flex-1 text-sm" testID={`setup-profile-level-${c.id}`}>
                <Text className="text-muted-foreground">{`${t("setupGuide.profile.level")}: `}</Text>
                {c.level ?? t("setupGuide.profile.unset")}
              </Text>
              <Text className="flex-1 text-sm" testID={`setup-profile-side-${c.id}`}>
                <Text className="text-muted-foreground">{`${t("setupGuide.profile.side")}: `}</Text>
                {c.side ? t(`setupGuide.profile.sides.${c.side}`) : t("setupGuide.profile.unset")}
              </Text>
            </View>
            {entry && entry.canRemind !== false ? (
              reminded ? (
                <Text className="text-sm text-success" testID={`setup-reminded-${c.id}`}>
                  {t("setupGuide.profile.reminded", { coach: c.name })}
                </Text>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={sending === c.id}
                    onPress={() => void remind(c.id)}
                    testID={`setup-remind-${c.id}`}
                  >
                    <Text>{t("setupGuide.profile.remind")}</Text>
                  </Button>
                  <Text className="text-xs text-muted-foreground">{t("setupGuide.profile.remindHint", { coach: c.name })}</Text>
                </>
              )
            ) : null}
            {failed === c.id ? (
              <Text className="text-sm text-destructive" role="alert">
                {t("setupGuide.profile.remindFailed")}
              </Text>
            ) : null}
          </View>
        );
      })}
      <LeaveButton
        variant={anyReminded ? "default" : "ghost"}
        onLeave={onLeave}
        label={anyReminded ? t("setupGuide.profile.toDashboard") : t("setupGuide.profile.finishLater")}
      />
    </View>
  );
}
