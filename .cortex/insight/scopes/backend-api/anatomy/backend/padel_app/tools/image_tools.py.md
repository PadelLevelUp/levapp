---
path: backend/padel_app/tools/image_tools.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 57
size_tokens: 455
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d67a39412009dbf21bbd056d879e20d80f092854e9ec235626c656f542d0b15a"
---

## Purpose

Image upload plumbing for the legacy editor's `Image` field type: `save_file` streams an uploaded `FileStorage` directly to a Google Cloud Storage blob under `GCS_UPLOADS_BUCKET`; `file_handler` sanitizes an uploaded filename (strip spaces, lowercase, transliterate via `unidecode`) and returns `(None, None)` for an empty filename. The file also carries large commented-out blocks for background-removal (`mediapipe`/`cv2`) and image resizing that were never finished/enabled — those dependencies (`cv2`, `mediapipe`, `numpy`) are not imported live.

## Connections

- Uses: `google.cloud.storage`; `unidecode`
- Used by: `padel_app/tools/input_tools.py`: the `Image`-typed `Field`/form machinery calls `file_handler`/`save_file` when a coach uploads a photo through the legacy editor forms
