---
id: import.analyze
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/import/coach-relies-on-import.business.md
governed_by: []
---

# import.analyze


### Intent
Upload an Excel file and have an AI analyze its contents, mapping columns to the system's data model.

### Rules
1. `POST /api/app/import/analyze` uploads the file
2. Uses OpenAI API to analyze file structure via `stream_import_analysis()`
3. Response is an SSE stream with events: thinking, phase, progress, tables, error, done
4. AI identifies tables: Players, Classes, Associations, Evaluation Entries, Coach Notes
5. Frontend renders progressive analysis with streaming UI

### Acceptance Criteria

#### Analyze Excel file
- **Given** an uploaded Excel file with player data
- **When** coach POSTs to `/api/app/import/analyze`
- **Then** an SSE stream begins with analysis events
- **And** eventually returns structured `tables` with column mappings and row data
