import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { removeMessageToken, setMessageText, type CancelReasonState } from "@levelup/hooks";

import { Button } from "@/components/ui/button";

/**
 * classes.delete rule 13 (PAD-840, phase 2): the cancellation message the coach may edit for this one cancellation.
 * Placeholders are chips that can only be removed whole; the text between them is theirs. "Repor mensagem
 * original" puts the template's text back.
 */
export function CancelMessageEditor({ state }: { state: CancelReasonState }) {
  const { t } = useTranslation();
  const parts = state.messageParts;
  if (!parts) return null;
  return (
    <div className="min-w-0 space-y-1.5" data-testid="cancel-message-editor">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t("calendar.cancelReason.edit")}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="cancel-message-restore"
          disabled={!state.messageEdited}
          onClick={state.restoreMessage}
        >
          {t("calendar.cancelReason.restore")}
        </Button>
      </div>
      <div className="flex min-w-0 flex-wrap items-start gap-1 rounded-md border bg-background p-2 text-sm">
        {parts.map((part, i) =>
          part.kind === "token" ? (
            <span
              key={i}
              data-testid={`cancel-message-token-${part.name}`}
              className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary"
            >
              {`{${part.name}}`}
              <button
                type="button"
                data-testid={`cancel-message-token-remove-${part.name}`}
                aria-label={t("calendar.cancelReason.removeToken", { name: part.name })}
                onClick={() => state.editMessage(removeMessageToken(parts, i))}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : (
            <textarea
              key={i}
              data-testid={`cancel-message-text-${i}`}
              value={part.text}
              rows={Math.max(1, part.text.split("\n").length)}
              onChange={(e) => state.editMessage(setMessageText(parts, i, e.target.value))}
              style={{ width: `calc(${Math.min(60, Math.max(1, ...part.text.split("\n").map((l) => l.length))) * 0.8}ch + 8px)` }}
              className="max-w-full resize-none rounded bg-transparent px-0.5 py-0.5 outline-none focus:bg-muted/40"
            />
          ),
        )}
      </div>
    </div>
  );
}
