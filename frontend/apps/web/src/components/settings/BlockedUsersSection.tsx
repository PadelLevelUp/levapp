import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getBlockedUsers, unblockUser } from "@/api/messages";
import type { BlockedUser } from "@/types";

/**
 * messaging.block-and-report rule 10 (PAD-215): the viewer's own blocks,
 * manageable outside the thread. Both roles — a block is per user, not per
 * role (settings.role-scope rule 2 keeps Account open to students).
 */
export function BlockedUsersSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [users, setUsers] = useState<BlockedUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBlockedUsers()
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUnblock = async (user: BlockedUser) => {
    const id = String(user.id);
    setBusyId(id);
    try {
      await unblockUser(id);
      setUsers((prev) => (prev ? prev.filter((u) => String(u.id) !== id) : prev));
      toast({ title: t("settings.account.blockedUsers.unblocked", { name: user.name }) });
    } catch {
      toast({ title: t("settings.account.blockedUsers.unblockFailed"), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section data-testid="blocked-users" className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Ban className="h-4 w-4" />
          {t("settings.account.blockedUsers.title")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.account.blockedUsers.description")}
        </p>
      </div>

      {failed ? (
        <p className="text-sm text-destructive">{t("settings.account.blockedUsers.loadFailed")}</p>
      ) : users === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : users.length === 0 ? (
        <p data-testid="blocked-users-empty" className="text-sm text-muted-foreground">
          {t("settings.account.blockedUsers.empty")}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {users.map((user) => (
            <li
              key={user.id}
              data-testid={`blocked-user-${user.id}`}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="text-sm">{user.name}</span>
              <Button
                size="sm"
                variant="outline"
                data-testid={`blocked-user-unblock-${user.id}`}
                disabled={busyId === String(user.id)}
                onClick={() => void handleUnblock(user)}
              >
                {busyId === String(user.id) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("settings.account.blockedUsers.unblock")
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
