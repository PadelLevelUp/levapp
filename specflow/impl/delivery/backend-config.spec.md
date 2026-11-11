---
id: delivery.backend-config
status: implemented
depends_on: []
serves: [P-DELIVERY-9]
governed_by: []
---

# delivery.backend-config

> Written 2026-11-09 during the spec port, from `backend/padel_app/config.py` and its tests
> (PAD-95, B-048, PAD-292, B-069).

### Intent
The backend never reaches production data by accident: not through a default, not through a
migration run from a workstation, and not with a development signing secret.

### Rules
1. **A database address is built from the config's own host, when it is asked for.** The host is
   `POSTGRES_HOST` when set. With none set, the base and the development config point at
   `localhost` and the production config at its internal address. No class freezes the address
   when the module is imported (PAD-95: an unset host once pointed development at production).
2. **A production target is recognised by host or by the tunnel's port.** A known production host
   is production at any port. On `localhost`, the port of the tunnel to production (5434) is
   production; the ordinary local ports are not. The Postgres container's own name counts as
   production, since the app containers reach the database by it (PAD-292).
3. **A migration refuses a production target outside production.** A `flask db` command checks its
   target before anything connects. It runs when the process is production, or when
   `ALLOW_PRODUCTION_MIGRATIONS=1` is set; otherwise it stops with an error that names the host.
4. **Production refuses development secrets.** `FLASK_ENV=production` selects the production
   config, and anything else the development one. The production config refuses to start when the
   session secret or the token secret is unset or is a development fallback. Development keeps its
   fallbacks.

### Acceptance Criteria

#### DELIVERY-BACKEND-CONFIG-1: An unset host falls back to localhost, and the environment's host wins (rule 1)
- **Given** the four config classes with `POSTGRES_HOST` unset, and then set
- **When** each resolves its database address
- **Then** with none set the base and the development config resolve to `localhost`, never to a production host, and the production config to its internal address
- **And** with the variable set every class resolves to that host
- **And** the address is resolved when it is asked for, not when the module is imported
- **And** the class that opts in to the production database resolves to a production host
test: `backend/padel_app/tests/test_config_database_host.py` › `test_dev_config_prod_db_remains_the_explicit_production_opt_in` (+7 more)

#### DELIVERY-BACKEND-CONFIG-2: A migration refuses a production database from anywhere but production (rules 2, 3)
- **Given** a development process whose database target is a production host, the tunnel's port, or the Postgres container's name
- **When** a `flask db` command starts
- **Then** it stops with an error that names the host
- **And** the same target is accepted when the process is production, or when `ALLOW_PRODUCTION_MIGRATIONS=1` is set
- **And** `localhost` on an ordinary port is accepted
- **And** a command that is not a migration, such as `flask run` or the app server, is not checked
test: `backend/padel_app/tests/test_config_database_host.py` › `test_is_migration_invocation` (+10 more)

#### DELIVERY-BACKEND-CONFIG-3: Production refuses development secrets (rule 4)
- **Given** `FLASK_ENV=production` with no secrets, with a development session secret, and with real ones
- **When** the config is selected
- **Then** the first two refuse, naming the secret that is missing or is a development one
- **And** with real secrets the production config is selected
- **And** any other `FLASK_ENV`, or none, selects the development config, which keeps its fallback secrets
test: `backend/padel_app/tests/test_config_production_secrets.py` › `test_production_refuses_unset_secrets` (+4 more)

### Open questions

- **The production refusal for a blank `ADMIN_HOSTS` has no test here.** `config.py:448-452` refuses to start without it; `admin.foundation` rule 13 states it. Recommendation: point this spec at that rule.
- **One spelling slips past the migration check.** `flask --app db run` reads as a migration, because an option's value is not skipped. It errs on the safe side. Recommendation: accept.
- **The class that opts in to the production database is reachable only by naming it.** `get_config_class` returns the production or the development config; nothing selects `DevConfigProdDB`. Recommendation: confirm it is still wanted.
