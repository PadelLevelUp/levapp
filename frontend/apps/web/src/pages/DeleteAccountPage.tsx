/**
 * auth.delete-account-page (PAD-603): /delete-account, the web URL Google Play requires for
 * deleting an account without the app. Public, writes nothing. The two ways (in the app, by email)
 * and what deletion removes and keeps, per auth.account-deletion. English and Portuguese, following
 * the UI language with a `?lang=` override and an EN | PT switch, like the legal pages. Web only by
 * design: inside the app the deletion is the Settings action itself.
 */
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CONTACT_EMAIL } from "@levelup/config";
import { Card, CardContent } from "@/components/ui/card";
import { legalLanguageFrom, type LegalLanguage } from "@/content/legal";

const LANGS: LegalLanguage[] = ["en", "pt"];
const DELETED = ["deletedIdentity", "deletedDetails", "deletedSessions", "deletedClasses", "deletedCrm"] as const;
const KEPT = ["keptCoachRecords", "keptBackups", "keptLegal"] as const;

export default function DeleteAccountPage() {
  const { t: uiT, i18n } = useTranslation();
  const { search, pathname } = useLocation();
  const lang = legalLanguageFrom(search, i18n.language);
  // Every string in the chosen language, whatever the UI language is (rule 4).
  const t = i18n.getFixedT ? i18n.getFixedT(lang) : uiT;
  const k = (key: string) => t(`legal.deleteAccount.${key}`);

  return (
    <div className="min-h-screen bg-background px-4 py-10" data-testid="delete-account-page" lang={lang}>
      <Card className="mx-auto max-w-3xl">
        <CardContent className="pt-6">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b pb-4">
            <h1 className="text-2xl font-bold">{k("title")}</h1>
            <nav aria-label={t("legal.language")} className="flex gap-1 text-sm">
              {LANGS.map((l) => (
                <Link
                  key={l}
                  to={`${pathname}?lang=${l}`}
                  data-testid={`delete-account-lang-${l}`}
                  aria-current={l === lang ? "page" : undefined}
                  className={`rounded-md px-2 py-1 ${l === lang ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {l.toUpperCase()}
                </Link>
              ))}
            </nav>
          </header>

          <div className="prose prose-sm max-w-none dark:prose-invert">
            <p>{k("intro")}</p>

            <h2>{k("inAppHeading")}</h2>
            <p data-testid="delete-account-in-app">{k("inAppSteps")}</p>

            <h2>{k("emailHeading")}</h2>
            <p data-testid="delete-account-email">
              {k("emailBefore")}{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} data-testid="delete-account-mailto">
                {CONTACT_EMAIL}
              </a>{" "}
              {k("emailAfter")}
            </p>

            <h2>{k("deletedHeading")}</h2>
            <ul data-testid="delete-account-deleted">
              {DELETED.map((key) => (
                <li key={key}>{k(key)}</li>
              ))}
            </ul>

            <h2>{k("keptHeading")}</h2>
            <ul data-testid="delete-account-kept">
              {KEPT.map((key) => (
                <li key={key}>{k(key)}</li>
              ))}
            </ul>

            <p>
              {k("moreBefore")}{" "}
              <Link to={`/privacy?lang=${lang}`} data-testid="delete-account-privacy-link">
                {t("legal.privacy")}
              </Link>
              .
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
