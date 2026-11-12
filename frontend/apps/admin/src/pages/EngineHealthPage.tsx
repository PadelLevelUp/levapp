import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { ScrollTable } from "@/components/ScrollTable";
import { adminApi, type DeployIdentity, type EngineHealth, type EngineHealthEngine, type IncidentKind, type PushReceiptStatus } from "@/lib/api";

const KINDS: IncidentKind[] = [
  "email_failed", "push_failed", "reminder_skipped_past_due", "push_registration_failed",
  "stream_refused", "push_dropped",
];
const RECEIPT_STATUSES: PushReceiptStatus[] = ["ok", "error", "expired", "pending"];

function Stat({ label, value, testId }: { label: string; value: string | number; testId?: string }) {
  return (
    <div className="min-w-28">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold" data-testid={testId}>{value}</p>
    </div>
  );
}

function useAge() {
  const { t } = useTranslation();
  return (seconds: number | null) => {
    if (seconds == null) return "—";
    if (seconds < 3600) return t("admin.engineHealth.minutes", { n: Math.floor(seconds / 60) });
    if (seconds < 86400) return t("admin.engineHealth.hours", { n: Math.floor(seconds / 3600) });
    return t("admin.engineHealth.days", { n: Math.floor(seconds / 86400) });
  };
}

function Identity({ id, testId }: { id: DeployIdentity | string | null | undefined; testId: string }) {
  const { t } = useTranslation();
  // Rule 5: the other environment answers whatever it answers; nothing it sends may break the page.
  if (id == null || typeof id !== "object") {
    const text = typeof id === "string" ? id : "unreachable";
    const notConfigured = text.includes("not configured");
    return <Badge tone={notConfigured ? "muted" : "warning"}>{t(`admin.engineHealth.deploy.${notConfigured ? "notConfigured" : "unreachable"}`)}</Badge>;
  }
  return (
    <dl className="text-sm" data-testid={testId}>
      <dt className="text-xs text-muted-foreground">{t("admin.engineHealth.deploy.sha")}</dt>
      <dd className="font-mono">{String(id.gitSha ?? "unknown").slice(0, 12)}</dd>
      <dt className="mt-1 text-xs text-muted-foreground">{t("admin.engineHealth.deploy.head")}</dt>
      <dd className="font-mono">{id.alembicHead ? String(id.alembicHead) : "—"}</dd>
    </dl>
  );
}

