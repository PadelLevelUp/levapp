import { forwardRef } from "react";
import { Link, type LinkProps } from "react-router-dom";

/**
 * Every link that leaves the landing page (auth.landing-page rule 5). It always
 * loads a new document, so the HubSpot tracking script — loaded on the landing
 * page only after consent — never keeps running on another page or inside the
 * app. The landing files may not use react-router's `Link` directly
 * (`landing-guards.test.ts`), so an exit without a reload cannot be written.
 */
export const ExitLink = forwardRef<HTMLAnchorElement, Omit<LinkProps, "reloadDocument">>(
  (props, ref) => <Link ref={ref} {...props} reloadDocument />,
);
ExitLink.displayName = "ExitLink";
