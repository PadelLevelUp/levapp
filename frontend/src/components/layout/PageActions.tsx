import type { ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface PageAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "default" | "outline" | "destructive" | "ghost";
  disabled?: boolean;
  className?: string;
}

interface PageActionsProps {
  actions: PageAction[];
}

/**
 * Renders action buttons inline on desktop, collapsed into a "..." dropdown on mobile.
 * Use this in any page header that has multiple action buttons.
 */
export function PageActions({ actions }: PageActionsProps) {
  if (actions.length === 0) return null;

  return (
    <>
      {/* Desktop: inline buttons */}
      <div className="hidden sm:flex items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            size="sm"
            variant={action.variant ?? "outline"}
            onClick={action.onClick}
            disabled={action.disabled}
            className={action.className}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}
      </div>

      {/* Mobile: dropdown menu */}
      <div className="sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map((action) => (
              <DropdownMenuItem
                key={action.label}
                onClick={action.onClick}
                disabled={action.disabled}
                className={cn(
                  action.variant === "destructive" && "text-destructive focus:text-destructive",
                  action.className,
                )}
              >
                {action.icon}
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
