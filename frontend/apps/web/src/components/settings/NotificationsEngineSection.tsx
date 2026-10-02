import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpDown, Bell, BellRing, ChevronDown, ChevronRight, ClipboardList, Layers, Loader2, MessageSquareText, ShieldAlert, ShieldCheck, Users } from "lucide-react";

import type { InvitationMode, NotificationConfig } from "@/types";
import { getNotificationConfig, sendPastDueReminders, updateNotificationConfig } from "@/api/notificationEngine";
import type { PastDue } from "@/api/notificationEngine";
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
import { SaveSign, useSaveSign } from "./SaveSign";
import { SaveLedger, createSerialSaver } from "@levelup/config";

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
  // settings.save-on-change rules 2-3 / B-243 (PAD-473): each control signs its save under its own
  // key, and what a failure puts back comes from the shared SaveLedger: per field, the value the server
  // last confirmed, decided only by that field's newest save.
  const sign = useSaveSign();
  const [rescheduleFailed, setRescheduleFailed] = useState(false);
  // notifications.config rule 10f (PAD-478): what the newest timing save said is past due. The
  // coach is asked once they have stopped editing, and only about classes not answered for in
  // this visit. Nothing here is stored: a later visit that saves a timing asks again.
  const { toast } = useToast();
  const [pastDue, setPastDue] = useState<PastDue | null>(null);
  const [pastDueUnknown, setPastDueUnknown] = useState(false);
  const [pastDueSend, setPastDueSend] = useState<"idle" | "sending" | "failed">("idle");
  const [remindersBusy, setRemindersBusy] = useState(false);
  const timingSaves = useRef(0);
  const answeredPastDue = useRef(new Set<string>());
  const ledger = useRef(new SaveLedger<NotificationConfig>());
  // settings.save-on-change rule 3: one engine save in flight at a time; patches waiting meanwhile are
  // merged and sent next, so the server ends in the order the saves were sent. The reminders sub-panel
  // goes through it too (PAD-478), after its own pause (RemindersSection).
  const [saveEngine] = useState(() =>
    createSerialSaver(
      (patch: Partial<NotificationConfig>) => updateNotificationConfig(patch),
      (pending, next) => ({ ...pending, ...next }),
    ),
  );

  useEffect(() => {
    getNotificationConfig()
      // Normalize: invitationMode must always be a concrete value so the
      // RadioGroup is fully controlled and never fires a spurious change.
      .then((cfg) => {
        const loaded = { ...cfg, invitationMode: cfg.invitationMode ?? "automatic" };
        ledger.current.seed(loaded);
        setConfig(loaded);
      })
      .finally(() => setLoading(false));
  }, []);

  // `signKey` names the control's sign. Every engine control has one, the reminders sub-panel
  // included since PAD-478 (settings.save-on-change rule 1).
  const save = async (patch: Partial<NotificationConfig>, signKey: string) => {
    if (!config) return;
    const token = ledger.current.begin(patch);
    // Only the newest timing save's answer may ask (rule 10f): an older one describes a
    // configuration the coach has already moved on from.
    const timingSave = "reminderTiming" in patch ? ++timingSaves.current : null;
    if (timingSave !== null) setPastDue(null);
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
    const request = saveEngine(patch);
    const show = (values: Partial<NotificationConfig>) => {
      if (Object.keys(values).length > 0) setConfig((prev) => (prev ? { ...prev, ...values } : prev));
    };
    try {
      const saved = await sign.track(signKey, request);
      show(ledger.current.confirm(token, saved).show);
      // notifications.config rule 10c (PAD-478): saved, but the scheduled jobs were not re-armed.
      // The answer of a merged request speaks for every patch in it.
      if ("reminderTiming" in patch) setRescheduleFailed(saved.rescheduleFailed === true);
      if (timingSave !== null && timingSave === timingSaves.current) {
        setPastDueUnknown(saved.pastDueUnknown === true);
        setPastDueSend("idle");
        setPastDue(saved.pastDue ?? null);
      }
      if ("eligibilityRules" in patch) {
        setEligibilityImpact(saved.eligibilityImpact?.affected ?? []);
      }
    } catch {
      // Back to the confirmed value, for the fields whose newest save this was (B-243).
      show(ledger.current.fail(token));
    }
  };

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
      const result = await sendPastDueReminders(keys);
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
              <SaveSign status={sign.status("autoNotify")} testId="notification-engine-auto-notify-sign" />
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
                await save({ autoNotifyEnabled: true, invitationGroups: DEFAULT_INVITATION_GROUPS }, "autoNotify");
                setGroupsInitializing(false);
              } else {
                save({ autoNotifyEnabled: val }, "autoNotify");
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
                <SaveSign status={sign.status("invitationMode")} testId="notification-engine-invitation-mode-sign" />
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
                  save({ invitationMode: value as InvitationMode }, "invitationMode");
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
            <div className="mb-3 flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {t("settings.engine.remindersHint")}
              </p>
              <SaveSign status={sign.status("reminders")} testId="notification-engine-reminders-sign" />
            </div>
            {rescheduleFailed && (
              // notifications.config rule 10c (PAD-478): the timing IS saved; the server could
              // not re-arm the reminders of classes already scheduled. Not a failed save.
              <p
                role="status"
                data-testid="notification-engine-reschedule-failed"
                className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              >
                {t("settings.engine.rescheduleFailed")}
              </p>
            )}
            {pastDueUnknown && (
              // Rule 10f: the timing IS saved; the server could not say whether a reminder is past due.
              <p
                role="status"
                data-testid="notification-engine-past-due-unknown"
                className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              >
                {t("settings.engine.pastDueUnknown")}
              </p>
            )}
            <RemindersSection
              reminderTiming={{
                firstReminder: { type: "hours_before", value: 48 },
                reminderCount: 1,
                hoursBetweenReminders: 4,
                invitationStart: { type: "hours_before", value: 24 },
                ...config.reminderTiming,
              }}
              onChange={(reminderTiming) => save({ reminderTiming }, "reminders")}
              // Read from storage at the moment the section closes, not from the auth hook:
              // sign-out is what unmounts it, so a render-time value would still say "signed in".
              flushOnClose={() => localStorage.getItem("accessToken") !== null}
              onBusyChange={setRemindersBusy}
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
              <SaveSign status={sign.status("eligibility")} testId="notification-engine-eligibility-sign" />
            </div>
            <EligibilitySection
              rules={config.eligibilityRules}
              onChange={(eligibilityRules) => save({ eligibilityRules }, "eligibility")}
              disabled={disabled}
            />
            <EligibilityImpactNote affected={eligibilityImpact} />
            {/* PAD-130 (eligibility.open-spot-visibility rule 3): the coach standard. */}
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <span className="flex items-center gap-2 text-xs">
                {t("settings.eligibility.openSpots.label")}
                <SaveSign status={sign.status("openSpots")} testId="notification-engine-open-spots-sign" />
              </span>
              <Switch
                checked={config.openSpotsVisible ?? false}
                onCheckedChange={(openSpotsVisible) => save({ openSpotsVisible }, "openSpots")}
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
              <SaveSign status={sign.status("groups")} testId="notification-engine-groups-sign" />
            </div>
            {groupsInitializing ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("settings.engine.settingUpGroups")}
              </div>
            ) : (
              <InvitationGroupsSection
                groups={config.invitationGroups ?? []}
                onChange={(invitationGroups) => save({ invitationGroups }, "groups")}
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
              <SaveSign status={sign.status("tiebreakers")} testId="notification-engine-tiebreakers-sign" />
            </div>
            <TiebreakersSection
              tiebreakers={config.tiebreakers && config.tiebreakers.length > 0 ? config.tiebreakers : DEFAULT_TIEBREAKERS}
              onChange={(tiebreakers) => save({ tiebreakers }, "tiebreakers")}
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
              <SaveSign status={sign.status("restrictions")} testId="notification-engine-restrictions-sign" />
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
              onChange={(restrictions) => save({ restrictions }, "restrictions")}
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
              <SaveSign status={sign.status("notifyGroups")} testId="notification-engine-notifyGroups-sign" />
            </div>
            <NotificationGroupsSection
              groups={config.notificationGroups ?? []}
              onChange={(notificationGroups) => save({ notificationGroups }, "notifyGroups")}
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
    {pastDueToAsk.length > 0 && !remindersBusy && (
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