/** Rule 10 (PAD-913): the new engine's counts, beside the old engine's cards while coaches move. */
function EngineBlock({ engine }: { engine: EngineHealthEngine }) {
  const { t } = useTranslation();
  const k = "admin.engineHealth.engine";
  // Tier 0 is the coach's list, 1 the students' waiting list, n ≥ 2 group n − 1.
  const tierLabel = (tier: number) =>
    tier === 0 ? t(`${k}.invitations.coachList`) : tier === 1 ? t(`${k}.invitations.waitingList`) : t(`${k}.invitations.group`, { n: tier - 1 });
  return (
    <Card className="md:col-span-2" data-testid="admin-eh-engine">
      <h2 className="mb-1 font-semibold">{t(`${k}.title`)}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{t(`${k}.hint`)}</p>
      <div className="flex flex-wrap gap-6" data-testid="admin-eh-engine-coaches">
        <Stat label={t(`${k}.coachesOld`)} value={engine.coaches.old} testId="admin-eh-engine-coaches-old" />
        <Stat label={t(`${k}.coachesNew`)} value={engine.coaches.new} testId="admin-eh-engine-coaches-new" />
        <Stat label={t(`${k}.sessionsUpcoming`)} value={engine.sessions.upcoming} testId="admin-eh-engine-sessions-upcoming" />
        <Stat label={t(`${k}.sessions7d`)} value={engine.sessions.next7Days} testId="admin-eh-engine-sessions-7d" />
      </div>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <section data-testid="admin-eh-engine-open-spots">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t(`${k}.spots.title`)}</h3>
          <Stat label={t(`${k}.spots.uncovered`)} value={engine.openSpots.uncovered} testId="admin-eh-engine-spots-uncovered" />
          {engine.openSpots.byType.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t(`${k}.spots.none`)}</p>
          ) : (
            <ul className="mt-2 text-sm">
              {engine.openSpots.byType.map((s) => (
                <li key={`${s.side ?? "either"}-${s.levelId ?? "any"}`} data-testid={`admin-eh-engine-spot-${s.side ?? "either"}-${s.levelId ?? "any"}`}>
                  {t(`${k}.spots.${s.side ?? "either"}`)} · {s.levelId == null ? t(`${k}.spots.anyLevel`) : (s.levelLabel ?? `#${s.levelId}`)}: <strong>{s.open}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section data-testid="admin-eh-engine-invitations">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t(`${k}.invitations.title`)}</h3>
          <div className="flex flex-wrap gap-6">
            <Stat label={t(`${k}.invitations.counting`)} value={engine.invitations.counting} testId="admin-eh-engine-invitations-counting" />
            <Stat label={t(`${k}.invitations.notCounting`)} value={engine.invitations.openNotCounting} testId="admin-eh-engine-invitations-not-counting" />
            <Stat label={t(`${k}.invitations.sent24h`)} value={engine.invitations.sentLast24h} testId="admin-eh-engine-invitations-sent-24h" />
          </div>
          <ScrollTable testId="admin-eh-engine-tiers-table">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-1 pr-4">{t(`${k}.invitations.tier`)}</th><th className="py-1 pr-4">{t(`${k}.invitations.counting`)}</th><th className="py-1">{t(`${k}.invitations.notCounting`)}</th></tr>
            </thead>
            <tbody>
              {engine.invitations.byTier.map((r) => (
                <tr key={r.tier} className="border-t" data-testid={`admin-eh-engine-tier-${r.tier}`}>
                  <td className="py-1 pr-4">{tierLabel(r.tier)}</td>
                  <td className="py-1 pr-4">{r.counting}</td>
                  <td className="py-1">{r.openNotCounting}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        </section>
        <section data-testid="admin-eh-engine-approvals">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t(`${k}.approvals.title`)}</h3>
          <div className="flex flex-wrap gap-6">
            <Stat label={t(`${k}.approvals.pending`)} value={engine.approvals.pending} testId="admin-eh-engine-approvals-pending" />
            <Stat label={t(`${k}.approvals.dismissed`)} value={engine.approvals.dismissed} testId="admin-eh-engine-approvals-dismissed" />
          </div>
        </section>
        <section data-testid="admin-eh-engine-alerts">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t(`${k}.alerts.title`)}</h3>
          {engine.alerts.byReason.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t(`${k}.alerts.none`)}</p>
          ) : (
            <ul className="text-sm">
              {engine.alerts.byReason.map((a) => (
                <li key={a.reason}><code className="text-xs">{a.reason}</code>: <strong>{a.count}</strong></li>
              ))}
            </ul>
          )}
        </section>
        <section data-testid="admin-eh-engine-outbox">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t(`${k}.outbox.title`)}</h3>
          <div className="flex flex-wrap gap-6">
            <Stat label={t(`${k}.outbox.pending`)} value={engine.outbox.pending} testId="admin-eh-engine-outbox-pending" />
            <Stat label={t(`${k}.outbox.stuck`)} value={engine.outbox.stuckOver5Min} testId="admin-eh-engine-outbox-stuck" />
          </div>
        </section>
        <section data-testid="admin-eh-engine-tick">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t(`${k}.tick.title`)}</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{t(`${k}.tick.job`)}</span>
            <span data-testid="admin-eh-engine-tick-present"><Badge tone={engine.tick.present ? "success" : "destructive"}>{t(`admin.engineHealth.scheduler.${engine.tick.present ? "present" : "missing"}`)}</Badge></span>
            <span data-testid="admin-eh-engine-tick-overdue"><Badge tone={engine.tick.overdue ? "destructive" : "success"}>{t(`${k}.tick.${engine.tick.overdue ? "overdue" : "onTime"}`)}</Badge></span>
          </div>
          <div className="mt-2">
            <Stat label={t(`${k}.tick.failures`)} value={engine.tick.sessionFailures24h} testId="admin-eh-engine-tick-failures" />
          </div>
        </section>
      </div>
    </Card>
  );
}

