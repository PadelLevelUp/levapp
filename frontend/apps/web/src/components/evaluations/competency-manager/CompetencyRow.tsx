import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";
import { competencyLabel, legacyScaleLabel, type ManagerRow } from "@levelup/config";
import {
  evaluationApiErrorCode,
  useSwitchOnCatalogueCompetency,
  useUpdateEvaluationCompetency,
} from "@levelup/hooks";
import type { EvaluationCompetency } from "@levelup/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

/** A stable id for test ids and keys: the catalogue key when there is one, else the row id. */
export function managerRowId(row: ManagerRow): string {
  if (row.kind === "available") return `key-${row.entry.key}`;
  return row.competency.key ? `key-${row.competency.key}` : `id-${row.competency.id}`;
}

interface CompetencyRowProps {
  row: ManagerRow;
  onDelete: (competency: EvaluationCompetency) => void;
  /** PAD-431: a category heads its section; a sub-category is indented under it. */
  level?: "category" | "sub";
}

/**
 * One competency (evaluations.competencies rules 2, 6-8, 12). Every change applies
 * when made: while its request is in flight the row is disabled — one request per
 * tap — and a failure puts the switch back and says so on this row.
 */
export function CompetencyRow({ row, onDelete, level = "category" }: CompetencyRowProps) {
  const { t } = useTranslation();
  const switchOn = useSwitchOnCatalogueCompetency();
  const update = useUpdateEvaluationCompetency();
  const [wanted, setWanted] = useState<boolean | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  // A ref, not state: two taps in the same frame both see the state from before the
  // first one, and the API being idempotent is no reason to send the second request.
  const inFlight = useRef(false);

  const rowId = managerRowId(row);
  const competency = row.kind === "existing" ? row.competency : null;
  const kind = row.kind === "existing" ? row.rowKind : "available";
  const label = competency
    ? competencyLabel(t, competency)
    : competencyLabel(t, { key: row.kind === "available" ? row.entry.key : null, name: row.kind === "available" ? row.entry.key : "" });
  const scale = competency ? legacyScaleLabel(competency) : null;
  const busy = wanted !== null || update.isPending || switchOn.isPending;
  const checked = wanted ?? competency?.isActive ?? false;
  // PAD-431 (rules 8, 9): every row the coach holds can be renamed and deleted, a default included.
  const editable = kind !== "available";

  const fail = (error: unknown) =>
    setErrorKey(evaluationApiErrorCode(error) === "duplicate_name" ? "duplicateName"
      : evaluationApiErrorCode(error) === "name_invalid" ? "nameInvalid" : "saveFailed");

  const toggle = async (next: boolean) => {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setErrorKey(null);
    setWanted(next);
    try {
      if (competency) await update.mutateAsync({ id: competency.id, patch: { isActive: next } });
      else if (row.kind === "available") await switchOn.mutateAsync(row.entry.key);
    } catch (error) {
      fail(error);
    } finally {
      inFlight.current = false;
      setWanted(null);
    }
  };

  const saveName = async () => {
    const name = draftName.trim();
    if (!competency || busy) return;
    if (!name) return setErrorKey("nameInvalid");
    if (name === competency.name) return setRenaming(false);
    setErrorKey(null);
    try {
      await update.mutateAsync({ id: competency.id, patch: { name } });
      setRenaming(false);
    } catch (error) {
      fail(error);
    }
  };

  return (
    <li
      data-testid={`competency-row-${rowId}`}
      data-kind={kind}
      data-active={checked ? "true" : "false"}
      data-level={level}
      className={level === "sub" ? "flex flex-col gap-1 py-1.5 pl-6" : "flex flex-col gap-1 py-2"}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {renaming && competency ? (
            <div className="flex items-center gap-2">
              <Input
                data-testid={`competency-rename-input-${rowId}`}
                value={draftName}
                maxLength={100}
                aria-label={t("evaluations.manager.rename")}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveName();
                  if (e.key === "Escape") setRenaming(false);
                }}
              />
              <Button size="sm" data-testid={`competency-rename-save-${rowId}`} disabled={busy} onClick={() => void saveName()}>
                {t("evaluations.manager.renameSave")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setRenaming(false); setErrorKey(null); }}>
                {t("evaluations.manager.renameCancel")}
              </Button>
            </div>
          ) : (
            <>
              <p className={level === "sub" ? "truncate text-sm" : "truncate text-sm font-semibold"}>{label}</p>
              {scale ? (
                <p data-testid={`competency-scale-${rowId}`} className="text-xs text-muted-foreground">
                  {t("evaluations.manager.legacyScale", { scale })}
                </p>
              ) : null}
            </>
          )}
        </div>
        {editable && competency && !renaming ? (
          <>
            <Button
              size="icon"
              variant="ghost"
              data-testid={`competency-rename-${rowId}`}
              aria-label={`${t("evaluations.manager.rename")}: ${label}`}
              disabled={busy}
              onClick={() => { setDraftName(competency.name); setErrorKey(null); setRenaming(true); }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              data-testid={`competency-delete-${rowId}`}
              aria-label={`${t("evaluations.manager.delete")}: ${label}`}
              disabled={busy}
              onClick={() => onDelete(competency)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </>
        ) : null}
        <Switch
          data-testid={`competency-toggle-${rowId}`}
          aria-label={label}
          checked={checked}
          disabled={busy}
          onCheckedChange={(next) => void toggle(next)}
        />
      </div>
      {errorKey ? (
        <p data-testid={`competency-error-${rowId}`} role="alert" className="text-xs text-destructive">
          {t(`evaluations.manager.${errorKey}`)}
        </p>
      ) : null}
    </li>
  );
}
