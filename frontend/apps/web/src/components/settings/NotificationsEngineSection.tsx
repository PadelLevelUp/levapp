import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpDown, Bell, BellRing, ChevronDown, ChevronRight, ClipboardList, Layers, Loader2, MessageSquareText, ShieldAlert, ShieldCheck, Users } from "lucide-react";

import type { InvitationMode, NotificationConfig } from "@/types";
import { PAST_DUE_SEND_MAX, getNotificationConfig, sendPastDueReminders, updateNotificationConfig } from "@/api/notificationEngine";
import type { PastDue, PastDueSendResult } from "@/api/notificationEngine";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

import { RemindersSection } from "./RemindersSection";
import { PastDueRemindersDialog } from "./PastDueRemindersDialog";
import { InvitationGroupsSection, DEFAULT_INVITATION_GROUPS } from "./InvitationGroupsSection";
import { EligibilitySection } from "./EligibilitySection";
import { EligibilityImpactNote } from "./EligibilityImpactNote";
import type { EligibilityImpactEntry } from "@levelup/types";
import { TiebreakersSection, DEFAULT_TIEBREAKERS } from "./TiebreakersSection";
import { RestrictionsPanel } from "./RestrictionsPanel";
import { NotificationGroupsSection } from "./NotificationGroupsSection";
import { MessageTemplatesSection } from "./MessageTemplatesSection";
import { StandingWaitingListSection } from "./StandingWaitingListSection";
import { useTabSave } from "@/context/SettingsUnsavedContext";

// settings.explicit-save (PAD-506): the engine settings this card edits and its Save sends.
const ENGINE_FIELDS = [
  "autoNotifyEnabled",
  "invitationMode",
  "reminderTiming",
  "eligibilityRules",
  "openSpotsVisible",
  "invitationGroups",
  "tiebreakers",
  "restrictions",
  "notificationGroups",
] as const satisfies readonly (keyof NotificationConfig)[];

const TEMPLATE_BLANKS = {
  reminder: "",
  reminder_followup: "",
  reminder_confirmed: "",
  reminder_declined: "",
  waiting_list_offer: "",
  waiting_list_placed: "",
};

function pickEngineFields(cfg: Partial<NotificationConfig>): Partial<NotificationConfig> {
  const out: Partial<NotificationConfig> = {};
  for (const key of ENGINE_FIELDS) if (key in cfg) (out as Record<string, unknown>)[key] = cfg[key];
  if ("excludedPlayerNames" in cfg) out.excludedPlayerNames = cfg.excludedPlayerNames;
  return out;
}

type SectionKey = "reminders" | "eligibility" | "groups" | "tiebreakers" | "restrictions" | "notifyGroups" | "standingList" | "templates";

