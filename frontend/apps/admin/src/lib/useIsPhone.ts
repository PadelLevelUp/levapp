import { useEffect, useState } from "react";

// Tailwind's `md` is 768 px; "phone" is everything below it (admin.phone-console rule 2).
export const PHONE_QUERY = "(max-width: 767px)";

function read(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(PHONE_QUERY).matches;
}

/** True below the `md` breakpoint. A page renders the phone layout OR the desktop one, never both. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState<boolean>(read);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(PHONE_QUERY);
    const onChange = () => setPhone(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return phone;
}
