import { useState } from "react";
import { useTranslation } from "react-i18next";
import { activeCount, categorySections, competencyLabel, type CategorySection } from "@levelup/config";
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
 * "Definir categorias de avaliação" (PAD-373, PAD-431; evaluations.competencies rules 5-9,
 * 11-15): the default categories and sub-categories switched on and off, the coach's own, and
 * the categories they already had — one set per coach, used by every evaluation surface.
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
        <SheetContent side="bottom" data-testid="competency-manager" data-presentation="sheet" className="flex max-h-[90dvh] flex-col">
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
      <DialogContent data-testid="competency-manager" data-presentation="modal" className="flex max-h-[85dvh] flex-col sm:max-w-lg">
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

  const sections = categorySections(competencies.data);
  const subNamesOf = (competency: EvaluationCompetency) =>
    competencies.data!.competencies.filter((c) => c.parentId === competency.id).map((c) => competencyLabel(t, c));
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
      {sections.map((section) => (
        <ManagerSectionView key={section.id} section={section} onDelete={setDeleting} />
      ))}
      {/* Below the rows, never above them: appearing above would move every switch under
          the finger the moment the last one is turned off (Session-B's review of #361). */}
      {activeCount(competencies.data) === 0 ? (
        <p data-testid="competency-none-active" role="status" className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {t("evaluations.manager.noneActive")}
        </p>
      ) : null}
      <AddCustomCompetency />
      <DeleteCompetencyDialog
        competency={deleting}
        subNames={deleting ? subNamesOf(deleting) : []}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

/** One section (PAD-431, rule 15): the coach's legacy categories, or one category with its
 *  sub-categories and, when it is a row, a field to add one. */
function ManagerSectionView({ section, onDelete }: { section: CategorySection; onDelete: (c: EvaluationCompetency) => void }) {
  const { t } = useTranslation();
  if (section.kind === "legacy") {
    return (
      <section data-testid="competency-section-legacy" aria-labelledby="competency-group-legacy">
        <h3 id="competency-group-legacy" data-testid="competency-group-legacy"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("evaluations.manager.legacyTitle")}
        </h3>
        <p data-testid="competency-group-legacy-caption" className="text-xs text-muted-foreground">
          {t("evaluations.manager.legacyCaption")}
        </p>
        <ul className="divide-y">
          {section.subs.map((row) => <CompetencyRow key={managerRowId(row)} row={row} onDelete={onDelete} />)}
        </ul>
      </section>
    );
  }
  return (
    <section data-testid={`competency-section-${section.id}`} className="rounded-md border px-3 py-1">
      <ul className="divide-y">
        {section.head ? (
          <CompetencyRow row={section.head} onDelete={onDelete} level="category" />
        ) : (
          // A default the coach cannot be offered (they hold its name): its sub-categories still are.
          <li data-testid={`competency-category-title-${section.id}`} className="py-2 text-sm font-semibold">
            {t(`evaluations.catalogue.${section.headKey}`)}
          </li>
        )}
        {section.subs.map((row) => (
          <CompetencyRow key={managerRowId(row)} row={row} onDelete={onDelete} level="sub" />
        ))}
      </ul>
      {section.parentId !== null ? (
        <div className="py-2">
          <AddCustomCompetency parentId={section.parentId} sectionId={section.id} />
        </div>
      ) : null}
    </section>
  );
}
