import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, Plus, Settings2 } from "lucide-react";
import type { ClassEvaluationParticipant, EvaluationClassRef, EvaluationCompetency } from "@levelup/types";
import { classRowCompetencies, classRowSummary } from "@levelup/config";
import { useClassEvaluations, useEvaluationCompetencies, useHeldWhile, usePutEvaluationRecord } from "@levelup/hooks";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EvaluationForm } from "./EvaluationForm";
import { EvaluationHistoryCard } from "./EvaluationHistoryCard";
import { openCompetencyManager } from "./openCompetencyManager";

interface ClassEvaluationsPanelProps {
  /** The dated occurrence, addressed as `POST /class_instance` addresses it. */
  classRef: EvaluationClassRef;
  className: string;
  /** "←": back to the class detail. Closing the whole surface is the sheet's own "×". */
  onBack: () => void;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");

/**
 * "Avaliações — {aula}" (evaluations.class-panel, PAD-376): the class detail's surface
 * swapped for that occurrence's participants, one row open at a time. The server says
 * who is listed, in what order (absent last) and which record a row shows — the
 * participant's most recent one for this occurrence (Q28); nothing here reads a clock.
 * The panel owns its state: it mounts collapsed from a fresh read and unmounts with the
 * surface, and nothing typed is lost because every input was already saved.
 */
export function ClassEvaluationsPanel({ classRef, className, onBack }: ClassEvaluationsPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const read = useClassEvaluations(classRef);
  const known = useEvaluationCompetencies();
  const [openId, setOpenId] = useState<number | null>(null);

  const participants = read.data?.participants;
  // Nothing may move under an open form: the ORDER is held while a row is open (someone
  // marked absent elsewhere would otherwise jump to the end); each row's data still follows.
  const latestOrder = useMemo(() => participants?.map((p) => p.playerId), [participants]);
  const order = useHeldWhile(latestOrder, openId !== null, `${classRef.model}:${classRef.id}:${classRef.date ?? ""}`);
  const rows = useMemo(() => {
    const byId = new Map((participants ?? []).map((p) => [p.playerId, p]));
    const held = (order ?? []).flatMap((id) => byId.get(id) ?? []);
    const added = (participants ?? []).filter((p) => !(order ?? []).includes(p.playerId));
    return [...held, ...added];
  }, [order, participants]);

  const manage = () => openCompetencyManager(navigate);

  return (
    <div className="space-y-5" data-testid="class-evaluations-panel">
      <header className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={onBack}
          aria-label={t("players.classEvaluations.back")} data-testid="class-eval-back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold" data-testid="class-eval-title">
          {t("players.classEvaluations.title", { name: className })}
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={manage} data-testid="class-eval-manage-header">
          <Settings2 className="mr-1.5 h-4 w-4" />
          {t("players.classEvaluations.manage")}
        </Button>
      </header>

      {read.isLoading && <Skeleton className="h-40 w-full" />}
      {read.isError && (
        <p role="alert" className="text-sm text-destructive" data-testid="class-eval-error">
          {t("players.classEvaluations.loadError")}
        </p>
      )}

      {read.data && rows.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="class-eval-no-participants">
          {t("players.classEvaluations.noParticipants")}
        </p>
      )}

      {read.data && rows.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {rows.map((participant) => (
            <ParticipantRow
              key={participant.playerId}
              participant={participant}
              classRef={classRef}
              active={read.data.competencies}
              known={known.data?.competencies}
              open={openId === participant.playerId}
              onToggle={() => setOpenId((now) => (now === participant.playerId ? null : participant.playerId))}
              onManage={manage}
            />
          ))}
        </ul>
      )}

      <Button type="button" variant="outline" className="w-full" onClick={manage} data-testid="class-eval-manage-footer">
        <Plus className="mr-2 h-4 w-4" />
        {t("players.classEvaluations.manage")}
      </Button>
    </div>
  );
}

