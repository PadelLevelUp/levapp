import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { MessageAction } from "@/types";
import { cn } from "@/lib/utils";

interface ActionButtonsProps {
  actions: MessageAction[];
  isOwnMessage: boolean;
  onRespond: (action: MessageAction, response: 'accepted' | 'declined') => void;
}

export function ActionButtons({ actions, isOwnMessage, onRespond }: ActionButtonsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2 mt-2">
      {actions.map((action, i) => {
        const responded = !!action.response;

        if (responded) {
          return (
            <span
              key={i}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full",
                action.response === "accepted"
                  ? "bg-success/15 text-success-strong"
                  : "bg-destructive/15 text-destructive"
              )}
            >
              {action.response === "accepted" ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              {action.response === "accepted" ? t("messages.accepted") : t("messages.declined")}
            </span>
          );
        }

        // Only the recipient (not the sender) can click
        if (isOwnMessage) {
          return (
            <span key={i} className="text-xs text-muted-foreground italic">
              {t("messages.waitingForResponse")}
            </span>
          );
        }

        return (
          <div key={i} className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-success/40 text-success hover:bg-success/10 dark:text-success"
              onClick={() => onRespond(action, "accepted")}
            >
              <Check className="w-3.5 h-3.5" />
              {t("messages.yes")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => onRespond(action, "declined")}
            >
              <X className="w-3.5 h-3.5" />
              {t("messages.no")}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
