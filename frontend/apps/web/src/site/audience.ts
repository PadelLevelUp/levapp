/**
 * auth.landing-page rule 4 (PAD-582), shared by the current landing and the new site (PAD-656): the
 * audience lives in the URL, `?para=<slug>`; the older `?audience=` (ids and Lovable's Portuguese
 * slugs) is still read, and anything else is coaches. Choosing replaces the parameter in place: no
 * reload, the scroll position untouched, every other parameter (utm and friends) kept.
 */
import { useSearchParams } from "react-router-dom";

export type Audience = "coaches" | "players" | "others";
export const AUDIENCES: Audience[] = ["coaches", "players", "others"];

/** `?audience=` accepts both the i18n ids and the Portuguese slugs Lovable used. */
const AUDIENCE_ALIASES: Record<string, Audience> = {
  coaches: "coaches",
  treinadores: "coaches",
  players: "players",
  alunos: "players",
  jogadores: "players",
  others: "others",
  outros: "others",
};

function readAudience(raw: string | null): Audience {
  return (raw && AUDIENCE_ALIASES[raw.toLowerCase()]) || "coaches";
}

/** PAD-582 (rule 4): the slug the URL carries for each audience, `?para=<slug>`. */
export const AUDIENCE_SLUG: Record<Audience, string> = {
  coaches: "treinadores",
  players: "jogadores",
  others: "outros",
};

/** `?para=` wins; the older `?audience=` keeps working for links already out there. */
export function audienceFromParams(params: URLSearchParams): Audience {
  return readAudience(params.get("para") ?? params.get("audience"));
}

/** The audience and its setter, the URL being the one source of truth. */
export function useAudience(): [Audience, (next: Audience) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const audience = audienceFromParams(searchParams);
  const setAudience = (next: Audience) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("para", AUDIENCE_SLUG[next]);
        params.delete("audience");
        return params;
      },
      { replace: true },
    );
  };
  return [audience, setAudience];
}
