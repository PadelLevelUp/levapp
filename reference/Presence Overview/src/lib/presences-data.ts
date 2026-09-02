export type Player = {
  id: string;
  name: string;
  total: number;
  private: number;
  academy: number;
  justified: number;
  unjustified: number;
  invitesReceived: number;
  invitesJoined: number;
};

const NAMES = [
  "Miguel Ferreira",
  "Ana Rodrigues",
  "Tomás Pereira",
  "Beatriz Santos",
  "João Almeida",
  "Carolina Lopes",
  "Rui Marques",
  "Inês Carvalho",
  "Pedro Nogueira",
  "Sofia Ramos",
  "André Teixeira",
  "Mariana Costa",
  "Diogo Fonseca",
  "Leonor Matos",
  "Gonçalo Pinto",
  "Rita Barbosa",
  "Francisco Neves",
  "Catarina Moreira",
  "Bruno Cardoso",
  "Helena Freitas",
  "Nuno Azevedo",
  "Patrícia Gomes",
  "Ricardo Baptista",
  "Joana Vieira",
  "Vasco Amaral",
];

// Deterministic pseudo-random so SSR and client render the same mock data.
function makeRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const rand = makeRandom(20260821);

export const players: Player[] = NAMES.map((name, i) => {
  const priv = Math.floor(rand() * 18) + 1;
  const academy = Math.floor(rand() * 26) + 2;
  const invitesReceived = Math.floor(rand() * 9);
  const invitesJoined = Math.floor(rand() * (invitesReceived + 1));
  return {
    id: `p-${i + 1}`,
    name,
    total: priv + academy + invitesJoined,
    private: priv,
    academy,
    justified: Math.floor(rand() * 6),
    unjustified: Math.floor(rand() * 4),
    invitesReceived,
    invitesJoined,
  };
});

export const topPlayers = [...players]
  .sort((a, b) => b.total - a.total)
  .slice(0, 8)
  .map((p) => {
    const [first = "", last = ""] = p.name.split(" ");
    return { name: `${first} ${last.charAt(0)}.`, presences: p.total };
  });

export const typeSplit = [
  { name: "Private", value: players.reduce((s, p) => s + p.private, 0) },
  { name: "Academy", value: players.reduce((s, p) => s + p.academy, 0) },
];

export const weeklyPresences = Array.from({ length: 8 }, (_, i) => ({
  week: `W${i + 1}`,
  presences: 48 + Math.floor(rand() * 40) + i * 3,
}));

export type ColumnKey = keyof Omit<Player, "id">;

export const COLUMNS: { key: ColumnKey; label: string; numeric: boolean }[] = [
  { key: "name", label: "Player", numeric: false },
  { key: "total", label: "Total presences", numeric: true },
  { key: "private", label: "Private classes", numeric: true },
  { key: "academy", label: "Academy classes", numeric: true },
  { key: "justified", label: "Justified absences", numeric: true },
  { key: "unjustified", label: "Unjustified absences", numeric: true },
  { key: "invitesReceived", label: "Invites received", numeric: true },
  { key: "invitesJoined", label: "Joined as invite", numeric: true },
];

export const DEFAULT_VISIBLE: ColumnKey[] = [
  "name",
  "total",
  "private",
  "academy",
  "unjustified",
];
