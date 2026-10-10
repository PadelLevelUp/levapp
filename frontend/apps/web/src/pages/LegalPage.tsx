/**
 * auth.legal-pages (PAD-601): /terms and /privacy, rendered from the markdown in
 * `src/content/legal`. The header carries the document's version and effective date and an
 * EN | PT switch; while the Portuguese translation is in preparation the PT view shows the English
 * body under a notice that the English version prevails (rule 3). Internal links stay SPA links.
 */
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import {
  LEGAL_DOCUMENTS,
  legalBody,
  legalLanguageFrom,
  type LegalDocumentId,
  type LegalLanguage,
} from "@/content/legal";

const LANGS: LegalLanguage[] = ["en", "pt"];

export default function LegalPage({ document: id }: { document: LegalDocumentId }) {
  const { t, i18n } = useTranslation();
  const { search, pathname } = useLocation();
  const doc = LEGAL_DOCUMENTS[id];
  const lang = legalLanguageFrom(search, i18n.language);
  const { body, fallback } = useMemo(() => legalBody(doc, lang), [doc, lang]);
  const other: LegalDocumentId = id === "terms" ? "privacy" : "terms";

  return (
    <div className="min-h-screen bg-background px-4 py-10" data-testid={`legal-${id}`} lang={fallback ? "en" : lang}>
      <Card className="mx-auto max-w-3xl">
        <CardContent className="pt-6">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b pb-4" data-testid="legal-header">
            <div className="text-sm text-muted-foreground">
              <p>
                {t("legal.version")}: <span data-testid="legal-version">{doc.version}</span>
              </p>
              <p>
                {t("legal.effectiveDate")}: <span data-testid="legal-effective-date">{doc.effectiveDate}</span>
              </p>
            </div>
            <nav aria-label={t("legal.language")} className="flex gap-1 text-sm" data-testid="legal-lang-switch">
              {LANGS.map((l) => (
                <Link
                  key={l}
                  to={`${pathname}?lang=${l}`}
                  data-testid={`legal-lang-${l}`}
                  aria-current={l === lang ? "page" : undefined}
                  className={`rounded-md px-2 py-1 ${l === lang ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {l.toUpperCase()}
                </Link>
              ))}
            </nav>
          </header>

          {fallback ? (
            <p
              className="mb-6 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
              data-testid="legal-fallback-notice"
              lang="pt"
            >
              {t("legal.portugueseInPreparation")}
            </p>
          ) : null}

          <article className="prose prose-sm max-w-none dark:prose-invert" data-testid="legal-body">
            <ReactMarkdown
              components={{
                a: ({ href, children }) =>
                  href && href.startsWith("/") ? <Link to={href}>{children}</Link> : <a href={href} rel="noreferrer">{children}</a>,
              }}
            >
              {body}
            </ReactMarkdown>
          </article>

          <footer className="mt-8 border-t pt-4 text-sm text-muted-foreground" data-testid="legal-footer">
            <Link to={`/${other}?lang=${lang}`}>{t(other === "terms" ? "legal.terms" : "legal.privacy")}</Link>
            {" · "}
            <Link to="/auth">{t("legal.backToSignIn")}</Link>
          </footer>
        </CardContent>
      </Card>
    </div>
  );
}
