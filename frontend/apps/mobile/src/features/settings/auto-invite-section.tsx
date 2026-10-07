import { Ionicons } from "@expo/vector-icons";
import { notificationEngineApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import type { InvitationMode, NotificationConfig, NotificationRestrictions } from "@levelup/types";
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
import { EligibilitySection } from "./eligibility-section";
import { EligibilityImpactNote } from "./eligibility-impact-note";
import { RestrictionsSection } from "./restrictions-section";
import { useSectionSave } from "./unsaved-registry";
import type { EligibilityImpactEntry } from "@levelup/types";

/**
 * Auto-Invite Engine basic controls, mirroring the top-level portion of
 * web's NotificationsEngineSection.tsx: the master on/off toggle and the
 * automatic/semi-automatic mode choice, plus Eligibility (PAD-161) and
 * Restrictions (PAD-433, notifications.config rule 14). The other sub-panels
 * (Reminders, Invitation Groups, Tiebreakers, Notify Groups, Message Templates,
 * Standing Waiting List) are deferred — see found_issues.md.
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
// Web's fallbacks (NotificationsEngineSection) for a config saved before these keys existed.
// settings.explicit-save (PAD-506): the engine settings this screen edits and its Save sends.
const ENGINE_FIELDS = [
  "autoNotifyEnabled",
  "invitationMode",
  "eligibilityRules",
  "openSpotsVisible",
  "restrictions",
] as const satisfies readonly (keyof NotificationConfig)[];

const RESTRICTION_FALLBACKS: Partial<NotificationRestrictions> = {
  maxInactiveTime: { enabled: false, value: 120 },
  excludedPlayers: { enabled: false, playerIds: [] },
  excludeUnpaidSubscription: { enabled: false },
  noSameDayClass: { enabled: false },
  cancellationDeadlineHours: 24,
};

export function AutoInviteSection() {
  const { t } = useTranslation();

  // settings.explicit-save (PAD-506), as web's card: every control changes `config` (what the screen
  // holds); `stored` is what the server last confirmed; the screen's one Save sends the difference.
  const [config, setConfig] = React.useState<NotificationConfig | null>(null);
  const [stored, setStored] = React.useState<NotificationConfig | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    notificationEngineApi
      .getNotificationConfig()
      .then((cfg) => {
        if (cancelled) return;
        // Normalize like web: invitationMode always concrete so the control
        // below is fully controlled and never fires a spurious change.
        const loaded = { ...cfg, invitationMode: cfg.invitationMode ?? "automatic" };
        setStored(loaded);
        setConfig(loaded);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // PAD-150 (rule 9b): who the last saved bar would exclude; null = not saved yet.
  const [eligibilityImpact, setEligibilityImpact] =
    React.useState<EligibilityImpactEntry[] | null>(null);
  // Closed by default, like web's collapsible sub-panels.
  const [restrictionsOpen, setRestrictionsOpen] = React.useState(false);

  // A control's change is held (settings.explicit-save rule 2).
  const save = (patch: Partial<NotificationConfig>) => {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  // The fields this screen edits, compared by value (settings.unsaved-edits rule 2).
  const changed: Partial<NotificationConfig> = {};
  if (config && stored) {
    for (const key of ENGINE_FIELDS) {
      if (JSON.stringify(config[key] ?? null) !== JSON.stringify(stored[key] ?? null)) {
        (changed as Record<string, unknown>)[key] = config[key];
      }
    }
  }
  // settings.explicit-save rule 3: one request with what changed.
  useSectionSave("notificationEngine", Object.keys(changed).length > 0, {
    label: t("settings.engine.title"),
    save: async () => {
      if (Object.keys(changed).length === 0) return;
      const patch = changed;
      const saved = await notificationEngineApi.updateNotificationConfig(patch);
      const confirmed: Partial<NotificationConfig> = {};
      for (const key of ENGINE_FIELDS) if (key in saved) (confirmed as Record<string, unknown>)[key] = saved[key];
      setStored((prev) => (prev ? { ...prev, ...patch, ...confirmed } : prev));
      setConfig((prev) => (prev ? { ...prev, ...confirmed } : prev));
      if ("eligibilityRules" in patch) setEligibilityImpact(saved.eligibilityImpact?.affected ?? []);
    },
  });

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
            <View className="flex-row items-center gap-2">
              <Text className="text-sm font-medium">
                {t("settings.engine.automaticNotifications")}
              </Text>
            </View>
            <Text className="text-xs text-muted-foreground">
              {t("settings.engine.automaticNotificationsDescription")}
            </Text>
          </View>
          <Switch
            testID="settings-auto-invite-toggle"
            accessibilityLabel={t("settings.engine.automaticNotifications")}
            checked={config.autoNotifyEnabled}
            onCheckedChange={(val: boolean) => save({ autoNotifyEnabled: val })}
          />
        </View>

        {config.autoNotifyEnabled ? (
          <View className="gap-2">
            <View>
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-medium">
                  {t("settings.engine.invitationMode")}
                </Text>
              </View>
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
                      if (value !== mode) save({ invitationMode: value });
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

        {/* Eligibility — PAD-128, ported to iOS by PAD-161. The minimum bar to
            join a class AT ALL, so unlike the invitation mode above it is NOT
            gated on autoNotifyEnabled: it governs who may join even when the
            coach invites by hand. Web places it above invitation groups for
            the same reason — the groups are an ORDERING on top of this floor,
            not a permission system of their own. */}
        <View className="gap-2 border-t border-border pt-4">
          <View>
            <View className="flex-row items-center gap-2">
              <Text className="text-sm font-medium">
                {t("settings.engine.eligibility")}
              </Text>
            </View>
            <Text className="text-xs text-muted-foreground">
              {t("settings.engine.eligibilityHint")}
            </Text>
          </View>
          <EligibilitySection
            rules={config.eligibilityRules}
            onChange={(eligibilityRules) => save({ eligibilityRules })}
          />
          <EligibilityImpactNote affected={eligibilityImpact} />
          {/* PAD-130: the coach standard of the open-spot toggle. */}
          <View className="mt-3 flex-row items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
            <View className="flex-1 flex-row items-center gap-2">
              <Text className="text-xs">{t("settings.eligibility.openSpots.label")}</Text>
            </View>
            <Switch
              testID="open-spots-visible"
              accessibilityLabel={t("settings.eligibility.openSpots.label")}
              checked={config.openSpotsVisible ?? false}
              onCheckedChange={(openSpotsVisible) => save({ openSpotsVisible })}
            />
          </View>
        </View>

        {/* Restrictions — PAD-433, the port of web's RestrictionsPanel. Visible whatever the
            engine state but disabled while it is off, as web's `disabled` does. */}
        <View className="gap-3 border-t border-border pt-4">
          <Pressable
            testID="settings-restrictions-header"
            accessibilityRole="button"
            accessibilityState={{ expanded: restrictionsOpen }}
            onPress={() => setRestrictionsOpen((open) => !open)}
            className="flex-row items-center justify-between"
          >
            <View className="flex-row items-center gap-2">
              <Text className="text-sm font-medium">{t("settings.engine.restrictions")}</Text>
            </View>
            <Ionicons
              name={restrictionsOpen ? "chevron-up" : "chevron-down"}
              size={16}
              color={lightTheme.mutedForeground}
            />
          </Pressable>
          {restrictionsOpen ? (
            <RestrictionsSection
              restrictions={{ ...RESTRICTION_FALLBACKS, ...config.restrictions }}
              excludedPlayerNames={config.excludedPlayerNames ?? {}}
              disabled={!config.autoNotifyEnabled}
              onChange={(restrictions) => save({ restrictions })}
            />
          ) : null}
        </View>
      </CardContent>
    </Card>
  );
}
