---
id: import.analyze
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/import/coach-imports-a-roster-spreadsheet.business.md
governed_by: []
---

# import.analyze


### Intent
Upload an Excel file and have an AI analyze its contents, mapping columns to the system's data model.

### Rules
1. `POST /api/app/import/analyze` uploads the file
2. Uses an LLM through the OpenAI SDK pointed at OpenRouter (`helpers/llm.py`: `OPENROUTER_BASE_URL`,
   default model `inception/mercury-2`) to analyze file structure via `stream_import_analysis()`
3. Response is an SSE stream with events: thinking, phase, progress, tables, error, done
4. AI identifies tables: Players, Classes, Associations, Evaluation Entries, Coach Notes
5. Frontend renders progressive analysis with streaming UI
6. **Data that leaves LevApp (PAD-268).** During analysis the coach's spreadsheet content is sent to
   the third-party model provider: each sheet's headers and up to 3 sample rows (cells truncated to 60
   characters) to pick sheets; column names and up to 15 unique sample values per column to map them;
   the student names found in the file to validate them; class names to match them. That includes
   personal data of the coach's students (names, and any contact details present in sample values).
   Listed in the privacy-policy checklist of decision `2026-09-10-account-deletion-keeps-coach-records`
   so the legal copy can be checked against it.

### Acceptance Criteria

#### Analyze Excel file
- **Given** an uploaded Excel file with player data
- **When** coach POSTs to `/api/app/import/analyze`
- **Then** an SSE stream begins with analysis events
- **And** eventually returns structured `tables` with column mappings and row data
