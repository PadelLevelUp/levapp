import React from "react";

/* Lucide 24×24 / 2px stroke geometry (ISC). Matches the outline weight of the
   icons in the current app. See assets/icons/README.md for the mapping and for
   which glyphs are stand-ins awaiting the real SVGs. */
const PATHS = {
  painel: <React.Fragment>
    <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
  </React.Fragment>,
  calendario: <React.Fragment>
    <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" />
  </React.Fragment>,
  jogadores: <React.Fragment>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </React.Fragment>,
  treino: <React.Fragment>
    <rect width="8" height="4" x="8" y="2" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />
  </React.Fragment>,
  mensagens: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  definicoes: <React.Fragment>
    <circle cx="12" cy="12" r="4" /><path d="M22 12h-4" /><path d="M6 12H2" />
    <path d="M12 6V2" /><path d="M12 22v-4" />
  </React.Fragment>,
  check: <path d="M20 6 9 17l-5-5" />,
  back: <React.Fragment><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></React.Fragment>,
  plus: <React.Fragment><path d="M5 12h14" /><path d="M12 5v14" /></React.Fragment>,
  search: <React.Fragment><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></React.Fragment>
};

export function Icon({ name, size = 20, strokeWidth = 2, style, ...rest }) {
  const body = PATHS[name];
  if (!body) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={{ display: "block", flex: "none", ...style }}
      {...rest}
    >
      {body}
    </svg>
  );
}
