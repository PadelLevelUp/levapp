import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { EngineInviteMeta, EngineRespondAction } from "@levelup/types";
import { engineInviteState, engineInviteTestIds } from "@levelup/config";
import { respondToEngineInvitation } from "@/api/notificationEngine";

/**
 * PAD-920 (notifications.invitations NB1–NB4): the answer area of a new-engine invitation bubble.
 * The state comes from the message's metadata, which the backend keeps current with
 * `message_edited`; `engineInviteState` (shared with iOS) turns it into buttons or a line. Until the
 * live edit arrives, the answer route's own `action` stands in for it.
 */
const STATE_AFTER: Record<EngineRespondAction, Partial<EngineInviteMeta>> = {
  confirmed: { state: "answered", response: "yes", answeredBy: "student" },
  declined: { state: "answered", response: "no", answeredBy: "student" },
  sorry: { state: "sorry" },
  reoffered: { state: "reoffered" },
  closed_same_hour: { state: "closed_same_hour" },
  // The class has started: the bubble derives that from `startsAt` on its own.
  class_started: {},
};

export function EngineInviteResponse({ meta, isMine }: { meta: EngineInviteMeta; isMine: boolean }) {
  const { t } = useTranslation();
  const [responding, setResponding] = useState(false);
  // The route's answer for this invitation, until the message's own edit replaces the metadata.
  const [answered, setAnswered] = useState<{ forState: string; patch: Partial<EngineInviteMeta> } | null>(null);
  const shown = answered && answered.forState === meta.state ? { ...meta, ...answered.patch } : meta;
  // The coach sent the invitation, so the coach's copy is the sender's (NB3).
  const view = engineInviteState(shown, isMine ? "coach" : "student", new Date());
  const ids = engineInviteTestIds(meta.invitationId);

  const respond = async (action: "yes" | "no") => {
    if (responding) return;
    setResponding(true);
    try {
      const result = await respondToEngineInvitation({ invitationId: meta.invitationId, action });
      setAnswered({ forState: meta.state, patch: STATE_AFTER[result.action] ?? {} });
    } catch {
      toast.error(t("messages.somethingWentWrong"));
    } finally {
      setResponding(false);
    }
  };

  return (
    <div className="flex gap-2 mt-1.5 ml-1" data-testid={view.testId}>
      {view.buttons ? (
        <>
          <button
            data-testid={ids.yes}
            onClick={() => respond("yes")}
            disabled={responding}
            className="flex-1 py-1.5 text-sm font-medium rounded-xl bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
          >
            {responding ? "…" : t("messages.yes")}
          </button>
          <button
            data-testid={ids.no}
            onClick={() => respond("no")}
            disabled={responding}
            className="flex-1 py-1.5 text-sm font-medium rounded-xl bg-muted text-foreground disabled:opacity-50 transition-opacity"
          >
            {t("messages.no")}
          </button>
        </>
      ) : view.labelKey ? (
        <span
          className={
            view.state === "answered" && shown.response === "yes"
              ? "text-xs font-medium px-3 py-1.5 rounded-full bg-success/15 text-success"
              : view.state === "open"
                ? "text-xs text-muted-foreground italic"
                : "text-xs font-medium px-3 py-1.5 rounded-full bg-muted text-muted-foreground"
          }
        >
          {t(view.labelKey)}
        </span>
      ) : null}
    </div>
  );
}
