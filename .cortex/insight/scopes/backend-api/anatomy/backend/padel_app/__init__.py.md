---
path: backend/padel_app/__init__.py
extracted_at: 2026-09-07T03:58:26Z
extraction_level: 2
size_lines: 146
size_tokens: 1095
centrality: low
built_at_commit: "7de36cb3b33c39f0b9c3c482154bc27621660c30"
source_sha256: "67d304771047e9286813cfcf29f864c564436c312ff785b695f88738039cce24"
---

## Purpose

The Flask application factory, `create_app`. Configures CORS restricted to two explicit origins (`localhost:8080` and a hardcoded prod IP `34.78.247.45`) with `supports_credentials=False` and `X-New-Token` exposed as a response header; loads config via `config.get_config_class(env)` (or `test_config`) and, when the process is a migration invocation, calls `config.assert_safe_migration_target(config_cls.POSTGRES_HOST, config_cls.POSTGRES_PORT, env)` before anything opens a DB connection (PAD-95 production-target guard; the port argument was added for B-016 — note the pre-B-016 call passed `env` positionally into what became the new `port` parameter, which silently disabled the guard at this, its most important call site); registers an `after_request` hook that disables response caching and implements rolling JWT refresh — if the current token has under 15 days left, it mints a fresh one and returns it via the `X-New-Token` header rather than forcing re-login; wires session storage (`flask_session`, temp-dir backed), `JWTManager` + `register_jwt_handlers`, `flask_mail`, `flask_babel`, all blueprints (`modules.register_blueprints`), asset bundles (SCSS), `LoginManager` + `setup_login_manager`, the SQLAlchemy DB, CLI commands, and the APScheduler-based background scheduler (`scheduler.init_scheduler`). Also calls `modules.startup.add_to_session()` inside an app context at startup, even though that function currently does nothing (see `modules/startup.py`).

## Connections

- Uses: `padel_app.auth` (`register_jwt_handlers`, `setup_login_manager`); `padel_app.cli`, `padel_app.mail`, `padel_app.modules`, `padel_app.sql_db` (package-level imports); `padel_app.config` (imported lazily inside `create_app` when no `test_config` is given); `padel_app.scheduler` (outside this scope, imported lazily)
- Used by: `backend/app.py`: `app.create_app()` is the entrypoint every WSGI/dev-server run calls; also the entrypoint for tests that build an app under `test_config`
