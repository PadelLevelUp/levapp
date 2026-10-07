import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge, Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { adminApi, type AdminRoleName, type AdminRoleRow, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const ROLES: AdminRoleName[] = ["support", "operator", "owner"];

function errorKey(err: unknown) {
  const code = err instanceof ApiError ? err.code : "generic";
  return ["NOT_STAFF_DOMAIN", "INVALID_ROLE", "ROLE_EXISTS", "LAST_OWNER", "ADMIN_ROLE_TOO_LOW"].includes(code) ? code : "generic";
}

export function RolesPage() {
  const { t } = useTranslation();
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
          <table className="w-full text-sm" data-testid="admin-roles-table">
            <tbody>
              {roles.data.items.map((row: AdminRoleRow) => (
                <tr key={row.id} className="border-t" data-testid={`admin-role-row-${row.id}`}>
                  <td className="py-2 pr-4 font-medium">{row.email}</td>
                  <td className="py-2 pr-4">
                    {owner && row.active ? (
                      <Select value={row.role} onChange={(e) => change.mutate({ id: row.id, role: e.target.value as AdminRoleName })} data-testid={`admin-role-select-${row.id}`}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Badge tone="primary">{row.role}</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-4">{row.active ? <Badge tone="success">{t("admin.roles.active")}</Badge> : <Badge>{t("admin.roles.revoked")}</Badge>}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {row.grantedByEmail ? t("admin.roles.grantedBy", { email: row.grantedByEmail }) : t("admin.roles.seeded")}
                  </td>
                  <td className="py-2 text-right">
                    {owner && row.active ? (
                      <Button variant="destructive" onClick={() => revoke.mutate(row.id)} disabled={revoke.isPending} data-testid={`admin-role-revoke-${row.id}`}>
                        {t("admin.roles.revoke")}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Card>
    </div>
  );
}
