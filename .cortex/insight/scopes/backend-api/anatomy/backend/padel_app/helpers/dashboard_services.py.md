---
path: backend/padel_app/helpers/dashboard_services.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 48
size_tokens: 370
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "330c45f5d70e79876c7a6f9e93f4fa835aef8c94d0c67e07856e0ac812c23aec"
---

## Purpose

Top-level dashboard orchestrator: `build_dashboard_payload` computes the shared messages-overview block, then dispatches to the coach or player block builder depending on which profile is present, and returns the combined payload (`id`, `title`, `blocks`) the frontend renders.

## Connections

- Uses: `padel_app/helpers/dashboard/messages.py`: `compute_message_overview`; `padel_app/helpers/dashboard/coach.py`: `build_coach_dashboard_blocks`; `padel_app/helpers/dashboard/player.py`: `build_player_dashboard_blocks`. Note: the function signature annotates `coach: Optional[object]` and returns `Dict[str, Any]` but the file never imports `Optional`, `Dict`, or `Any` — this does not raise `NameError` only because the file opens with `from __future__ import annotations` (PEP 563), which makes all annotations lazy string literals never evaluated unless something later calls `typing.get_type_hints` on this function.
- Used by: `padel_app/modules/frontend_api.py`: the dashboard route calls `build_dashboard_payload` to serve `GET /api/app/dashboard` (or equivalent)
