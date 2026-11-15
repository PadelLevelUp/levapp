import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_NOTIFICATION_GROUP_LABELS,
  notificationGroupLabel,
  notificationGroupLabelKey,
} from "./notification-group-label";
import { localeT } from "./testkit/locale-t";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../..");

describe("PAD-838 manual-invite group labels (notifications.groups rule 7)", () => {
  it("[NOTIFICATIONS-GROUPS-4] a default label reads in the coach's language, a renamed one as stored", () => {
    expect(notificationGroupLabel({ id: "same_level", label: "Same level" }, localeT("pt"))).toBe("Mesmo nível");
    expect(notificationGroupLabel({ id: "recent_absences", label: "Recent absences" }, localeT("pt"))).toBe("Faltas recentes");
    expect(notificationGroupLabel({ id: "justified_absences", label: "Justified absences" }, localeT("pt"))).toBe("Faltas justificadas");
    expect(notificationGroupLabel({ id: "all_students", label: "All students" }, localeT("pt"))).toBe("Todos os alunos");
    expect(notificationGroupLabel({ id: "all_students", label: "All students" }, localeT("en"))).toBe("All students");

    // The coach's own words stay, in any language; so does a group the clients do not know.
    expect(notificationGroupLabel({ id: "all_students", label: "Os meus alunos" }, localeT("pt"))).toBe("Os meus alunos");
    expect(notificationGroupLabelKey({ id: "all_students", label: "all students" })).toBeNull();
    expect(notificationGroupLabel({ id: "vip", label: "VIP" }, localeT("pt"))).toBe("VIP");
    expect(notificationGroupLabelKey({ id: "constructor", label: "Same level" })).toBeNull();
  });

  it("[NOTIFICATIONS-GROUPS-4] every default id has copy in both locales", () => {
    for (const [id, label] of Object.entries(DEFAULT_NOTIFICATION_GROUP_LABELS)) {
      const key = notificationGroupLabelKey({ id, label });
      expect(key).not.toBeNull();
      for (const lng of ["pt", "en"] as const) expect(localeT(lng)(key!)).not.toBe(key);
    }
  });

  it("[NOTIFICATIONS-GROUPS-4] the defaults match what the backend seeds", () => {
    // Both seeders: the model's DEFAULT_NOTIFICATION_GROUPS and the new-coach config. Only the
    // groups list is read (coach_service's tiebreakers reuse the id `justified_absences`).
    const seeders: [string, string][] = [
      ["backend/padel_app/models/notification_config.py", "DEFAULT_NOTIFICATION_GROUPS = ["],
      ["backend/padel_app/services/coach_service.py", '"notification_groups": ['],
    ];
    for (const [file, anchor] of seeders) {
      const src = fs.readFileSync(path.join(REPO, file), "utf8");
      const start = src.indexOf(anchor);
      expect([file, start]).not.toEqual([file, -1]);
      const list = src.slice(start, src.indexOf("]", start));
      const seeded = Object.fromEntries(
        [...list.matchAll(/\{"id": "(\w+)", "label": "([^"]+)"/g)].map((m) => [m[1], m[2]])
      );
      expect([file, seeded]).toEqual([file, DEFAULT_NOTIFICATION_GROUP_LABELS]);
    }
  });
});
