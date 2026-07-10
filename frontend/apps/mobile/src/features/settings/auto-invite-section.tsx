import { notificationEngineApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import type { InvitationMode, NotificationConfig } from "@levelup/types";
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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * Auto-Invite Engine basic controls, mirroring the top-level portion of
 * web's NotificationsEngineSection.tsx: the master on/off toggle and the
 * automatic/semi-automatic mode choice. The seven sub-panels (Reminders,
 * Invitation Groups, Tiebreakers, Restrictions, Notify Groups, Message
 * Templates, Standing Waiting List) are deferred — see found_issues.md.
 *
 * Simplification vs. web: web's master toggle special-cases turning the
 * engine on with zero invitationGroups configured (auto-seeds
 * DEFAULT_INVITATION_GROUPS, which lives in the deferred InvitationGroupsSection).
 * Since that panel isn't ported here, this toggle just persists
 * autoNotifyEnabled directly — a coach enabling the engine from mobile with
 * no groups yet configured will need to set groups up on web, same as today.
 *
 * No @rn-primitives/radio-group is installed, so the automatic/semi-automatic
 * choice is a two-option segmented control built on Pressable instead of
 * porting web's RadioGroup 1:1.
 */
export function AutoInviteSection() {
  const { t } = useTranslation();

  const [config, setConfig] = React.useState<NotificationConfig | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    notificationEngineApi
      .getNotificationConfig()
      .then((cfg) => {
        if (cancelled) return;
        // Normalize like web: invitationMode always concrete so the control
        // below is fully controlled and never fires a spurious change.
        setConfig({ ...cfg, invitationMode: cfg.invitationMode ?? "automatic" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (patch: Partial<NotificationConfig>) => {
    if (!config) return;
    const previous = config;
    setConfig({ ...config, ...patch });
    try {
      await notificationEngineApi.updateNotificationConfig(patch);
    } catch {
      setConfig(previous);
    }
  };

  if (loading) {
    return (
      <Card testID="settings-auto-invite">
        <CardContent className="items-center py-8">
          <Spinner />
        </CardContent>
      </Card>
    );
  }

  if (!config) return null;

  const mode = config.invitationMode ?? "automatic";

  return (
    <Card testID="settings-auto-invite">
      <CardHeader>
        <CardTitle>{t("settings.engine.title")}</CardTitle>
        <CardDescription>{t("settings.engine.description")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-sm font-medium">
              {t("settings.engine.automaticNotifications")}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {t("settings.engine.automaticNotificationsDescription")}
            </Text>
          </View>
          <Switch
            testID="settings-auto-invite-toggle"
            accessibilityLabel={t("settings.engine.automaticNotifications")}
            checked={config.autoNotifyEnabled}
            onCheckedChange={(val: boolean) => void save({ autoNotifyEnabled: val })}
          />
        </View>

        {config.autoNotifyEnabled ? (
          <View className="gap-2">
            <View>
              <Text className="text-sm font-medium">
                {t("settings.engine.invitationMode")}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {t("settings.engine.invitationModeDescription")}
              </Text>
            </View>
            <View className="flex-row gap-2">
              {(
                [
                  ["automatic", t("settings.engine.automatic")],
                  ["semi_automatic", t("settings.engine.semiAutomatic")],
                ] as [InvitationMode, string][]
              ).map(([value, label]) => {
                const isSelected = mode === value;
                return (
                  <Pressable
                    key={value}
                    testID={
                      value === "automatic"
                        ? "settings-invite-mode-automatic"
                        : "settings-invite-mode-semi"
                    }
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={label}
                    onPress={() => {
                      if (value !== mode) void save({ invitationMode: value });
                    }}
                    className={cn(
                      "flex-1 items-center rounded-md border px-3 py-2.5",
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-input bg-background"
                    )}
                  >
                    <Text
                      className={cn(
                        "text-sm font-medium",
                        isSelected ? "text-primary" : "text-foreground"
                      )}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </CardContent>
    </Card>
  );
}
