import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthContext";
import { postLoginPath } from "@/auth/postLoginPath";
import {
  type ClubSearchResult,
  createClub,
  createClubJoinRequest,
  searchClubs,
  withdrawClubJoinRequest,
} from "@/api/clubs";
import { ArrowLeft, Building2, Clock, Loader2, Plus, Search } from "lucide-react";

type Mode = "choose" | "create" | "join";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_CHARS = 2;

/**
 * clubs.join-request rule 7 — an approved coach with no club picks one here.
 *
 * Two paths from the choice screen: create a club (instant membership → the
 * dashboard) or search existing clubs and ask to join one (a pending request
 * a member of that club decides on). While a request is pending the page
 * shows the club name, Withdraw, and "Create my own club instead". The
 * session's `clubs` / `pendingClubJoinRequest` are refreshed after every
 * write so HomeRoute/ProtectedRoute stop (or start) redirecting on the next
 * render; a fresh `/auth/me` on mount moves an already-approved coach on.
 */
const ClubOnboardingPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, logout, refreshUser } = useAuth();

  const [mode, setMode] = useState<Mode>("choose");
  const [busy, setBusy] = useState(false);
  const [clubName, setClubName] = useState("");
  const [clubLocation, setClubLocation] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClubSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const pending = user?.pendingClubJoinRequest ?? null;

  // A coach approved for a club (or who created one in another tab) does not
  // belong here any more — same refresh-on-mount pattern as CoachPendingPage.
  useEffect(() => {
    let active = true;
    void refreshUser().then((me) => {
      if (!active || !me) return;
      const target = postLoginPath(me);
      if (target !== "/club-onboarding") navigate(target, { replace: true });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced name search, min 2 chars (clubs.join-request rule 1).
  useEffect(() => {
    if (mode !== "join") return;
    const q = query.trim();
    if (q.length < SEARCH_MIN_CHARS) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const handle = setTimeout(() => {
      searchClubs(q)
        .then((rows) => {
          if (!cancelled) setResults(rows);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, mode]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = clubName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await createClub({ name, location: clubLocation.trim() || undefined });
      const me = await refreshUser();
      toast({ title: t("auth.clubOnboarding.created", { name }) });
      navigate(me ? postLoginPath(me) : "/dashboard", { replace: true });
    } catch {
      toast({ variant: "destructive", title: t("auth.clubOnboarding.createFailed") });
    } finally {
      setBusy(false);
    }
  };

  const handleRequest = useCallback(
    async (club: ClubSearchResult) => {
      setBusy(true);
      try {
        await createClubJoinRequest(club.id);
        await refreshUser();
        toast({ title: t("auth.clubOnboarding.requested", { name: club.name }) });
        setMode("choose");
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        toast({
          variant: "destructive",
          title:
            status === 409
              ? t("auth.clubOnboarding.requestDuplicate")
              : t("auth.clubOnboarding.requestFailed"),
        });
      } finally {
        setBusy(false);
      }
    },
    [refreshUser, t, toast]
  );

  const handleWithdraw = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await withdrawClubJoinRequest(pending.id);
      await refreshUser();
      toast({ title: t("auth.clubOnboarding.withdrawn") });
    } catch {
      toast({ variant: "destructive", title: t("auth.clubOnboarding.withdrawFailed") });
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    logout();
    navigate("/auth", { replace: true });
  };

  const renderBody = () => {
    // Pending request wins over every mode except an explicit "create instead".
    if (pending && mode !== "create") {
      return (
        <div className="space-y-4" data-testid="club-onboarding-pending">
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="font-medium">{pending.clubName}</p>
              <p className="text-sm text-muted-foreground">
                {t("auth.clubOnboarding.waitingForApproval")}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{t("auth.clubOnboarding.pendingHint")}</p>
          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => void handleWithdraw()}
            data-testid="club-onboarding-withdraw"
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("auth.clubOnboarding.withdraw")}
          </Button>
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => setMode("create")}
            data-testid="club-onboarding-create-instead"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("auth.clubOnboarding.createInstead")}
          </Button>
        </div>
      );
    }

    if (mode === "create") {
      return (
        <form className="space-y-4" onSubmit={handleCreate} data-testid="club-onboarding-create-form">
          <div className="space-y-2">
            <Label htmlFor="club-create-name">{t("auth.clubOnboarding.clubName")}</Label>
            <Input
              id="club-create-name"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              placeholder={t("auth.clubOnboarding.clubNamePlaceholder")}
              autoFocus
              required
              data-testid="club-create-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="club-create-location">{t("auth.clubOnboarding.clubLocation")}</Label>
            <Input
              id="club-create-location"
              value={clubLocation}
              onChange={(e) => setClubLocation(e.target.value)}
              placeholder={t("auth.clubOnboarding.clubLocationPlaceholder")}
              data-testid="club-create-location"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={busy || !clubName.trim()}
            data-testid="club-create-submit"
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {t("auth.clubOnboarding.createSubmit")}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("choose")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("common.back")}
          </Button>
        </form>
      );
    }

    if (mode === "join") {
      const q = query.trim();
      return (
        <div className="space-y-4" data-testid="club-onboarding-join-form">
          <div className="space-y-2">
            <Label htmlFor="club-search-input">{t("auth.clubOnboarding.searchLabel")}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="club-search-input"
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("auth.clubOnboarding.searchPlaceholder")}
                autoFocus
                data-testid="club-search-input"
              />
            </div>
          </div>
          {q.length < SEARCH_MIN_CHARS ? (
            <p className="text-sm text-muted-foreground">{t("auth.clubOnboarding.searchHint")}</p>
          ) : searching ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="club-search-empty">
              {t("auth.clubOnboarding.searchEmpty")}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border" data-testid="club-search-results">
              {results.map((club) => (
                <li key={club.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {club.logoUrl ? (
                      <img src={club.logoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Building2 className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{club.name}</p>
                      {club.location && (
                        <p className="truncate text-xs text-muted-foreground">{club.location}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleRequest(club)}
                    data-testid={`club-search-result-${club.id}`}
                  >
                    {t("auth.clubOnboarding.requestToJoin")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("choose")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("common.back")}
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <Button className="w-full" onClick={() => setMode("create")} data-testid="club-onboarding-create">
          <Plus className="mr-2 h-4 w-4" />
          {t("auth.clubOnboarding.createClub")}
        </Button>
        <Button
          className="w-full"
          variant="outline"
          onClick={() => setMode("join")}
          data-testid="club-onboarding-join"
        >
          <Search className="mr-2 h-4 w-4" />
          {t("auth.clubOnboarding.joinClub")}
        </Button>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <img src="/brand/levapp-lockup-on-light.svg" alt="LevApp" className="mb-8 h-12 w-auto dark:hidden" />
      <img src="/brand/levapp-lockup-on-dark.svg" alt="LevApp" className="mb-8 hidden h-12 w-auto dark:block" />

      <Card className="w-full max-w-md" data-testid="club-onboarding">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building2 className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">{t("auth.clubOnboarding.title")}</CardTitle>
          <CardDescription>{t("auth.clubOnboarding.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderBody()}
          <Button variant="ghost" className="w-full" onClick={signOut} data-testid="club-onboarding-signout">
            {t("auth.coachPending.signOut")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClubOnboardingPage;
