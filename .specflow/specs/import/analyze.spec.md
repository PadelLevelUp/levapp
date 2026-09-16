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
7. **The stream reads nothing from the database (PAD-293, B-070).** Level values found in the
   spreadsheet are mapped onto the coach's *existing* levels (`levels.coach-levels`), and that
   ladder — like anything else the analysis needs from the database — is read by the view inside
   the request, before the stream starts, and handed to `stream_import_analysis()`. The SSE body
   is iterated after Flask has popped the request context, so a database read inside it fails; a
   failed read is an error response, never a logged warning that lets the analysis continue as if
   the coach had no levels.

### Acceptance Criteria

#### Analyze Excel file
- **Given** an uploaded Excel file with player data
- **When** coach POSTs to `/api/app/import/analyze`
- **Then** an SSE stream begins with analysis events
- **And** eventually returns structured `tables` with column mappings and row data

#### Spreadsheet levels map onto the coach's existing levels (rule 7)
- **Given** a coach whose ladder has the levels `ADV` and `INI`
- **And** a spreadsheet whose players carry the level value "Iniciacao"
- **When** the coach POSTs it to `/api/app/import/analyze` and reads the whole stream
- **Then** the `tables` event lists `INI` under "Coach Levels" and the players' `level_code` is `INI`
- **And** no `error` event is streamed
- **Given** a coach with no levels yet
- **When** the same file is analysed
- **Then** the `tables` event has no "Coach Levels" table, the players keep their raw level value, and no `error` event is streamed
