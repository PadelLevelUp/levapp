import { Ionicons } from "@expo/vector-icons";
import { authApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";

type ErrData = { error?: string; field?: string; retryAfterSeconds?: number };
type ApiErr = { response?: { status?: number; data?: ErrData } };

/**
 * auth.parental-consent rule 10 (PAD-198) — mirrors web's GuardianPendingCard.
 * Shown after a minor's sign-up and after a login answered 403
 * GUARDIAN_CONSENT_PENDING. There is no session, so "send again" re-uses the
 * credentials the person just typed.
 */
export function GuardianPendingCard({
  username,
  password,
  info,
  onBack,
}: {
  username: string;
  password: string;
  info: authApi.GuardianPendingInfo;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = React.useState(info.guardianEmail ?? "");
  const [countdown, setCountdown] = React.useState(info.resendAvailableInSeconds ?? 60);
  const [sending, setSending] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const send = async (guardianEmail?: string) => {
    setSending(true);
    setError(null);
    try {
      const res = await authApi.resendGuardianConsent({
        username,
        password,
        ...(guardianEmail ? { guardianEmail } : {}),
      });
      setEmail(res.guardianEmail ?? email);
      setCountdown(res.resendAvailableInSeconds);
      setEditing(false);
      setNewEmail("");
      toast.success(t("auth.guardianPending.sent"));
    } catch (err) {
      const res = (err as ApiErr).response;
      if (res?.status === 429) {
        const seconds = res.data?.retryAfterSeconds ?? 60;
        setCountdown(seconds);
        setError(t("auth.guardianPending.tooSoon", { seconds }));
      } else if (res?.status === 400 && res.data?.field === "guardianEmail") {
        setError(
          res.data.error === "GUARDIAN_EMAIL_IS_OWN"
            ? t("auth.signup.guardianEmailIsOwn")
            : t("auth.signup.guardianEmailInvalid")
        );
      } else {
        setError(t("auth.guardianPending.failed"));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <View className="gap-4" testID="guardian-pending">
      <View className="items-center gap-2">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Ionicons name="shield-checkmark-outline" size={24} color={lightTheme.primary} />
        </View>
        <Text className="text-center text-lg font-semibold text-foreground">{t("auth.guardianPending.title")}</Text>
        <Text className="text-center text-sm text-muted-foreground" testID="guardian-pending-email">
          {t("auth.guardianPending.description", { email })}
        </Text>
      </View>

      {editing ? (
        <View className="gap-1.5">
          <Label>{t("auth.guardianPending.newEmail")}</Label>
          <Input
            testID="guardian-pending-new"
            accessibilityLabel={t("auth.guardianPending.newEmail")}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={newEmail}
            onChangeText={(v) => {
              setNewEmail(v);
              setError(null);
            }}
            editable={!sending}
          />
          <View className="mt-2 flex-row gap-2">
            <Button
              className="flex-1"
              testID="guardian-pending-save"
              disabled={sending || countdown > 0 || !newEmail.trim()}
              onPress={() => void send(newEmail.trim())}
            >
              {sending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text>
                  {countdown > 0
                    ? t("auth.guardianPending.resendIn", { seconds: countdown })
                    : t("auth.guardianPending.save")}
                </Text>
              )}
            </Button>
            <Button variant="outline" disabled={sending} onPress={() => setEditing(false)}>
              <Text>{t("common.cancel")}</Text>
            </Button>
          </View>
        </View>
      ) : (
        <>
          <Button
            variant="outline"
            testID="guardian-pending-resend"
            disabled={sending || countdown > 0}
            onPress={() => void send()}
          >
            <Text>
              {countdown > 0
                ? t("auth.guardianPending.resendIn", { seconds: countdown })
                : t("auth.guardianPending.resend")}
            </Text>
          </Button>
          <Button variant="ghost" testID="guardian-pending-change" onPress={() => setEditing(true)}>
            <Text>{t("auth.guardianPending.change")}</Text>
          </Button>
        </>
      )}

      {error ? (
        <Text className="text-center text-sm text-destructive" testID="guardian-pending-error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Button variant="ghost" testID="guardian-pending-back" onPress={onBack}>
        <Text className="text-muted-foreground">{t("auth.guardianPending.back")}</Text>
      </Button>
    </View>
  );
}
