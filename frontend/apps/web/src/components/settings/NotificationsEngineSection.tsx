import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpDown, Bell, BellRing, ChevronDown, ChevronRight, ClipboardList, Layers, Loader2, MessageSquareText, ShieldAlert, ShieldCheck, Users } from "lucide-react";

import type { InvitationMode, NotificationConfig } from "@/types";
import { getNotificationConfig, updateNotificationConfig } from "@/api/notificationEngine";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

import { RemindersSection } from "./RemindersSection";
import { InvitationGroupsSection, DEFAULT_INVITATION_GROUPS } from "./InvitationGroupsSection";
import { EligibilitySection } from "./EligibilitySection";
import { EligibilityImpactNote } from "./EligibilityImpactNote";
import type { EligibilityImpactEntry } from "@levelup/types";
import { TiebreakersSection, DEFAULT_TIEBREAKERS } from "./TiebreakersSection";
import { RestrictionsPanel } from "./RestrictionsPanel";
import { NotificationGroupsSection } from "./NotificationGroupsSection";
import { MessageTemplatesSection } from "./MessageTemplatesSection";
import { StandingWaitingListSection } from "./StandingWaitingListSection";

type SectionKey = "reminders" | "eligibility" | "groups" | "tiebreakers" | "restrictions" | "notifyGroups" | "standingList" | "templates";

