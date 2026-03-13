import { useState } from "react";
import { MessageSquare } from "lucide-react";

import type { MessageTemplates } from "@/types";
import { updateNotificationConfig } from "@/api/notificationEngine";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const VARIABLE_HINTS: Record<keyof MessageTemplates, string[]> = {
  invite: ["{name}", "{level}", "{weekday}", "{time}"],
  confirm: [],
  decline: [],
  spot_filled: [],
};

const LABELS: Record<keyof MessageTemplates, string> = {
  invite: "Invite message",
  confirm: "Confirm response",
  decline: "Decline response",
  spot_filled: "Spot-filled response",
};

const DESCRIPTIONS: Record<keyof MessageTemplates, string> = {
  invite: "Sent when notifying a student about an open spot.",
  confirm: "Sent automatically when a student says Yes.",
  decline: "Sent automatically when a student says No.",
  spot_filled: "Sent when a spot is claimed before the student responds.",
};

interface Props {
  templates: MessageTemplates;
  onChange: (templates: MessageTemplates) => void;
}

export function MessageTemplatesSection({ templates, onChange }: Props) {
  const [local, setLocal] = useState<MessageTemplates>(templates);
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="space-y-4">
      {(Object.keys(LABELS) as (keyof MessageTemplates)[]).map((key) => (
        <div key={key} className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                {LABELS[key]}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">{DESCRIPTIONS[key]}</p>
            </div>
            {VARIABLE_HINTS[key].length > 0 && (
              <div className="flex flex-wrap gap-1 shrink-0">
                {VARIABLE_HINTS[key].map((v) => (
                  <span
                    key={v}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                  >
                    {v}
                  </span>
                ))}
              </div>
            )}
          </div>
          <Textarea
            value={local[key]}
            onChange={(e) => setLocal((prev) => ({ ...prev, [key]: e.target.value }))}
            rows={2}
            className="text-sm resize-none"
          />
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
