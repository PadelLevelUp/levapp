# Dead Features

Code implementing deprecated or unreferenced functionality.

| Feature | Files | Evidence | Safe to remove? |
|---------|-------|----------|----------------|
| Session-based login (Flask-Login) | `padel_app/auth.py`, `padel_app/modules/auth.py` | Separate from JWT auth used by the React app. Renders HTML login form. No frontend references. | Likely yes — but verify no admin panel depends on it |
| Mock data system | `levelup_frontend/src/data/mockData/`, `src/config.ts:USE_MOCK_DATA` | Development aid, not production feature. `VITE_USE_MOCK_DATA` env var | Keep as dev tool — but don't spec |
| Empty context module | `padel_app/context.py` | Placeholder, no meaningful code | Yes |
| CLI commands | `padel_app/cli.py` | Admin utility commands, not user-facing | Keep as utility — don't spec |
| `unread.ts` state module | `levelup_frontend/src/state/unread.ts` | Legacy observer pattern; mostly replaced by LayoutContext | Review — may still be referenced |
| Community matches features | `specs/features.yaml: F-35, F-36` | In specs as planned but no implementation found in code | N/A — spec only, no code to remove |
| Monthly calendar view | `specs/features.yaml: F-4` | Specced but not implemented — only week view exists | N/A — spec only |