export function NotificationsEngineSection() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<NotificationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const [groupsInitializing, setGroupsInitializing] = useState(false);
  // PAD-150 (rule 9b): who the last saved bar would exclude; `null` = no bar
  // saved yet this visit. Stored as data, never as translated text.
  const [eligibilityImpact, setEligibilityImpact] = useState<EligibilityImpactEntry[] | null>(null);

  useEffect(() => {
    getNotificationConfig()
      // Normalize: invitationMode must always be a concrete value so the
      // RadioGroup is fully controlled and never fires a spurious change.
      .then((cfg) =>
        setConfig({ ...cfg, invitationMode: cfg.invitationMode ?? "automatic" })
      )
      .finally(() => setLoading(false));
  }, []);

  const save = async (patch: Partial<NotificationConfig>) => {
    if (!config) return;
    const updated = { ...config, ...patch };
    setConfig(updated);
    try {
      const saved = await updateNotificationConfig(patch);
      if ("eligibilityRules" in patch) {
        setEligibilityImpact(saved.eligibilityImpact?.affected ?? []);
      }
    } catch {
      // Revert on failure
      setConfig(config);
    }
  };

  const toggleSection = (key: SectionKey) => {
    setOpenSection((prev) => (prev === key ? null : key));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t("settings.engine.loading")}
        </CardContent>
      </Card>
    );
  }

  if (!config) return null;

  const disabled = !config.autoNotifyEnabled;

  function SectionHeader({ sectionKey, icon: Icon, label }: { sectionKey: SectionKey; icon: React.ElementType; label: string }) {
    const isDisabled = disabled && sectionKey !== "notifyGroups" && sectionKey !== "templates";
    return (
      <CollapsibleTrigger
        className={`flex w-full items-center justify-between py-1 text-sm font-medium transition-colors ${
          isDisabled ? "opacity-40 pointer-events-none" : "hover:text-primary"
        }`}
        disabled={isDisabled}
      >
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          {label}
        </span>
        {openSection === sectionKey ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </CollapsibleTrigger>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="w-4 h-4" />
          {t("settings.engine.title")}
        </CardTitle>
        <CardDescription>
          {t("settings.engine.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Master toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t("settings.engine.automaticNotifications")}</p>
            <p className="text-xs text-muted-foreground">
              {t("settings.engine.automaticNotificationsDescription")}
            </p>
          </div>
          <Switch
            checked={config.autoNotifyEnabled}
            onCheckedChange={async (val) => {
              if (val && (config.invitationGroups ?? []).length === 0) {
                setGroupsInitializing(true);
                setOpenSection("groups");
                await new Promise((r) => setTimeout(r, 700));
                await save({ autoNotifyEnabled: true, invitationGroups: DEFAULT_INVITATION_GROUPS });
                setGroupsInitializing(false);
              } else {
                save({ autoNotifyEnabled: val });
              }
            }}
          />
        </div>

        {/* Invitation mode — only relevant when the engine is on */}
        {config.autoNotifyEnabled && (
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">{t("settings.engine.invitationMode")}</p>
              <p className="text-xs text-muted-foreground">
                {t("settings.engine.invitationModeDescription")}
              </p>
            </div>
            <RadioGroup
              value={config.invitationMode ?? "automatic"}
              onValueChange={(value) => {
                // Guard: only persist a real change. The payload is minimal
                // ({invitationMode} only) so this save can never overwrite
                // other config fields (backend patches only provided keys).
                if (value !== (config.invitationMode ?? "automatic")) {
                  save({ invitationMode: value as InvitationMode });
                }
              }}
              className="gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="automatic" id="invitation-mode-automatic" />
                <Label htmlFor="invitation-mode-automatic" className="text-sm font-normal">
                  {t("settings.engine.automatic")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="semi_automatic" id="invitation-mode-semi-automatic" />
                <Label htmlFor="invitation-mode-semi-automatic" className="text-sm font-normal">
                  {t("settings.engine.semiAutomatic")}
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        <Separator />

        {/* Reminders */}
        <Collapsible
          open={openSection === "reminders"}
          onOpenChange={() => toggleSection("reminders")}
        >
          <SectionHeader sectionKey="reminders" icon={Bell} label={t("settings.engine.reminders")} />
          <CollapsibleContent className="pt-1 pb-1">
            <p className="text-xs text-muted-foreground mb-3">
              {t("settings.engine.remindersHint")}
            </p>
            <RemindersSection
              reminderTiming={{
                firstReminder: { type: "hours_before", value: 48 },
                reminderCount: 1,
                hoursBetweenReminders: 4,
                invitationStart: { type: "hours_before", value: 24 },
                ...config.reminderTiming,
              }}
              onChange={(reminderTiming) => save({ reminderTiming })}
              disabled={disabled}
            />
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Eligibility — PAD-128. The minimum bar to join a class at all.
            Sits above invitation groups because the groups are an ORDERING on
            top of this floor, not a permission system of their own. */}
        <Collapsible
          open={openSection === "eligibility"}
          onOpenChange={() => toggleSection("eligibility")}
        >
          <SectionHeader sectionKey="eligibility" icon={ShieldCheck} label={t("settings.engine.eligibility")} />
          <CollapsibleContent className="pt-1 pb-1">
            <p className="text-xs text-muted-foreground mb-3">
              {t("settings.engine.eligibilityHint")}
            </p>
            <EligibilitySection
              rules={config.eligibilityRules}
              onChange={(eligibilityRules) => save({ eligibilityRules })}
              disabled={disabled}
            />
            <EligibilityImpactNote affected={eligibilityImpact} />
            {/* PAD-130 (eligibility.open-spot-visibility rule 3): the coach standard. */}
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <span className="text-xs">{t("settings.eligibility.openSpots.label")}</span>
              <Switch
                checked={config.openSpotsVisible ?? false}
                onCheckedChange={(openSpotsVisible) => save({ openSpotsVisible })}
                disabled={disabled}
                aria-label={t("settings.eligibility.openSpots.label")}
                data-testid="open-spots-visible"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Invitation Groups */}
        <Collapsible
          open={openSection === "groups"}
          onOpenChange={() => toggleSection("groups")}
        >
          <SectionHeader sectionKey="groups" icon={Layers} label={t("settings.engine.invitationGroups")} />
          <CollapsibleContent className="pt-1 pb-1">
            <p className="text-xs text-muted-foreground mb-3">
              {t("settings.engine.invitationGroupsHint")}
            </p>
            {groupsInitializing ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("settings.engine.settingUpGroups")}
              </div>
            ) : (
              <InvitationGroupsSection
                groups={config.invitationGroups ?? []}
                onChange={(invitationGroups) => save({ invitationGroups })}
                disabled={disabled}
              />
            )}
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Tiebreakers */}
        <Collapsible
          open={openSection === "tiebreakers"}
          onOpenChange={() => toggleSection("tiebreakers")}
        >
          <SectionHeader sectionKey="tiebreakers" icon={ArrowUpDown} label={t("settings.engine.tiebreakers")} />
          <CollapsibleContent className="pt-1 pb-1">
            <p className="text-xs text-muted-foreground mb-3">
              {t("settings.engine.tiebreakersHint")}
            </p>
            <TiebreakersSection
              tiebreakers={config.tiebreakers && config.tiebreakers.length > 0 ? config.tiebreakers : DEFAULT_TIEBREAKERS}
              onChange={(tiebreakers) => save({ tiebreakers })}
              disabled={disabled}
            />
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Restrictions */}
        <Collapsible
          open={openSection === "restrictions"}
          onOpenChange={() => toggleSection("restrictions")}
        >
          <SectionHeader sectionKey="restrictions" icon={ShieldAlert} label={t("settings.engine.restrictions")} />
          <CollapsibleContent className="pt-3">
            <RestrictionsPanel
              restrictions={{
                maxInactiveTime: { enabled: false, value: 120 },
                excludedPlayers: { enabled: false, playerIds: [] },
                excludeUnpaidSubscription: { enabled: false },
                cancellationDeadlineHours: 24,
                ...config.restrictions,
              }}
              onChange={(restrictions) => save({ restrictions })}
              disabled={disabled}
            />
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Notify Groups (manual mode) */}
        <Collapsible
          open={openSection === "notifyGroups"}
          onOpenChange={() => toggleSection("notifyGroups")}
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-sm font-medium transition-colors hover:text-primary">
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              {t("settings.engine.notifyGroups")}
            </span>
            {openSection === "notifyGroups" ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <NotificationGroupsSection
              groups={config.notificationGroups ?? []}
              onChange={(notificationGroups) => save({ notificationGroups })}
            />
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Standing Waiting List */}
        <Collapsible
          open={openSection === "standingList"}
          onOpenChange={() => toggleSection("standingList")}
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-sm font-medium transition-colors hover:text-primary">
            <span className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              {t("settings.engine.standingWaitingList")}
            </span>
            {openSection === "standingList" ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <p className="text-xs text-muted-foreground mb-3">
              {t("settings.engine.standingWaitingListHint")}
            </p>
            <StandingWaitingListSection />
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Message Templates */}
        <Collapsible
          open={openSection === "templates"}
          onOpenChange={() => toggleSection("templates")}
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-sm font-medium transition-colors hover:text-primary">
            <span className="flex items-center gap-2">
              <MessageSquareText className="w-4 h-4" />
              {t("settings.engine.messageTemplates")}
            </span>
            {openSection === "templates" ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <MessageTemplatesSection
              templates={{
                reminder: "",
                reminder_followup: "",
                reminder_confirmed: "",
                reminder_declined: "",
                waiting_list_offer: "",
                waiting_list_placed: "",
                ...config.messageTemplates,
              }}
              onChange={(messageTemplates) =>
                setConfig((prev) => prev ? { ...prev, messageTemplates } : prev)
              }
            />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