export function NotificationsEngineSection() {
  const { t, i18n } = useTranslation();
  const [config, setConfig] = useState<NotificationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const [groupsInitializing, setGroupsInitializing] = useState(false);
  // PAD-150 (rule 9b): who the last saved bar would exclude; `null` = no bar
  // saved yet this visit. Stored as data, never as translated text.
  const [eligibilityImpact, setEligibilityImpact] = useState<EligibilityImpactEntry[] | null>(null);
  // settings.explicit-save (PAD-506): every control changes `config` (what the screen holds); `stored`
  // is what the server last confirmed. The tab's one "Guardar alterações" sends the difference.
  const [stored, setStored] = useState<NotificationConfig | null>(null);
  const [rescheduleFailed, setRescheduleFailed] = useState(false);
  // notifications.config rule 10f (PAD-478): what the newest timing save said is past due. The
  // coach is asked once they have stopped editing, and only about classes not answered for in
  // this visit. Nothing here is stored: a later visit that saves a timing asks again.
  const { toast } = useToast();
  const [pastDue, setPastDue] = useState<PastDue | null>(null);
  const [pastDueUnknown, setPastDueUnknown] = useState(false);
  const [pastDueSend, setPastDueSend] = useState<"idle" | "sending" | "failed">("idle");
  const answeredPastDue = useRef(new Set<string>());

  useEffect(() => {
    getNotificationConfig()
      // Normalize: invitationMode must always be a concrete value so the
      // RadioGroup is fully controlled and never fires a spurious change.
      .then((cfg) => {
        const loaded = { ...cfg, invitationMode: cfg.invitationMode ?? "automatic" };
        setStored(loaded);
        setConfig(loaded);
      })
      .finally(() => setLoading(false));
  }, []);

  // A control's change is held (settings.explicit-save rule 2).
  const save = (patch: Partial<NotificationConfig>) => {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  // The fields the coach edits here, compared by value (settings.unsaved-edits rule 2). Message
  // templates are their own section (MessageTemplatesSection) and its own part of the Save.
  const changed: Partial<NotificationConfig> = {};
  if (config && stored) {
    for (const key of ENGINE_FIELDS) {
      if (JSON.stringify(config[key] ?? null) !== JSON.stringify(stored[key] ?? null)) {
        (changed as Record<string, unknown>)[key] = config[key];
      }
    }
  }
  const unsaved = Object.keys(changed).length > 0;

  // settings.explicit-save rule 3: the engine's part of the tab's Save — one request with what changed.
  useTabSave("notificationEngine", unsaved, {
    label: t("settings.engine.title"),
    save: async () => {
      if (!unsaved) return;
      const patch = changed;
      const saved = await updateNotificationConfig(patch);
      const confirmed = { ...(stored ?? {}), ...patch, ...pickEngineFields(saved) } as NotificationConfig;
      setStored(confirmed);
      setConfig((prev) => (prev ? { ...prev, ...pickEngineFields(saved) } : prev));
      // notifications.config rule 10c (PAD-478): saved, but the scheduled jobs were not re-armed.
      if ("reminderTiming" in patch) {
        setRescheduleFailed(saved.rescheduleFailed === true);
        // Rule 10f: what the saved timing makes past due is asked about now.
        setPastDueUnknown(saved.pastDueUnknown === true);
        setPastDueSend("idle");
        setPastDue(saved.pastDue ?? null);
      }
      if ("eligibilityRules" in patch) {
        setEligibilityImpact(saved.eligibilityImpact?.affected ?? []);
      }
    },
  });

  // The message templates: held in the card (their section unmounts when collapsed), sent by the
  // tab's one Save as their own part (settings.explicit-save rule 3).
  const templatesShown = config?.messageTemplates;
  const templatesStored = stored?.messageTemplates;
  // By value, with the same blanks the section is given (an edit typed back is clean).
  const templatesUnsaved =
    JSON.stringify({ ...TEMPLATE_BLANKS, ...templatesShown }) !== JSON.stringify({ ...TEMPLATE_BLANKS, ...templatesStored });
  useTabSave("messageTemplates", config !== null && stored !== null && templatesUnsaved, {
    label: t("settings.engine.messageTemplates"),
    save: async () => {
      if (!templatesShown) return;
      await updateNotificationConfig({ messageTemplates: templatesShown });
      setStored((prev) => (prev ? { ...prev, messageTemplates: templatesShown } : prev));
    },
  });

  const pastDueToAsk = (pastDue?.reminders ?? []).filter((c) => !answeredPastDue.current.has(c.key));
  const answerPastDue = () => {
    for (const c of pastDueToAsk) answeredPastDue.current.add(c.key);
    setPastDue(null);
    setPastDueSend("idle");
  };
  const sendPastDue = async () => {
    const keys = pastDueToAsk.map((c) => c.key);
    setPastDueSend("sending");
    try {
      // One request names at most PAST_DUE_SEND_MAX classes. A longer list goes in several, one
      // after the other; if one fails the dialog stays open, and trying again is safe because
      // the server checks every class again and sends nothing twice.
      const result: PastDueSendResult = { sent: 0, scheduledFor: null, classes: [], skipped: 0 };
      for (let from = 0; from < keys.length; from += PAST_DUE_SEND_MAX) {
        const part = await sendPastDueReminders(keys.slice(from, from + PAST_DUE_SEND_MAX));
        result.sent += part.sent;
        result.skipped += part.skipped;
        result.classes.push(...part.classes);
        if (part.scheduledFor && (!result.scheduledFor || part.scheduledFor < result.scheduledFor)) {
          result.scheduledFor = part.scheduledFor;
        }
      }
      answerPastDue();
      if (result.scheduledFor) {
        const time = new Date(result.scheduledFor).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
        toast({ title: t(keys.length === 1 ? "settings.engine.pastDue.scheduledOne" : "settings.engine.pastDue.scheduledMany", { time }) });
      } else if (result.sent > 0) {
        const classes = result.classes.filter((c) => c.sent > 0).length || keys.length;
        toast({
          title: classes === 1 ? t("settings.engine.pastDue.sentOne") : t("settings.engine.pastDue.sentMany", { count: classes }),
        });
      } else {
        // The server checks each class again: its reminder may have gone out in the meantime.
        toast({ title: t("settings.engine.pastDue.nothingToSend") });
      }
    } catch {
      setPastDueSend("failed");
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
        data-testid={`notification-engine-section-${sectionKey}`}
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
    <>
    <Card data-testid="notifications-engine-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2" data-testid="notification-engine-title">
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
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium" data-testid="notification-engine-auto-notify-label">{t("settings.engine.automaticNotifications")}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.engine.automaticNotificationsDescription")}
            </p>
          </div>
          <Switch
            data-testid="notification-engine-auto-notify-toggle"
            checked={config.autoNotifyEnabled}
            onCheckedChange={async (val) => {
              if (val && (config.invitationGroups ?? []).length === 0) {
                setGroupsInitializing(true);
                setOpenSection("groups");
                await new Promise((r) => setTimeout(r, 700));
                save({ autoNotifyEnabled: true, invitationGroups: DEFAULT_INVITATION_GROUPS });
                setGroupsInitializing(false);
              } else {
                save({ autoNotifyEnabled: val });
              }
            }}
          />
        </div>

        {/* Invitation mode — only relevant when the engine is on */}
        {config.autoNotifyEnabled && (
          <div className="space-y-2" data-testid="notification-engine-invitation-mode">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{t("settings.engine.invitationMode")}</p>
              </div>
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
          {rescheduleFailed && (
            // notifications.config rule 10c (PAD-478): the timing IS saved; the server could
            // not re-arm the reminders of classes already scheduled. Not a failed save. Outside the
            // collapsible content, like the note below: the answer can arrive after the section closed.
            <p
              role="status"
              data-testid="notification-engine-reschedule-failed"
              className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              {t("settings.engine.rescheduleFailed")}
            </p>
          )}
          {pastDueUnknown && (
            // Rule 10f: the timing IS saved; the server could not say whether a reminder is past due.
            // Outside the collapsible content: the answer can arrive after the coach closed the section.
            <p
              role="status"
              data-testid="notification-engine-past-due-unknown"
              className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              {t("settings.engine.pastDueUnknown")}
            </p>
          )}
          <CollapsibleContent className="pt-1 pb-1">
            <div className="mb-3 flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {t("settings.engine.remindersHint")}
              </p>
            </div>
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
            <div className="mb-3 flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">{t("settings.engine.eligibilityHint")}</p>
            </div>
            <EligibilitySection
              rules={config.eligibilityRules}
              onChange={(eligibilityRules) => save({ eligibilityRules })}
              disabled={disabled}
            />
            <EligibilityImpactNote affected={eligibilityImpact} />
            {/* PAD-130 (eligibility.open-spot-visibility rule 3): the coach standard. */}
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <span className="flex items-center gap-2 text-xs">
                {t("settings.eligibility.openSpots.label")}
              </span>
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
            <div className="mb-3 flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">{t("settings.engine.invitationGroupsHint")}</p>
            </div>
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
            <div className="mb-3 flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">{t("settings.engine.tiebreakersHint")}</p>
            </div>
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
            <div className="mb-2 flex justify-end">
            </div>
            <RestrictionsPanel
              restrictions={{
                maxInactiveTime: { enabled: false, value: 120 },
                excludedPlayers: { enabled: false, playerIds: [] },
                excludeUnpaidSubscription: { enabled: false },
                cancellationDeadlineHours: 24,
                ...config.restrictions,
              }}
              excludedPlayerNames={config.excludedPlayerNames ?? {}}
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
            <div className="mb-2 flex justify-end">
            </div>
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
              templates={{ ...TEMPLATE_BLANKS, ...config.messageTemplates }}
              onChange={(messageTemplates) =>
                setConfig((prev) => prev ? { ...prev, messageTemplates } : prev)
              }
            />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
    {pastDueToAsk.length > 0 && (
      <PastDueRemindersDialog
        classes={pastDueToAsk}
        quietUntil={pastDue?.quietUntil ?? null}
        sending={pastDueSend === "sending"}
        failed={pastDueSend === "failed"}
        onSend={() => void sendPastDue()}
        onDecline={answerPastDue}
      />
    )}
    </>
  );
}
