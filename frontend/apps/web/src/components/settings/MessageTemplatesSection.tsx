import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";

import type { MessageTemplates } from "@/types";
import { updateNotificationConfig } from "@/api/notificationEngine";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const VARIABLE_HINTS: Partial<Record<keyof MessageTemplates, string[]>> = {
  invite: ["{name}", "{level}", "{weekday}", "{time}"],
  reminder: ["{name}", "{level}", "{weekday}", "{time}"],
  reminder_followup: ["{name}", "{level}", "{weekday}", "{time}"],
  waiting_list_placed: ["{name}", "{level}", "{weekday}", "{time}"],
};

const LABEL_KEYS: Record<keyof MessageTemplates, string> = {
  invite: "settings.templates.labels.invite",
  confirm: "settings.templates.labels.confirm",
  decline: "settings.templates.labels.decline",
  spot_filled: "settings.templates.labels.spotFilled",
  reminder: "settings.templates.labels.reminder",
  reminder_followup: "settings.templates.labels.reminderFollowup",
  reminder_confirmed: "settings.templates.labels.reminderConfirmed",
  reminder_declined: "settings.templates.labels.reminderDeclined",
  waiting_list_offer: "settings.templates.labels.waitingListOffer",
  waiting_list_placed: "settings.templates.labels.waitingListPlaced",
};

const DESCRIPTION_KEYS: Record<keyof MessageTemplates, string> = {
  invite: "settings.templates.descriptions.invite",
  confirm: "settings.templates.descriptions.confirm",
  decline: "settings.templates.descriptions.decline",
  spot_filled: "settings.templates.descriptions.spotFilled",
  reminder: "settings.templates.descriptions.reminder",
  reminder_followup: "settings.templates.descriptions.reminderFollowup",
  reminder_confirmed: "settings.templates.descriptions.reminderConfirmed",
  reminder_declined: "settings.templates.descriptions.reminderDeclined",
  waiting_list_offer: "settings.templates.descriptions.waitingListOffer",
  waiting_list_placed: "settings.templates.descriptions.waitingListPlaced",
};

const GROUPS: { labelKey: string; keys: (keyof MessageTemplates)[] }[] = [
  {
    labelKey: "settings.templates.groups.reminders",
    keys: ["reminder", "reminder_followup", "reminder_confirmed", "reminder_declined"],
  },
  {
    labelKey: "settings.templates.groups.invitations",
    keys: ["invite", "confirm", "decline", "spot_filled"],
  },
  {
    labelKey: "settings.templates.groups.waitingList",
    keys: ["waiting_list_offer", "waiting_list_placed"],
  },
];

interface Props {
  templates: MessageTemplates;
  onChange: (templates: MessageTemplates) => void;
}

export function MessageTemplatesSection({ templates, onChange }: Props) {
  const { t } = useTranslation();
  const [local, setLocal] = useState<MessageTemplates>(templates);
  const [saving, setSaving] = useState(false);
  const textareaRefs = useRef<Partial<Record<keyof MessageTemplates, HTMLTextAreaElement | null>>>({});

  const isDirty = JSON.stringify(local) !== JSON.stringify(templates);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateNotificationConfig({ messageTemplates: local });
      onChange(local);
      toast.success(t("settings.templates.savedSuccess"));
    } catch {
      toast.error(t("settings.templates.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const insertVariable = (key: keyof MessageTemplates, variable: string) => {
    const textarea = textareaRefs.current[key];
    if (!textarea) return;
    const start = textarea.selectionStart ?? local[key].length;
    const end = textarea.selectionEnd ?? local[key].length;
    const newValue = local[key].slice(0, start) + variable + local[key].slice(end);
    setLocal((prev) => ({ ...prev, [key]: newValue }));
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + variable.length;
      textarea.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="space-y-4">
      {GROUPS.map((group) => (
        <div key={group.labelKey}>
          <p className="text-sm font-medium mt-4 mb-2">{t(group.labelKey)}</p>
          <div className="space-y-4">
            {group.keys.map((key) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                  {t(LABEL_KEYS[key])}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t(DESCRIPTION_KEYS[key])}</p>
                <Textarea
                  ref={(el) => { textareaRefs.current[key] = el; }}
                  value={local[key]}
                  onChange={(e) => setLocal((prev) => ({ ...prev, [key]: e.target.value }))}
                  rows={2}
                  className="text-sm resize-none"
                />
                {VARIABLE_HINTS[key] && VARIABLE_HINTS[key]!.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {VARIABLE_HINTS[key]!.map((v) => (
                      <Badge
                        key={v}
                        variant="secondary"
                        className="cursor-pointer font-mono text-[10px] px-1.5 py-0.5"
                        onClick={() => insertVariable(key, v)}
                      >
                        {v}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <Button
        size="sm"
        onClick={handleSave}
        disabled={!isDirty || saving}
        className="w-full"
      >
        {saving ? t("settings.templates.saving") : t("settings.templates.saveTemplates")}
      </Button>
    </div>
  );
}
