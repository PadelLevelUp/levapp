import { useRef, useState } from "react";
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

const LABELS: Record<keyof MessageTemplates, string> = {
  invite: "Invite message",
  confirm: "Confirm response",
  decline: "Decline response",
  spot_filled: "Spot-filled response",
  reminder: "Attendance reminder",
  reminder_followup: "Reminder follow-up",
  reminder_confirmed: "Attendance confirmed",
  reminder_declined: "Attendance declined",
  waiting_list_offer: "Waiting list offer",
  waiting_list_placed: "Spot from waiting list",
};

const DESCRIPTIONS: Record<keyof MessageTemplates, string> = {
  invite: "Sent when notifying a student about an open spot.",
  confirm: "Sent automatically when a student says Yes.",
  decline: "Sent automatically when a student says No.",
  spot_filled: "Sent when a spot is claimed before the student responds.",
  reminder: "Sent to remind students before class and ask them to confirm attendance.",
  reminder_followup: "Sent if the student hasn't responded to the first reminder.",
  reminder_confirmed: "Sent automatically when a student confirms attendance.",
  reminder_declined: "Sent automatically when a student declines attendance.",
  waiting_list_offer: "Sent when a spot was filled, offering to be placed on the waiting list.",
  waiting_list_placed: "Sent when a waiting-list student gets a spot.",
};

const GROUPS: { label: string; keys: (keyof MessageTemplates)[] }[] = [
  {
    label: "Reminders",
    keys: ["reminder", "reminder_followup", "reminder_confirmed", "reminder_declined"],
  },
  {
    label: "Invitations",
    keys: ["invite", "confirm", "decline", "spot_filled"],
  },
  {
    label: "Waiting list",
    keys: ["waiting_list_offer", "waiting_list_placed"],
  },
];

interface Props {
  templates: MessageTemplates;
  onChange: (templates: MessageTemplates) => void;
}

export function MessageTemplatesSection({ templates, onChange }: Props) {
  const [local, setLocal] = useState<MessageTemplates>(templates);
  const [saving, setSaving] = useState(false);
  const textareaRefs = useRef<Partial<Record<keyof MessageTemplates, HTMLTextAreaElement | null>>>({});

  const isDirty = JSON.stringify(local) !== JSON.stringify(templates);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateNotificationConfig({ messageTemplates: local });
      onChange(local);
      toast.success("Templates saved");
    } catch {
      toast.error("Failed to save templates");
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
        <div key={group.label}>
          <p className="text-sm font-medium mt-4 mb-2">{group.label}</p>
          <div className="space-y-4">
            {group.keys.map((key) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                  {LABELS[key]}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">{DESCRIPTIONS[key]}</p>
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
        {saving ? "Saving…" : "Save templates"}
      </Button>
    </div>
  );
}