interface ParticipantRowProps {
  participant: ClassEvaluationParticipant;
  classRef: EvaluationClassRef;
  active: EvaluationCompetency[];
  /** The coach's whole set, switched-off ones included; undefined while it loads. */
  known: EvaluationCompetency[] | undefined;
  open: boolean;
  onToggle: () => void;
  onManage: () => void;
}

function ParticipantRow({ participant, classRef, active, known, open, onToggle, onManage }: ParticipantRowProps) {
  const { t } = useTranslation();
  const id = participant.playerId;
  const put = usePutEvaluationRecord(String(id));
  const record = participant.record;
  const summary = classRowSummary(active, record);
  // Today's record is edited in place; an earlier day's is shown read-only and the form
  // starts empty — its first tap starts today's record for the same occurrence.
  const todays = record?.editable ? record : null;
  // Nothing drawn above the form changes shape in answer to a tap (Q33): the first tap makes
  // TODAY's record the row's most recent one (Q28) and the earlier-day card would unmount,
  // dropping the form under the finger. The card is held while the row is open; closing
  // the row releases it. The form's session is created once, so today's id arriving does
  // not touch what the coach is editing.
  // (useHeldWhile passes `undefined` through as "not loaded yet" but holds `null`; a row can only be
  // opened once the read that carries its record has answered, so `null` here means "no earlier
  // record", never "loading". If rows ever become openable while loading, hold `undefined` instead.)
  const earlier = useHeldWhile(record && !record.editable ? record : null, open, `${id}:${open}`);

  return (
    <li data-testid={`class-eval-row-${id}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} data-testid={`class-eval-row-toggle-${id}`}
        className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent/50">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">{initials(participant.name)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{participant.name}</span>
            {participant.absent && (
              <Badge variant="secondary" className="shrink-0" data-testid={`class-eval-absent-${id}`}>
                {t("calendar.attendance.absent")}
              </Badge>
            )}
          </span>
          <span className="block text-xs text-muted-foreground" data-testid={`class-eval-summary-${id}`}
            data-rated={summary.rated} data-total={summary.total}>
            {summary.rated > 0
              ? t("players.classEvaluations.summaryRated", { rated: summary.rated, total: summary.total })
              : t("players.classEvaluations.summaryNone")}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 px-3 pb-4">
          {!known ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <ExpandedRow
              rowCompetencies={classRowCompetencies(active, todays, known)}
              known={known}
              todays={todays}
              earlier={earlier}
              playerId={id}
              onSave={(input, options) => put.mutateAsync({ ...input, classRef, keepalive: options?.keepalive })}
              onClose={onToggle}
              onManage={onManage}
            />
          )}
        </div>
      )}
    </li>
  );
}

interface ExpandedRowProps {
  rowCompetencies: EvaluationCompetency[];
  known: EvaluationCompetency[];
  todays: ClassEvaluationParticipant["record"];
  earlier: ClassEvaluationParticipant["record"];
  playerId: number;
  onSave: React.ComponentProps<typeof EvaluationForm>["onSave"];
  onClose: () => void;
  onManage: () => void;
}

function ExpandedRow({ rowCompetencies, known, todays, earlier, playerId, onSave, onClose, onManage }: ExpandedRowProps) {
  const { t } = useTranslation();

  return (
    <>
      {earlier && (
        <div data-testid={`class-eval-earlier-${playerId}`}>
          <EvaluationHistoryCard record={earlier} />
        </div>
      )}
      {rowCompetencies.length === 0 ? (
        // Never a note-only form (rule 6, AV-071).
        <div className="space-y-3 rounded-lg border border-dashed p-4 text-center" data-testid="class-eval-empty">
          <p className="text-sm text-muted-foreground">{t("players.evaluationHistory.noCompetencies")}</p>
          <Button type="button" variant="outline" size="sm" onClick={onManage} data-testid="class-eval-empty-manage">
            {t("players.classEvaluations.manage")}
          </Button>
        </div>
      ) : (
        <EvaluationForm competencies={rowCompetencies} record={todays} onSave={onSave} onClose={onClose} onManageCompetencies={onManage} />
      )}
    </>
  );
}