function Summary({ data }: { data: EngineHealth }) {
  const { t, i18n } = useTranslation();
  const age = useAge();
  const sched = data.scheduler;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card data-testid="admin-eh-vacancies">
        <h2 className="mb-3 font-semibold">{t("admin.engineHealth.vacancies.title")}</h2>
        <div className="flex flex-wrap gap-6">
          <Stat label={t("admin.engineHealth.vacancies.open")} value={data.vacancies.open} testId="admin-eh-vacancies-open" />
          <Stat label={t("admin.engineHealth.vacancies.pending")} value={data.vacancies.pendingApproval} />
          <Stat label={t("admin.engineHealth.vacancies.oldest")} value={age(data.vacancies.oldestOpenAgeSeconds)} />
        </div>
        <ul className="mt-3 text-sm">
          {data.vacancies.byRoundAndBatch.map((r) => (
            <li key={`${r.round}-${r.batch}`}>
              {t("admin.engineHealth.vacancies.round", { round: r.round, batch: r.batch })}: <strong>{r.count}</strong>
            </li>
          ))}
        </ul>
      </Card>
      <Card data-testid="admin-eh-invitations">
        <h2 className="mb-3 font-semibold">{t("admin.engineHealth.invitations.title")}</h2>
        <Stat label={t("admin.engineHealth.invitations.live")} value={data.invitations.live} testId="admin-eh-invitations-live" />
        <ul className="mt-3 text-sm">
          {data.invitations.byRound.map((r) => (
            <li key={String(r.round)}>
              {r.round === 0 ? t("admin.engineHealth.invitations.waitingList") : t("admin.engineHealth.invitations.round", { round: r.round ?? "—" })}: <strong>{r.count}</strong>
            </li>
          ))}
        </ul>
      </Card>
      <Card data-testid="admin-eh-scheduler">
        <h2 className="mb-3 font-semibold">{t("admin.engineHealth.scheduler.title")}</h2>
        {!sched.available ? (
          <p className="text-sm text-muted-foreground">{t("admin.engineHealth.scheduler.unavailable")}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-6">
              <Stat label={t("admin.engineHealth.scheduler.total")} value={sched.total} />
              <Stat label={t("admin.engineHealth.scheduler.overdue")} value={sched.overdue} testId="admin-eh-scheduler-overdue" />
            </div>
            <ul className="mt-3 text-sm">
              {Object.entries(sched.singletons).map(([name, present]) => (
                <li key={name} className="flex items-center gap-2">
                  <code className="text-xs">{name}</code>
                  <Badge tone={present ? "success" : "destructive"}>{t(`admin.engineHealth.scheduler.${present ? "present" : "missing"}`)}</Badge>
                </li>
              ))}
              {Object.entries(sched.byFamily).map(([family, n]) => (
                <li key={family}><code className="text-xs">{family}</code>: <strong>{n}</strong></li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card data-testid="admin-eh-accounts">
        <h2 className="mb-3 font-semibold">{t("admin.engineHealth.accounts.title")}</h2>
        <div className="flex flex-wrap gap-6">
          <Stat label={t("admin.engineHealth.accounts.users")} value={Object.values(data.accounts.users).reduce((a, b) => a + b, 0)} />
          <Stat label={t("admin.engineHealth.accounts.coaches")} value={Object.values(data.accounts.coaches).reduce((a, b) => a + b, 0)} />
          <Stat label={t("admin.engineHealth.accounts.players")} value={data.accounts.players} />
          <Stat label={t("admin.engineHealth.accounts.new7d")} value={data.accounts.createdLast7d} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {Object.entries(data.accounts.coaches).map(([k, n]) => `${k} ${n}`).join(" · ")}
        </p>
      </Card>
      {data.push && (
        <Card className="md:col-span-2" data-testid="admin-eh-push">
          <h2 className="mb-3 font-semibold">{t("admin.engineHealth.push.title")}</h2>
          <div className="flex flex-wrap gap-6">
            <Stat label={t("admin.engineHealth.push.active")} value={data.push.activeStudents7d.total} testId="admin-eh-push-active" />
            <Stat label={t("admin.engineHealth.push.noChannel")} value={data.push.activeStudents7d.noChannel} testId="admin-eh-push-no-channel" />
            <Stat label={t("admin.engineHealth.push.webPushOnly")} value={data.push.activeStudents7d.webPushOnly} testId="admin-eh-push-web-only" />
            <Stat label={t("admin.engineHealth.push.native")} value={data.push.activeStudents7d.nativeOnly + data.push.activeStudents7d.nativeAndWebPush} testId="admin-eh-push-native" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground" data-testid="admin-eh-push-failures">
            {t("admin.engineHealth.push.failures7d")}:{" "}
            {(["ios", "android", "web"] as const).map((p) => `${p} ${data.push!.registrationFailures7d[p]}`).join(" · ")}
          </p>
        </Card>
      )}
      <Card className="md:col-span-2" data-testid="admin-eh-incidents">
        <h2 className="mb-3 font-semibold">{t("admin.engineHealth.incidents.title")}</h2>
        <ScrollTable testId="admin-eh-incidents-table">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="py-1 pr-4" /><th className="py-1 pr-4">{t("admin.engineHealth.incidents.last24h")}</th><th className="py-1">{t("admin.engineHealth.incidents.last7d")}</th></tr>
          </thead>
          <tbody>
            {KINDS.map((k) => (
              <tr key={k} className="border-t">
                <td className="py-1 pr-4">{t(`admin.engineHealth.incidents.kind.${k}`)}</td>
                <td className="py-1 pr-4" data-testid={`admin-eh-incidents-24h-${k}`}>{data.incidents.last24h[k]}</td>
                <td className="py-1">{data.incidents.last7d[k]}</td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
        <h3 className="mt-4 text-xs font-medium text-muted-foreground">{t("admin.engineHealth.incidents.recent")}</h3>
        {data.incidents.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.engineHealth.incidents.none")}</p>
        ) : (
          <ul className="mt-1 text-xs">
            {data.incidents.recent.map((r) => (
              <li key={r.id} className="break-words border-t py-1 font-mono">
                {new Date(r.createdAt).toLocaleString(i18n.language)} · {r.kind} · {r.channel}
                {r.subjectType ? ` · ${r.subjectType} ${r.subjectId ?? ""}` : ""}
                {r.errorClass ? ` · ${r.errorClass}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {data.pushReceipts && (
        <Card className="md:col-span-2" data-testid="admin-eh-receipts">
          <h2 className="mb-1 font-semibold">{t("admin.engineHealth.receipts.title")}</h2>
          <p className="mb-3 text-xs text-muted-foreground">{t("admin.engineHealth.receipts.hint")}</p>
          <ScrollTable testId="admin-eh-receipts-table">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-1 pr-4" /><th className="py-1 pr-4">{t("admin.engineHealth.incidents.last24h")}</th><th className="py-1">{t("admin.engineHealth.incidents.last7d")}</th></tr>
            </thead>
            <tbody>
              {RECEIPT_STATUSES.map((st) => (
                <tr key={st} className="border-t">
                  <td className="py-1 pr-4">{t(`admin.engineHealth.receipts.status.${st}`)}</td>
                  <td className="py-1 pr-4" data-testid={`admin-eh-receipts-24h-${st}`}>{data.pushReceipts!.last24h[st]}</td>
                  <td className="py-1">{data.pushReceipts!.last7d[st]}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
          {Object.keys(data.pushReceipts.last7d.errorsByCode).length > 0 && (
            <p className="mt-2 break-words font-mono text-xs" data-testid="admin-eh-receipts-codes">
              {Object.entries(data.pushReceipts.last7d.errorsByCode).map(([code, n]) => `${code} ${n}`).join(" · ")}
            </p>
          )}
        </Card>
      )}
      <Card className="md:col-span-2" data-testid="admin-eh-deploy">
        <h2 className="mb-3 font-semibold">{t("admin.engineHealth.deploy.title")}</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div><p className="mb-1 text-xs font-medium">{t("admin.engineHealth.deploy.this")}</p><Identity id={data.deploy.this} testId="admin-eh-deploy-this" /></div>
          <div><p className="mb-1 text-xs font-medium">{t("admin.engineHealth.deploy.other")}</p><Identity id={data.deploy.other} testId="admin-eh-deploy-other" /></div>
        </div>
      </Card>
      {data.engine && <EngineBlock engine={data.engine} />}
    </div>
  );
}

function CoachView() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [coachId, setCoachId] = useState<number | null>(null);
  const list = useQuery({ queryKey: ["admin", "engine-health", "coaches", q], queryFn: () => adminApi.engineHealthCoaches(q), enabled: q.length >= 2 });
  const detail = useQuery({ queryKey: ["admin", "engine-health", "coach", coachId], queryFn: () => adminApi.engineHealthCoach(coachId as number), enabled: coachId != null });
  return (
    <Card className="mt-6" data-testid="admin-eh-coaches">
      <h2 className="mb-3 font-semibold">{t("admin.engineHealth.coaches.title")}</h2>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setQ(draft.trim()); setCoachId(null); }}>
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("admin.engineHealth.coaches.search")} data-testid="admin-eh-coach-search" className="w-72 max-w-full" />
        <Button type="submit" variant="secondary">{t("admin.engineHealth.coaches.search")}</Button>
      </form>
      {list.data && list.data.coaches.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("admin.engineHealth.coaches.none")}</p> : null}
      <ul className="mt-2 text-sm">
        {list.data?.coaches.map((c) => (
          <li key={c.coachId}>
            <button type="button" className="underline" onClick={() => setCoachId(c.coachId)} data-testid={`admin-eh-coach-${c.coachId}`}>{c.name}</button>
          </li>
        ))}
      </ul>
      {detail.data ? (
        <div className="mt-4 text-sm" data-testid="admin-eh-coach-detail">
          <div className="flex flex-wrap gap-6">
            <Stat label={t("admin.engineHealth.coaches.openVacancies")} value={detail.data.openVacancies} />
            <Stat label={t("admin.engineHealth.coaches.liveInvitations")} value={detail.data.liveInvitations} />
            <Stat label={t("admin.engineHealth.coaches.jobs")} value={detail.data.scheduledJobs.length} />
          </div>
          <p className="mt-3 text-xs font-medium text-muted-foreground">{t("admin.engineHealth.coaches.settings")}</p>
          <code className="block whitespace-pre-wrap break-words text-xs">{JSON.stringify(detail.data.settings, null, 2)}</code>
        </div>
      ) : null}
    </Card>
  );
}

export function EngineHealthPage() {
  const { t, i18n } = useTranslation();
  // Rule 7: refreshed only on demand, never polled.
  const query = useQuery({
    queryKey: ["admin", "engine-health"],
    queryFn: adminApi.engineHealth,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
  return (
    <div>
      <PageHeader title={t("admin.engineHealth.title")} lead={t("admin.engineHealth.lead")} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => void query.refetch()} disabled={query.isFetching} data-testid="admin-eh-refresh">{t("admin.engineHealth.refresh")}</Button>
        {query.data ? <span className="text-xs text-muted-foreground">{t("admin.engineHealth.computedAt", { when: new Date(query.data.computedAt).toLocaleString(i18n.language) })}</span> : null}
      </div>
      {query.isLoading ? <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p> : null}
      {query.isError ? <p className="text-sm text-destructive">{t("admin.common.error")}</p> : null}
      {query.data ? <Summary data={query.data} /> : null}
      <CoachView />
    </div>
  );
}
