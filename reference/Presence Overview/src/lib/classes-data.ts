export type Response = "confirmed" | "absent" | "none" | "added";
export type Status = "present" | "justified" | "unjustified";

export type ClassStudent = {
  id: string;
  name: string;
  response: Response;
};

export type PadelClass = {
  id: string;
  weekOffset: number; // 0 = this week, -1 = last week
  dayIndex: number; // 0 = Monday
  time: string;
  name: string;
  type: "Private" | "Academy";
  court: string;
  students: ClassStudent[];
};

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const STUDENT_POOL = [
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
  "Guilherme Sousa",
  "Margarida Oliveira",
  "Tiago Mendes",
  "Laura Azevedo",
  "Henrique Correia",
  "Diana Pinto",
  "Duarte Cardoso",
  "Matilde Fernandes",
  "Simão Ribeiro",
  "Clara Martins",
  "Afonso Dias",
  "Alice Henriques",
  "Bernardo Castro",
  "Madalena Rocha",
  "Vicente Gomes",
  "Luísa Antunes",
  "Gabriel Silva",
  "Júlia Campos",
  "Salvador Figueiredo",
  "Carolina Branco",
  "David Cruz",
  "Maria Braga",
  "Santiago Alves",
  "Eva Freitas",
  "Rodrigo Mendes",
  "Filipa Araújo",
  "Nuno Barbosa",
  "Sara Coelho",
  "Lucas Miranda",
  "Benedita Lopes",
  "Mateus Santos",
  "Carmo Leitão",
  "Vasco Vaz",
  "Letícia Pacheco",
  "António Matos",
  "Olívia Reis",
  "Joaquim Neves",
  "Isabel Vaz",
  "Pedro Castro",
  "Helena Lopes",
  "Rafaela Guedes",
  "Tomás Vaz",
  "Soraia Carvalho",
  "Marco Branco",
  "Patrícia Azevedo",
];

function roster(
  classId: string,
  total: number,
  none: number,
  absent: number,
  offset: number,
): ClassStudent[] {
  const out: ClassStudent[] = [];
  for (let i = 0; i < total; i++) {
    let response: Response;
    if (i < none) response = "none";
    else if (i < none + absent) response = "absent";
    else response = "confirmed";
    const poolIndex = (offset + i) % STUDENT_POOL.length;
    out.push({
      id: `${classId}-s${i}`,
      name: STUDENT_POOL[poolIndex]!,
      response,
    });
  }
  return out;
}

function mk(
  id: string,
  weekOffset: number,
  dayIndex: number,
  time: string,
  name: string,
  type: PadelClass["type"],
  court: string,
  total: number,
  none: number,
  absent: number,
  offset: number,
): PadelClass {
  return {
    id,
    weekOffset,
    dayIndex,
    time,
    name,
    type,
    court,
    students: roster(id, total, none, absent, offset),
  };
}

export const classes: PadelClass[] = [
  // Monday — 3 classes
  mk("c1", 0, 0, "09:00", "Private — Miguel", "Private", "Court 1", 12, 0, 1, 0),
  mk("c2", 0, 0, "18:30", "Academy Level 2", "Academy", "Court 3", 16, 2, 1, 8),
  mk("c3", 0, 0, "20:00", "Private — Costa", "Private", "Court 2", 14, 0, 0, 28),

  // Tuesday — 3 classes
  mk("c4", 0, 1, "10:00", "Academy Beginners", "Academy", "Court 2", 15, 0, 1, 4),
  mk("c5", 0, 1, "19:00", "Private — Duo Costa", "Private", "Court 1", 12, 0, 0, 22),
  mk("c6", 0, 1, "20:30", "Academy Adults", "Academy", "Court 4", 14, 0, 2, 36),

  // Wednesday — 3 classes
  mk("c7", 0, 2, "08:00", "Academy Level 3", "Academy", "Court 4", 14, 0, 1, 12),
  mk("c8", 0, 2, "17:00", "Academy Kids", "Academy", "Court 2", 16, 1, 0, 20),
  mk("c9", 0, 2, "19:30", "Private — Rui", "Private", "Court 1", 12, 0, 0, 48),

  // Thursday — 2 classes
  mk("c10", 0, 3, "09:00", "Academy Level 1", "Academy", "Court 3", 13, 0, 1, 7),
  mk("c11", 0, 3, "18:00", "Private — Beatriz", "Private", "Court 2", 12, 0, 0, 33),

  // Friday — 3 classes
  mk("c12", 0, 4, "12:00", "Private — Sofia", "Private", "Court 1", 12, 0, 1, 16),
  mk("c13", 0, 4, "17:30", "Academy Level 2", "Academy", "Court 3", 15, 0, 2, 0),
  mk("c14", 0, 4, "20:00", "Private — João", "Private", "Court 2", 12, 0, 0, 44),

  // Saturday — 3 classes
  mk("c15", 0, 5, "10:30", "Academy Level 1", "Academy", "Court 3", 16, 0, 1, 10),
  mk("c16", 0, 5, "16:00", "Private — João", "Private", "Court 2", 12, 0, 0, 25),
  mk("c17", 0, 5, "18:00", "Academy Kids", "Academy", "Court 4", 14, 0, 1, 40),

  // Sunday — 2 classes
  mk("c18", 0, 6, "09:00", "Academy Adults", "Academy", "Court 4", 13, 0, 1, 6),
  mk("c19", 0, 6, "11:00", "Private — Carolina", "Private", "Court 1", 12, 0, 0, 30),

  // previous week
  mk("c20", -1, 2, "18:00", "Academy Level 2", "Academy", "Court 3", 14, 0, 1, 14),
  mk("c21", -1, 4, "09:30", "Private — André", "Private", "Court 1", 12, 0, 0, 52),

  // next week
  mk("c22", 1, 1, "18:30", "Academy Level 3", "Academy", "Court 4", 15, 0, 1, 18),
  mk("c23", 1, 3, "20:00", "Private — Rita", "Private", "Court 2", 12, 0, 0, 42),
  mk("c24", 1, 4, "10:00", "Academy Beginners", "Academy", "Court 1", 14, 0, 1, 2),
];

export function prefillStatus(response: Response): Status | null {
  if (response === "confirmed") return "present";
  if (response === "absent") return "justified";
  if (response === "added") return "present";
  return null;
}

export function summarize(c: PadelClass) {
  const confirmed = c.students.filter((s) => s.response === "confirmed").length;
  const absent = c.students.filter((s) => s.response === "absent").length;
  const none = c.students.filter((s) => s.response === "none").length;
  return { total: c.students.length, confirmed, absent, none, ready: none === 0 };
}

export function weekLabel(offset: number) {
  const base = new Date();
  const day = (base.getDay() + 6) % 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - day + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const name = offset === 0 ? "This week" : offset === -1 ? "Last week" : offset === 1 ? "Next week" : `Week ${offset > 0 ? "+" : ""}${offset}`;
  return `${name} · ${fmt(monday)} – ${fmt(sunday)}`;
}

export const RESPONSE_LABEL: Record<Response, string> = {
  confirmed: "Confirmed attending",
  absent: "Said absent",
  none: "No answer",
  added: "Added by coach",
};

export const STATUS_LABEL: Record<Status, string> = {
  present: "Present",
  justified: "Absent – justified",
  unjustified: "Absent – unjustified",
};
