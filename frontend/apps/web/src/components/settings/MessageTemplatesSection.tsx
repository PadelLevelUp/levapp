import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";

import type { MessageTemplates } from "@/types";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// notifications.message-templates rule 3: every template that describes a class
// takes the same vocabulary. {type}, {date} (dd/mm) and {court} are PAD-430's.
const CLASS_VARIABLES = ["{name}", "{level}", "{weekday}", "{time}", "{type}", "{date}", "{court}"];

// PAD-489: the two "added to class" messages also take {class} (the title) and {when}.
const ADDED_VARIABLES = [...CLASS_VARIABLES, "{class}", "{when}"];

const VARIABLE_HINTS: Partial<Record<keyof MessageTemplates, string[]>> = {
  invite: CLASS_VARIABLES,
  reminder: CLASS_VARIABLES,
  reminder_followup: CLASS_VARIABLES,
  // PAD-446 (message-templates rule 16): {side} names the spot's side, on this template only.
  waiting_list_invite: [...CLASS_VARIABLES, "{side}"],
  added_to_class: ADDED_VARIABLES,
  added_to_class_coming: ADDED_VARIABLES,
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
  waiting_list_invite: "settings.templates.labels.waitingListInvite",
  added_to_class: "settings.templates.labels.addedToClass",
  added_to_class_coming: "settings.templates.labels.addedToClassComing",
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
  waiting_list_invite: "settings.templates.descriptions.waitingListInvite",
  added_to_class: "settings.templates.descriptions.addedToClass",
  added_to_class_coming: "settings.templates.descriptions.addedToClassComing",
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
    keys: ["waiting_list_offer", "waiting_list_invite"],
  },
  {
    // PAD-489: editable like the others; the "counted as coming" one is sent for a class
    // created after its reminder time (notifications.reminders rule 22).
    labelKey: "settings.templates.groups.addedToClass",
    keys: ["added_to_class", "added_to_class_coming"],
  },
];

interface Props {
  templates: MessageTemplates;
  onChange: (templates: MessageTemplates) => void;
}

/**
 * settings.explicit-save (PAD-506): controlled — the engine card holds the templates with the rest of
 * the tab (this section unmounts when collapsed) and sends them with the tab's one Save.
 */
export function MessageTemplatesSection({ templates, onChange }: Props) {
  const { t } = useTranslation();
  const local = templates;
  const setLocal = (next: (prev: MessageTemplates) => MessageTemplates) => onChange(next(templates));
  const textareaRefs = useRef<Partial<Record<keyof MessageTemplates, HTMLTextAreaElement | null>>>({});

  const insertVariable = (key: keyof MessageTemplates, variable: string) => {
    const textarea = textareaRefs.current[key];
    if (!textarea) return;
    // PAD-489: a key a config from before it may not hold; the server answers its default then.
    const current = local[key] ?? "";
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    const newValue = current.slice(0, start) + variable + current.slice(end);
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
              <div key={key} className="space-y-1.5" data-testid={`template-row-${key}`}>
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                  {t(LABEL_KEYS[key])}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t(DESCRIPTION_KEYS[key])}</p>
                <Textarea
                  ref={(el) => { textareaRefs.current[key] = el; }}
                  value={local[key] ?? ""}
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
    </div>
  );
}
