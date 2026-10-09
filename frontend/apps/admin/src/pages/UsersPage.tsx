import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { adminApi, ApiError, type UserRow, type UserStatus } from "@/lib/api";
import { useIsPhone } from "@/lib/useIsPhone";

export const statusTone = (s: UserStatus) => (s === "active" ? "success" : s === "disabled" ? "destructive" : "muted");

export function UsersPage() {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const [draft, setDraft] = useState("");
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<UserRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(q: string, cursor: string | null) {
    setLoading(true);
    try {
      const r = await adminApi.users(q, cursor);
      setItems(cursor ? [...(items ?? []), ...r.items] : r.items);
      setNext(r.nextCursor);
      setMessage(null);
    } catch (err) {
      if (!cursor) setItems(null);
      setMessage(err instanceof ApiError && err.code === "QUERY_TOO_SHORT" ? "tooShort" : "error");
    } finally {
      setLoading(false);
    }
  }

  function submit() {
    const q = draft.trim();
    setTerm(q);
    if (q.length < 2) {
      setItems(null);
      setNext(null);
      setMessage("tooShort");
      return;
    }
    void run(q, null);
  }

  return (
    <div>
      <PageHeader title={t("admin.users.title")} lead={t("admin.users.lead")} />
      <Card className="mb-6">
        <form
          className="flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("admin.users.placeholder")} data-testid="admin-users-search" />
          <Button type="submit" disabled={loading} data-testid="admin-users-submit">
            {t("admin.users.search")}
          </Button>
        </form>
      </Card>
      {message ? (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-testid="admin-users-message">
          {message === "tooShort" ? t("admin.users.tooShort") : t("admin.common.error")}
        </p>
      ) : null}
      {items && items.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="admin-users-empty">
          {t("admin.users.none")}
        </p>
      ) : null}
      {items && items.length > 0 ? (
        <Card>
          {phone ? (
            // admin.phone-console rule 3: one card per user, the name is the tappable primary action.
            <ul className="space-y-3" data-testid="admin-users-table">
              {items.map((u) => (
                <li key={u.userId} className="rounded-lg border bg-card p-4 text-sm" data-testid={`admin-user-row-${u.userId}`}>
                  <Link
                    to={`/users/${u.userId}`}
                    className="flex min-h-11 items-center break-words font-medium text-primary hover:underline"
                    data-testid={`admin-user-link-${u.userId}`}
                  >
                    {u.name}
                  </Link>
                  <dl className="mt-2 space-y-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("admin.users.columns.username")}</dt>
                      <dd className="break-words">{u.username}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("admin.users.columns.email")}</dt>
                      <dd className="break-words">
                        {u.email ?? "—"}{" "}
                        <Badge tone={u.emailVerified ? "success" : "warning"}>{t(u.emailVerified ? "admin.users.verified" : "admin.users.unverified")}</Badge>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("admin.users.columns.roles")}</dt>
                      <dd>{u.roles.map((r) => t(`admin.users.role.${r}`)).join(", ") || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("admin.users.columns.status")}</dt>
                      <dd>
                        <Badge tone={statusTone(u.status)}>{t(`admin.users.status.${u.status}`)}</Badge>
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          ) : (
            <table className="w-full text-sm" data-testid="admin-users-table">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  {["name", "username", "email", "roles", "status"].map((c) => (
                    <th key={c} className="pb-2 pr-4 font-medium">
                      {t(`admin.users.columns.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.userId} className="border-t" data-testid={`admin-user-row-${u.userId}`}>
                    <td className="py-2 pr-4 font-medium">
                      <Link to={`/users/${u.userId}`} className="text-primary hover:underline" data-testid={`admin-user-link-${u.userId}`}>
                        {u.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{u.username}</td>
                    <td className="py-2 pr-4">
                      {u.email ?? "—"}{" "}
                      <Badge tone={u.emailVerified ? "success" : "warning"}>{t(u.emailVerified ? "admin.users.verified" : "admin.users.unverified")}</Badge>
                    </td>
                    <td className="py-2 pr-4">{u.roles.map((r) => t(`admin.users.role.${r}`)).join(", ") || "—"}</td>
                    <td className="py-2">
                      <Badge tone={statusTone(u.status)}>{t(`admin.users.status.${u.status}`)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {next ? (
            <Button variant="secondary" className="mt-4 w-full md:w-auto" disabled={loading} onClick={() => void run(term, next)} data-testid="admin-users-more">
              {t("admin.users.loadMore")}
            </Button>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
