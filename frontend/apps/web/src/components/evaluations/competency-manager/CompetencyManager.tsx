import { useState } from "react";
import { useTranslation } from "react-i18next";
import { activeCount, managerSections } from "@levelup/config";
import { useEvaluationCompetencies } from "@levelup/hooks";
import type { EvaluationCompetency } from "@levelup/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { AddCustomCompetency } from "./AddCustomCompetency";
import { CompetencyRow, managerRowId } from "./CompetencyRow";
import { DeleteCompetencyDialog } from "./DeleteCompetencyDialog";

interface CompetencyManagerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * "Gerir competências" (PAD-373; evaluations.competencies rules 5-9 and 11-14): the
 * built-in catalogue switched on and off, the coach's own competencies, and the
 * categories they already had — one set per coach, used by every evaluation surface.
 *
 * Nothing here is a draft: every toggle, rename and addition applies when made and is
 * individually reversible, so closing discards nothing (rule 12). A modal on desktop, a
 * sheet at phone width (rule 14).
 */
export function CompetencyManager({ open, onClose }: CompetencyManagerProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const title = t("evaluations.manager.title");
  const caption = (
    <span data-testid="competency-manager-caption">{t("evaluations.manager.caption")}</span>
  );
  const done = (
    <Button data-testid="competency-manager-done" onClick={onClose}>
      {t("evaluations.manager.done")}
    </Button>
  );
  const onOpenChange = (next: boolean) => { if (!next) onClose(); };

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" data-testid="competency-manager" className="flex max-h-[90dvh] flex-col">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{caption}</SheetDescription>
          </SheetHeader>
          <CompetencyManagerBody enabled={open} />
          <SheetFooter>{done}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="competency-manager" className="flex max-h-[85dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{caption}</DialogDescription>
        </DialogHeader>
        <CompetencyManagerBody enabled={open} />
        <DialogFooter>{done}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompetencyManagerBody({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const competencies = useEvaluationCompetencies(enabled);
  const [deleting, setDeleting] = useState<EvaluationCompetency | null>(null);

  if (competencies.isError) {
    return (
      <div className="space-y-2 py-4" data-testid="competency-manager-load-failed" role="alert">
        <p className="text-sm text-destructive">{t("evaluations.manager.loadFailed")}</p>
        <Button variant="outline" size="sm" onClick={() => void competencies.refetch()}>
          {t("evaluations.manager.retry")}
        </Button>
      </div>
    );
  }
  if (!competencies.data) return <div className="py-8" data-testid="competency-manager-loading" aria-busy="true" />;

  const sections = managerSections(competencies.data);
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
      {activeCount(competencies.data) === 0 ? (
        <p data-testid="competency-none-active" role="status" className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {t("evaluations.manager.noneActive")}
        </p>
      ) : null}
      {sections.map((section) => (
        <section key={section.group} aria-labelledby={`competency-group-${section.group}`}>
          <h3
            id={`competency-group-${section.group}`}
            data-testid={`competency-group-${section.group}`}
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {t(`evaluations.groups.${section.group}`)}
          </h3>
          <ul className="divide-y">
            {section.rows.map((row) => (
              <CompetencyRow key={managerRowId(row)} row={row} onDelete={setDeleting} />
            ))}
          </ul>
        </section>
      ))}
      <AddCustomCompetency />
      <DeleteCompetencyDialog competency={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
