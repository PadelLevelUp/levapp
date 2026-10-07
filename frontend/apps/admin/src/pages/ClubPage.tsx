import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { adminApi, ApiError, type CourtRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function message(err: unknown) {
  if (err instanceof ApiError) return err.message || err.code;
  return null;
}

/**
 * admin.clubs-and-switches rules 1–3 (PAD-533): one club — its fields, its courts (add, rename,
 * delete, reorder) and its coaches (link by id, unlink). Operators edit; support reads.
 */
export function ClubPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const editable = can("operator");
  const id = Number(useParams().clubId);
  const qc = useQueryClient();
  const club = useQuery({ queryKey: ["admin", "club", id], queryFn: () => adminApi.club(id) });
  const [fields, setFields] = useState({ name: "", description: "", location: "" });
  const [newCourt, setNewCourt] = useState("");
  const [coachId, setCoachId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (club.data) {
      setFields({
        name: club.data.name ?? "",
        description: club.data.description ?? "",
        location: club.data.location ?? "",
      });
    }
  }, [club.data]);

  const done = (note: string | null = null) => {
    setProblem(null);
    setNotice(note);
    void qc.invalidateQueries({ queryKey: ["admin"] });
  };
  const failed = (err: unknown) => {
    setNotice(null);
    setProblem(message(err) ?? t("admin.common.error"));
  };

  const save = useMutation({ mutationFn: () => adminApi.editClub(id, fields), onSuccess: () => done(t("admin.clubs.saved")), onError: failed });
  const add = useMutation({ mutationFn: () => adminApi.addCourt(id, newCourt.trim()), onSuccess: () => { setNewCourt(""); done(); }, onError: failed });
  const rename = useMutation({ mutationFn: ({ court, name }: { court: CourtRow; name: string }) => adminApi.renameCourt(court.id, name), onSuccess: () => done(), onError: failed });
  const remove = useMutation({ mutationFn: (court: CourtRow) => adminApi.deleteCourt(court.id), onSuccess: () => done(), onError: failed });
  const reorder = useMutation({ mutationFn: (ids: number[]) => adminApi.reorderCourts(id, ids), onSuccess: () => done(), onError: failed });
  const link = useMutation({ mutationFn: () => adminApi.linkCoach(id, Number(coachId)), onSuccess: () => { setCoachId(""); done(); }, onError: failed });
  const unlink = useMutation({
    mutationFn: (coach: number) => adminApi.unlinkCoach(id, coach),
    onSuccess: (res) => done(res.warning === "COACH_HAS_NO_CLUB" ? t("admin.clubs.coachHasNoClub") : null),
    onError: failed,
  });

  if (club.isLoading) return <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p>;
  if (club.isError || !club.data) return <p className="text-sm text-destructive">{t("admin.common.error")}</p>;
  const courts = club.data.courtsList;
  const move = (index: number, delta: number) => {
    const ids = courts.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved);
    reorder.mutate(ids);
  };

  return (
    <div data-testid="club-page">
      <PageHeader title={club.data.name} lead={t("admin.clubs.detailLead")} />
      {notice ? <p className="mb-3 text-sm" data-testid="club-notice">{notice}</p> : null}
      {problem ? <p className="mb-3 text-sm text-destructive" data-testid="club-problem">{problem}</p> : null}

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold">{t("admin.clubs.fields")}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["name", "description", "location"] as const).map((key) => (
            <label key={key} className="text-sm">
              <span className="mb-1 block text-muted-foreground">{t(`admin.clubs.${key}`)}</span>
              <Input
                data-testid={`club-field-${key}`}
                value={fields[key]}
                disabled={!editable}
                onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        {editable ? (
          <Button className="mt-3" data-testid="club-save" disabled={save.isPending} onClick={() => save.mutate()}>
            {t("admin.clubs.save")}
          </Button>
        ) : null}
      </Card>

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold">{t("admin.clubs.courts")}</h2>
        <ul className="space-y-2" data-testid="club-courts">
          {courts.map((court, index) => (
            <li key={court.id} className="flex flex-wrap items-center gap-2" data-testid={`club-court-${court.id}`}>
              <span className="min-w-32 text-sm">{court.name}</span>
              {editable ? (
                <>
                  <Button variant="ghost" aria-label={t("admin.clubs.up")} disabled={index === 0} onClick={() => move(index, -1)}>↑</Button>
                  <Button variant="ghost" aria-label={t("admin.clubs.down")} disabled={index === courts.length - 1} onClick={() => move(index, 1)}>↓</Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const name = window.prompt(t("admin.clubs.renamePrompt"), court.name);
                      if (name && name.trim() && name.trim() !== court.name) rename.mutate({ court, name: name.trim() });
                    }}
                  >
                    {t("admin.clubs.rename")}
                  </Button>
                  <Button
                    variant="destructive"
                    data-testid={`club-court-delete-${court.id}`}
                    onClick={() => {
                      if (window.confirm(t("admin.clubs.deleteConfirm", { name: court.name }))) remove.mutate(court);
                    }}
                  >
                    {t("admin.clubs.delete")}
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
        {editable ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newCourt.trim()) add.mutate();
            }}
          >
            <Input data-testid="club-new-court" placeholder={t("admin.clubs.newCourt")} value={newCourt} onChange={(e) => setNewCourt(e.target.value)} />
            <Button type="submit" data-testid="club-add-court">{t("admin.clubs.addCourt")}</Button>
          </form>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">{t("admin.clubs.coaches")}</h2>
        <ul className="space-y-2" data-testid="club-coaches">
          {club.data.coachesList.map((coach) => (
            <li key={coach.coachId} className="flex items-center gap-2 text-sm" data-testid={`club-coach-${coach.coachId}`}>
              <span>{coach.name ?? `#${coach.coachId}`}</span>
              {coach.email ? <Badge>{coach.email}</Badge> : null}
              {editable ? (
                <Button variant="secondary" data-testid={`club-coach-unlink-${coach.coachId}`} onClick={() => unlink.mutate(coach.coachId)}>
                  {t("admin.clubs.unlink")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {editable ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (/^\d+$/.test(coachId)) link.mutate();
            }}
          >
            <Input data-testid="club-link-coach-id" inputMode="numeric" placeholder={t("admin.clubs.coachId")} value={coachId} onChange={(e) => setCoachId(e.target.value)} />
            <Button type="submit" data-testid="club-link-coach">{t("admin.clubs.link")}</Button>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
