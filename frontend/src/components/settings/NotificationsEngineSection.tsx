import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, BellRing, ListOrdered, MessageSquareText, ShieldAlert, Timer, Users } from "lucide-react";

import type { NotificationConfig } from "@/types";
import { getNotificationConfig, updateNotificationConfig } from "@/api/notificationEngine";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { PriorityBuilder } from "./PriorityBuilder";
import { RestrictionsPanel } from "./RestrictionsPanel";
import { NotificationRounds } from "./NotificationRounds";
import { NotificationGroupsSection } from "./NotificationGroupsSection";
import { MessageTemplatesSection } from "./MessageTemplatesSection";

type SectionKey = "priority" | "restrictions" | "rounds" | "groups" | "templates";

export function NotificationsEngineSection() {
  const [config, setConfig] = useState<NotificationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);

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
            onCheckedChange={(val) => save({ autoNotifyEnabled: val })}
          />
        </div>

        <Separator />

        {/* Priority Builder */}
        <Collapsible
          open={openSection === "priority"}
          onOpenChange={() => toggleSection("priority")}
        >
          <CollapsibleTrigger
            className={`flex w-full items-center justify-between py-1 text-sm font-medium transition-colors ${
              disabled ? "opacity-40 pointer-events-none" : "hover:text-primary"
            }`}
            disabled={disabled}
          >
            <span className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4" />
              Priority order
            </span>
            {openSection === "priority" ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <PriorityBuilder
              criteria={config.priorityCriteria}
              onChange={(priorityCriteria) => save({ priorityCriteria })}
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
          <CollapsibleTrigger
            className={`flex w-full items-center justify-between py-1 text-sm font-medium transition-colors ${
              disabled ? "opacity-40 pointer-events-none" : "hover:text-primary"
            }`}
            disabled={disabled}
          >
            <span className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Restrictions
            </span>
            {openSection === "restrictions" ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <RestrictionsPanel
              restrictions={config.restrictions}
              onChange={(restrictions) => save({ restrictions })}
              disabled={disabled}
            />
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Notification Rounds */}
        <Collapsible
          open={openSection === "rounds"}
          onOpenChange={() => toggleSection("rounds")}
        >
          <CollapsibleTrigger
            className={`flex w-full items-center justify-between py-1 text-sm font-medium transition-colors ${
              disabled ? "opacity-40 pointer-events-none" : "hover:text-primary"
            }`}
            disabled={disabled}
          >
            <span className="flex items-center gap-2">
              <Timer className="w-4 h-4" />
              Notification rounds
            </span>
            {openSection === "rounds" ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <NotificationRounds
              rounds={config.rounds}
              onChange={(rounds) => save({ rounds })}
              disabled={disabled}
            />
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Notification Groups */}
        <Collapsible
          open={openSection === "groups"}
          onOpenChange={() => toggleSection("groups")}
        >
          <CollapsibleTrigger
            className="flex w-full items-center justify-between py-1 text-sm font-medium transition-colors hover:text-primary"
          >
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Notify groups
            </span>
            {openSection === "groups" ? (
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

        {/* Message Templates */}
        <Collapsible
          open={openSection === "templates"}
          onOpenChange={() => toggleSection("templates")}
        >
          <CollapsibleTrigger
            className="flex w-full items-center justify-between py-1 text-sm font-medium transition-colors hover:text-primary"
          >
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
              templates={config.messageTemplates}
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
