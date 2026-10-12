/**
 * auth.social-sign-in rule 7 (PAD-618) — Google Identity Services on the web.
 *
 * Nothing is loaded until a button renders, and a build without
 * `VITE_GOOGLE_WEB_CLIENT_ID` never renders one. Google draws the button itself,
 * so its label ("Continuar com Google") follows the browser language.
 */
type GisCredentialResponse = { credential?: string };

type GisId = {
  initialize: (config: {
    client_id: string;
    callback: (response: GisCredentialResponse) => void;
    ux_mode?: "popup" | "redirect";
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: GoogleButtonText;
      width?: number;
    },
  ) => void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GisId } };
  }
}

export type GoogleButtonText = "signin_with" | "signup_with" | "continue_with" | "signin";

const GIS_SRC = "https://accounts.google.com/gsi/client";

/** The web OAuth client id this build carries, or null (the button then stays hidden). */
export function googleWebClientId(): string | null {
  const raw = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;
  const id = raw?.trim();
  return id ? id : null;
}

let loading: Promise<void> | null = null;

/** Injects the GIS script once; a failed load clears the cache so the next call retries. */
export function loadGoogleIdentity(): Promise<void> {
  if (typeof window !== "undefined" && window.google?.accounts?.id) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error("Google Identity Services failed to load"));
    };
    document.head.appendChild(script);
  }).catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

export function renderGoogleButton(
  el: HTMLElement,
  opts: { clientId: string; onCredential: (credential: string) => void; text: GoogleButtonText },
): void {
  const id = window.google?.accounts?.id;
  if (!id) throw new Error("Google Identity Services is not loaded");
  id.initialize({
    client_id: opts.clientId,
    callback: (response) => {
      if (response.credential) opts.onCredential(response.credential);
    },
    ux_mode: "popup",
  });
  const width = Math.min(Math.round(el.clientWidth), 400);
  id.renderButton(el, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: opts.text,
    ...(width > 0 ? { width } : {}),
  });
}
