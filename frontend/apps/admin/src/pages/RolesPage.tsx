import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge, Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { adminApi, type AdminRoleName, type AdminRoleRow, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useIsPhone } from "@/lib/useIsPhone";

const ROLES: AdminRoleName[] = ["support", "operator", "owner"];

function errorKey(err: unknown) {
  const code = err instanceof ApiError ? err.code : "generic";
  return ["NOT_STAFF_DOMAIN", "INVALID_ROLE", "ROLE_EXISTS", "LAST_OWNER", "ADMIN_ROLE_TOO_LOW"].includes(code) ? code : "generic";
}

type ChangeRole = (vars: { id: number; role: AdminRoleName }) => void;

/** The role: a Select the owner can change on an active grant, a Badge otherwise. */
function RoleCell({ row, owner, onChange }: { row: AdminRoleRow; owner: boolean; onChange: ChangeRole }) {
  if (!(owner && row.active)) return <Badge tone="primary">{row.role}</Badge>;
  return (
    <Select value={row.role} onChange={(e) => onChange({ id: row.id, role: e.target.value as AdminRoleName })} data-testid={`admin-role-select-${row.id}`}>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </Select>
  );
}

function ActiveBadge({ row }: { row: AdminRoleRow }) {
  const { t } = useTranslation();
  return row.active ? <Badge tone="success">{t("admin.roles.active")}</Badge> : <Badge>{t("admin.roles.revoked")}</Badge>;
}

function GrantedBy({ row }: { row: AdminRoleRow }) {
  const { t } = useTranslation();
  return <>{row.grantedByEmail ? t("admin.roles.grantedBy", { email: row.grantedByEmail }) : t("admin.roles.seeded")}</>;
}

/** Revoke is the owner's, and only on an active grant. */
function RevokeButton({ row, owner, onRevoke, pending, className }: { row: AdminRoleRow; owner: boolean; onRevoke: (id: number) => void; pending: boolean; className?: string }) {
  const { t } = useTranslation();
  if (!(owner && row.active)) return null;
  return (
    <Button variant="destructive" className={className} onClick={() => onRevoke(row.id)} disabled={pending} data-testid={`admin-role-revoke-${row.id}`}>
      {t("admin.roles.revoke")}
    </Button>
  );
}

export function RolesPage() {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const { can } = useAuth();
  const owner = can("owner");
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ["admin", "roles"], queryFn: adminApi.roles });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRoleName>("support");
  const [error, setError] = useState<string | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin"] });

  const grant = useMutation({
    mutationFn: () => adminApi.grantRole(email.trim(), role),
    onSuccess: () => {
      setEmail("");
      setError(null);
      void invalidate();
    },
    onError: (err) => setError(errorKey(err)),
  });
  const change = useMutation({
    mutationFn: ({ id, role: next }: { id: number; role: AdminRoleName }) => adminApi.changeRole(id, next),
    onSuccess: () => {
      setError(null);
      void invalidate();
    },
    onError: (err) => setError(errorKey(err)),
  });
  const revoke = useMutation({
    mutationFn: (id: number) => adminApi.revokeRole(id),
    onSuccess: () => {
      setError(null);
      void invalidate();
    },
    onError: (err) => setError(errorKey(err)),
  });

  return (
    <div>
      <PageHeader title={t("admin.roles.title")} lead={t("admin.roles.lead")} />
      {owner ? (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold">{t("admin.roles.grant")}</h2>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              grant.mutate();
            }}
          >
            <label className="flex-1 text-xs text-muted-foreground">
              {t("admin.roles.email")}
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@levapp.app" data-testid="admin-grant-email" required />
            </label>
            <label className="text-xs text-muted-foreground">
              {t("admin.roles.role")}
              <Select value={role} onChange={(e) => setRole(e.target.value as AdminRoleName)} data-testid="admin-grant-role" className="block">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </label>
            <Button type="submit" disabled={grant.isPending} data-testid="admin-grant-submit">
              {t("admin.roles.add")}
            </Button>
          </form>
        </Card>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-testid="admin-roles-error">
          {t(`admin.roles.error.${error}`)}
        </p>
      ) : null}
      <Card>
        {roles.isLoading ? <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p> : null}
        {roles.isError ? <p className="text-sm text-destructive">{t("admin.common.error")}</p> : null}
        {roles.data && roles.data.items.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.roles.none")}</p> : null}
        {roles.data && roles.data.items.length > 0 ? (
          phone ? (
            // admin.phone-console rule 3: one card per role grant; change and revoke stay in reach.
            <ul className="space-y-3" data-testid="admin-roles-table">
              {roles.data.items.map((row: AdminRoleRow) => (
                <li key={row.id} className="rounded-lg border bg-card p-4 text-sm" data-testid={`admin-role-row-${row.id}`}>
                  <div className="break-words font-medium">{row.email}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <RoleCell row={row} owner={owner} onChange={change.mutate} />
                    <ActiveBadge row={row} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <GrantedBy row={row} />
                  </p>
                  <RevokeButton row={row} owner={owner} onRevoke={revoke.mutate} pending={revoke.isPending} className="mt-3 w-full" />
                </li>
              ))}
            </ul>
          ) : (
            <table className="w-full text-sm" data-testid="admin-roles-table">
              <tbody>
                {roles.data.items.map((row: AdminRoleRow) => (
                  <tr key={row.id} className="border-t" data-testid={`admin-role-row-${row.id}`}>
                    <td className="py-2 pr-4 font-medium">{row.email}</td>
                    <td className="py-2 pr-4">
                      <RoleCell row={row} owner={owner} onChange={change.mutate} />
                    </td>
                    <td className="py-2 pr-4">
                      <ActiveBadge row={row} />
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      <GrantedBy row={row} />
                    </td>
                    <td className="py-2 text-right">
                      <RevokeButton row={row} owner={owner} onRevoke={revoke.mutate} pending={revoke.isPending} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : null}
      </Card>
    </div>
  );
}
