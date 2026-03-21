import { useEffect, useState } from "react";
import { ArrowUpDown, Bell, BellRing, ChevronDown, ChevronRight, ClipboardList, Layers, Loader2, MessageSquareText, ShieldAlert, Users } from "lucide-react";

import type { NotificationConfig } from "@/types";
import { getNotificationConfig, updateNotificationConfig } from "@/api/notificationEngine";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { RemindersSection } from "./RemindersSection";
import { InvitationGroupsSection, DEFAULT_INVITATION_GROUPS } from "./InvitationGroupsSection";
import { TiebreakersSection, DEFAULT_TIEBREAKERS } from "./TiebreakersSection";
import { RestrictionsPanel } from "./RestrictionsPanel";
import { NotificationGroupsSection } from "./NotificationGroupsSection";
import { MessageTemplatesSection } from "./MessageTemplatesSection";
import { StandingWaitingListSection } from "./StandingWaitingListSection";

type SectionKey = "reminders" | "groups" | "tiebreakers" | "restrictions" | "notifyGroups" | "standingList" | "templates";

export function NotificationsEngineSection() {
  const [config, setConfig] = useState<NotificationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const [groupsInitializing, setGroupsInitializing] = useState(false);

  useEffect(() => {
    getNotificationConfig()
      .then(setConfig)
      .finally(() => setLoading(false));
  }, []);

  const save = async (patch: Partial<NotificationConfig>) => {
    if (!config) return;
    const updated = { ...config, ...patch };
    setConfig(updated);
    try {
      await updateNotificationConfig(patch);
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
          Loading notification settings…
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
          Auto-Invite Engine
        </CardTitle>
        <CardDescription>
          Automatically notify eligible students when a spot opens in a class.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Master toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Automatic notifications</p>
            <p className="text-xs text-muted-foreground">
              Notify students automatically when attendance is confirmed
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

        <Separator />

        {/* Reminders */}
        <Collapsible
          open={openSection === "reminders"}
          onOpenChange={() => toggleSection("reminders")}
        >
          <SectionHeader sectionKey="reminders" icon={Bell} label="Reminders" />
          <CollapsibleContent className="pt-1 pb-1">
            <p className="text-xs text-muted-foreground mb-3">
              Automatically remind students before class and ask them to confirm attendance.
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

        {/* Invitation Groups */}
        <Collapsible
          open={openSection === "groups"}
          onOpenChange={() => toggleSection("groups")}
        >
          <SectionHeader sectionKey="groups" icon={Layers} label="Invitation groups" />
          <CollapsibleContent className="pt-1 pb-1">
            <p className="text-xs text-muted-foreground mb-3">
              Define who gets invited and in what order. Each group is tried in sequence — if no one accepts from Group 1, the system moves to Group 2.
            </p>
            {groupsInitializing ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Setting up default invitation groups…
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
          <SectionHeader sectionKey="tiebreakers" icon={ArrowUpDown} label="Tiebreakers" />
          <CollapsibleContent className="pt-1 pb-1">
            <p className="text-xs text-muted-foreground mb-3">
              How to rank players within each group. Higher items take priority.
            </p>
            <TiebreakersSection
              tiebreakers={config.tiebreakers ?? DEFAULT_TIEBREAKERS}
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
          <SectionHeader sectionKey="restrictions" icon={ShieldAlert} label="Restrictions" />
          <CollapsibleContent className="pt-3">
            <RestrictionsPanel
              restrictions={{
                maxInactiveTime: { enabled: false, value: 120 },
                excludedPlayers: { enabled: false, playerIds: [] },
                excludeUnpaidSubscription: { enabled: false },
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
              Notify groups
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
              Standing waiting list
            </span>
            {openSection === "standingList" ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <p className="text-xs text-muted-foreground mb-3">
              Add students to the waiting list for all upcoming classes. They are automatically removed once they fill the configured number of spots or the period expires.
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
              Message templates
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
