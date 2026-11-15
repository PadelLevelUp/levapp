---
about: "Prod VM: one GCE instance runs everything — a host nginx in front of the prod and staging container pairs and one Postgres container, every container…"
permanence: changing
verified: "2026-09-16 (told)"
origin:
  - migrated:compass/environment.md#5@ef7a5f3
---

- **Prod VM**: one GCE instance runs everything — a host nginx in front of the prod and staging container pairs and one Postgres container, every container published on 127.0.0.1 (PAD-229). Its name, project, zone, addresses, the SSH command, the container/port map and the bucket names live in the **local, gitignored** `docs/infra/environment.md` — never here: this file is public (PAD-344, R-036). If your checkout lacks that file, ask the owner or the coordinator.
