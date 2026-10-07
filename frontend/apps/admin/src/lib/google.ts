// Google Identity Services, loaded on demand. The console never holds a client secret: the
// browser gets an ID token, the backend verifies it (admin.foundation rule 1).

export interface CredentialResponse {
  credential: string;
}

interface GoogleId {
  initialize(config: { client_id: string; callback: (r: CredentialResponse) => void; auto_select?: boolean; ux_mode?: "popup" | "redirect" }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let loading: Promise<GoogleId> | null = null;

export function loadGoogleIdentity(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const id = window.google?.accounts?.id;
      if (id) resolve(id);
      else reject(new Error("google identity did not initialise"));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("google identity script failed to load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export async function renderGoogleButton(
  parent: HTMLElement,
  clientId: string,
  onCredential: (credential: string) => void,
  locale: string,
) {
  const id = await loadGoogleIdentity();
  id.initialize({ client_id: clientId, callback: (r) => onCredential(r.credential), auto_select: false, ux_mode: "popup" });
  id.renderButton(parent, { theme: "outline", size: "large", text: "signin_with", shape: "rectangular", width: 300, locale });
}
