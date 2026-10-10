import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Card, Input, PageHeader } from "@/components/ui";
import { ScrollTable } from "@/components/ScrollTable";
import { adminApi } from "@/lib/api";

/** admin.clubs-and-switches rule 1 (PAD-533): clubs by name, with their counts. */
export function ClubsPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const clubs = useQuery({ queryKey: ["admin", "clubs", q], queryFn: () => adminApi.clubs(q) });

  return (
    <div>
      <PageHeader title={t("admin.clubs.title")} lead={t("admin.clubs.lead")} />
      <Input
        data-testid="clubs-search"
        className="mb-4 max-w-sm"
        placeholder={t("admin.clubs.search")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <Card>
        {clubs.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p>
        ) : clubs.isError ? (
          <p className="text-sm text-destructive">{t("admin.common.error")}</p>
        ) : (clubs.data?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.clubs.empty")}</p>
        ) : (
          <ScrollTable testId="clubs-table">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2">{t("admin.clubs.name")}</th>
                <th className="py-2">{t("admin.clubs.coaches")}</th>
                <th className="py-2">{t("admin.clubs.players")}</th>
                <th className="py-2">{t("admin.clubs.courts")}</th>
                <th className="py-2">{t("admin.clubs.lessons")}</th>
              </tr>
            </thead>
            <tbody>
              {clubs.data!.items.map((club) => (
                <tr key={club.id} className="border-t" data-testid={`club-row-${club.id}`}>
                  <td className="py-2">
                    <Link className="inline-flex min-h-11 items-center font-medium underline-offset-2 hover:underline md:min-h-0" to={`/clubs/${club.id}`}>
                      {club.name}
                    </Link>
                  </td>
                  <td className="py-2">{club.coaches}</td>
                  <td className="py-2">{club.players}</td>
                  <td className="py-2">{club.courts}</td>
                  <td className="py-2">{club.lessons}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
      </Card>
    </div>
  );
}
