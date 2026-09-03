LevApp's original declarative admin-editor system: roughly thirty backend model files describe their own editor forms with `Field`/`Block`/`Tab`/`Form` primitives, a generic Flask blueprint (`/api/editor`) exposes CRUD over any registered model through that declarative shape, and a single thin web API module talks to it. It predates and sits alongside the purpose-built `frontend_api.py` routes and dedicated React screens the rest of the product now uses — new domain features are not expected to grow their own editor forms.

## Implemented by
`backend/padel_app/tools/input_tools.py`
`backend/padel_app/modules/editor_api.py`
`frontend/apps/web/src/api/editor.ts`

## Related concepts
[[coach-scoped-authorization]]
