import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * auth.invite-welcome (UI idea 8): the first page a newcomer sees from a link or a code. A flat navy band holds
 * the LevApp mark, what the state says (its title, an h3 as before, and its description) and, on the join page,
 * the coach's and the club's names; one card below holds what the state's card held under those two lines.
 * The card overlaps the band's lower edge. Used by the join page and the two invitation pages only.
 */
export function InviteWelcome({
  testId,
  title,
  description,
  names,
  cardClassName,
  contentClassName,
  children,
}: {
  /** The state's own id, around what the card holds. */
  testId?: string;
  title: ReactNode;
  description?: ReactNode;
  /** The join page's coach and club (and, signed in, the club's logo). */
  names?: { coach: string; club: string; logoUrl?: string | null };
  cardClassName?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-background">
      <div
        data-testid="invite-band"
        className="w-full border-b border-sidebar-border bg-sidebar px-4 pb-20 pt-10 text-center text-sidebar-foreground"
      >
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3">
          <img src="/brand/levapp-lockup-on-dark.svg" alt="LevApp" className="mb-3 h-10 w-auto" />
          {names && (
            <div className="flex max-w-full items-center gap-3">
              {names.logoUrl ? (
                <img src={names.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
              ) : null}
              <div className="min-w-0 text-left">
                <p className="font-display text-3xl font-semibold leading-tight [overflow-wrap:anywhere]">{names.coach}</p>
                <p className="text-base text-sidebar-foreground/80 [overflow-wrap:anywhere]">{names.club}</p>
              </div>
            </div>
          )}
          <h3 className="max-w-full text-2xl font-bold [overflow-wrap:anywhere]">{title}</h3>
          {description ? (
            <p className="max-w-full text-sm text-sidebar-foreground/80 [overflow-wrap:anywhere]">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="-mt-12 w-full max-w-md px-4 pb-8">
        <Card className={cn("w-full", cardClassName)} data-testid={testId}>
          <CardContent className={cn("space-y-3 p-6", contentClassName)}>{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
