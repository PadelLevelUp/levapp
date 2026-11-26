import { useTranslation } from "react-i18next";
import { CANCEL_REASON_MAX, type CancelReasonState } from "@levelup/hooks";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { CancelMessageEditor } from "./CancelMessageEditor";

/**
 * classes.delete rule 12 (PAD-840): the cancel dialog's reason, whether the students are told it, and the
 * message they would get. Nobody enrolled: the dialog says so instead of the last two.
 */
export function CancelReasonFields({ state }: { state: CancelReasonState }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="cancel-reason">{t("calendar.cancelReason.label")}</Label>
          <span className="text-xs text-muted-foreground" data-testid="cancel-reason-counter">
            {state.reason.length}/{CANCEL_REASON_MAX}
          </span>
        </div>
        <Textarea
          id="cancel-reason"
          data-testid="cancel-reason-input"
          value={state.reason}
          onChange={(e) => state.setReason(e.target.value)}
          maxLength={CANCEL_REASON_MAX}
          placeholder={t("calendar.cancelReason.placeholder")}
          rows={2}
          className="resize-none"
        />
      </div>
      {state.nobody ? (
        <p className="text-sm text-muted-foreground" data-testid="cancel-reason-nobody">
          {t("calendar.cancelReason.nobody")}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Checkbox
              id="cancel-reason-send"
              data-testid="cancel-reason-send"
              checked={state.sendReason}
              disabled={!state.hasReason}
              onCheckedChange={(checked) => state.setSend(checked === true)}
            />
            <Label htmlFor="cancel-reason-send" className="font-normal">
              {t("calendar.cancelReason.send")}
            </Label>
          </div>
          <CancelMessageEditor state={state} />
          {state.preview && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="mb-1 text-xs text-muted-foreground">
                {t(state.messageParts ? "calendar.cancelReason.renderedPreview" : "calendar.cancelReason.preview")}
              </p>
              <p className="whitespace-pre-wrap break-words" data-testid="cancel-reason-preview">
                {state.preview.text}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
