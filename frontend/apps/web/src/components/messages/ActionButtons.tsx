import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MessageAction } from "@/types";
import { cn } from "@/lib/utils";

interface ActionButtonsProps {
  actions: MessageAction[];
  isOwnMessage: boolean;
  onRespond: (action: MessageAction, response: 'accepted' | 'declined') => void;
}

export function ActionButtons({ actions, isOwnMessage, onRespond }: ActionButtonsProps) {
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
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-destructive/15 text-destructive"
              )}
            >
              {action.response === "accepted" ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              {action.response === "accepted" ? "Accepted" : "Declined"}
            </span>
          );
        }

        // Only the recipient (not the sender) can click
        if (isOwnMessage) {
          return (
            <span key={i} className="text-xs text-muted-foreground italic">
              Waiting for response…
            </span>
          );
        }

        return (
          <div key={i} className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
              onClick={() => onRespond(action, "accepted")}
            >
              <Check className="w-3.5 h-3.5" />
              Yes
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => onRespond(action, "declined")}
            >
              <X className="w-3.5 h-3.5" />
              No
            </Button>
          </div>
        );
      })}
    </div>
  );
}
