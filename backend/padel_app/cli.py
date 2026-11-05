import click
from werkzeug.security import generate_password_hash
from padel_app.sql_db import db


def register_cli(app):
    @app.cli.command("seed")
    @click.option(
        "--table",
        "tables",
        multiple=True,
        help="Seed one table (or repeat --table). Example: --table users --table coaches",
    )
    @click.option(
        "--all-mock-data",
        "--all_mock_data",
        "all_mock_data",
        is_flag=True,
        help="Seed all mock data tables.",
    )
    @click.option("--admin-user", default="admin")
    @click.option("--admin-email", default="admin@example.com")
    @click.option(
        "--admin-password",
        envvar="ADMIN_PASSWORD",
        hide_input=True,
        default=None,
        help="Admin password (used only when seeding admin user).",
    )
    def seed(tables, all_mock_data, admin_user, admin_email, admin_password):
        from padel_app.models import User
        from padel_app.seed import (
            ALL_SEED_TABLES,
            available_table_names,
            normalize_table_name,
            seed_mock_tables,
        )

        with app.app_context():
            if tables and all_mock_data:
                click.echo("❌ Use either --table or --all_mock_data, not both.")
                return

            if tables or all_mock_data:
                requested_tables = []
                if all_mock_data:
                    requested_tables = list(ALL_SEED_TABLES)
                else:
                    invalid_tables = []
                    for table in tables:
                        normalized = normalize_table_name(table)
                        if normalized is None:
                            invalid_tables.append(table)
                        else:
                            requested_tables.append(normalized)

                    if invalid_tables:
                        click.echo(
                            "❌ Unknown table(s): "
                            + ", ".join(sorted(set(invalid_tables)))
                        )
                        click.echo(
                            "Available tables: "
                            + ", ".join(available_table_names())
                        )
                        return

                    requested_tables = list(dict.fromkeys(requested_tables))

                try:
                    results = seed_mock_tables(requested_tables)
                    click.echo("✅ Mock data seeded:")
                    for table_name, result in results.items():
                        click.echo(
                            f" - {table_name}: inserted={result.inserted}, updated={result.updated}"
                        )
                except Exception as exc:
                    db.session.rollback()
                    click.echo(f"❌ Mock seed failed: {exc}")
                    raise
                return

            if not admin_password:
                admin_password = click.prompt(
                    "Admin password",
                    hide_input=True,
                    confirmation_prompt=True,
                )

            admin = User.query.filter_by(username=admin_user).first()
            if not admin:
                admin = User(
                    name=admin_user,
                    username=admin_user,
                    email=admin_email,
                    password=generate_password_hash(admin_password),
                    is_admin=True,
                )
                admin.create()

            click.echo("Seeding done.")

    @app.cli.command("db-reset")
    @click.option(
        "--yes",
        is_flag=True,
        help="Confirm database reset (required).",
    )
    @click.option(
        "--table",
        "tables",
        multiple=True,
        help="Table name(s) to truncate. If omitted, all tables are truncated.",
    )
    def db_reset(yes, tables):
        """Truncate tables and reset identities (DEV ONLY)."""

        if not yes:
            click.echo("❌ Aborted. Use --yes to confirm.")
            return

        click.echo("⚠️  Resetting database…")

        all_tables = set(db.metadata.tables.keys())

        if tables:
            requested_tables = set(tables)
            invalid_tables = requested_tables - all_tables

            if invalid_tables:
                click.echo(
                    f"❌ Unknown table(s): {', '.join(invalid_tables)}"
                )
                return

            table_names = sorted(requested_tables)
        else:
            table_names = sorted(all_tables)

        if not table_names:
            click.echo("ℹ️  No tables found.")
            return

        sql = (
            "TRUNCATE TABLE "
            + ", ".join(table_names)
            + " RESTART IDENTITY CASCADE"
        )

        db.session.execute(sql)
        db.session.commit()

        click.echo(f"✅ Reset {len(table_names)} table(s): {', '.join(table_names)}")

    _register_onboarding(app)


def _register_onboarding(app):
    """import.onboarding-runner (PAD-827): the team's command that loads a new coach's roster.

    Run by the operator on the server; nothing runs it automatically. The work is in
    `services/onboarding_service.py` (R-005); this is the command line around it.
    """
    from flask.cli import AppGroup

    onboarding = AppGroup("onboarding", help="Load a new coach's roster from an onboarding file.")

    def _refuse(problems, heading="Refused:"):
        click.echo(heading)
        for problem in problems:
            click.echo(f"  - {problem}")
        raise click.exceptions.Exit(1)

    def _require_database(service, database):
        """Rule 6: a run that writes names the database it is connected to."""
        connected = service.connected_database()
        if database != connected:
            given = f'"{database}" was given' if database else "none was given"
            _refuse([f'--database must name the connected database "{connected}"; {given}'])
        return connected

    @onboarding.command("apply")
    @click.argument("file")
    @click.option("--dry-run", is_flag=True, help="Check the file and the target, print the plan, write nothing.")
    @click.option("--database", default=None, help="Name of the connected database (required unless --dry-run).")
    def onboarding_apply(file, dry_run, database):
        """Apply the onboarding FILE (a path, or - for standard input)."""
        from padel_app.services import onboarding_service as service

        try:
            if file == "-":
                raw = click.get_binary_stream("stdin").read()
            else:
                with open(file, "rb") as handle:
                    raw = handle.read()
        except OSError as exc:
            _refuse([f"cannot read {file}: {exc}"])

        try:
            data = service.parse(raw)
        except service.OnboardingRefused as exc:
            _refuse(exc.problems)
        problems = service.validate_file(data)
        if problems:
            _refuse(problems)
        if not dry_run:
            _require_database(service, database)

        coach, club, problems = service.check_target(data)
        if problems:
            _refuse(problems)
        for line in service.plan_lines(data, coach, club):
            click.echo(line)
        if dry_run:
            click.echo("Dry run: nothing written.")
            return

        try:
            run = service.apply(data, raw, coach, club)
        except service.OnboardingFailed as exc:
            _refuse([str(exc)], heading="Failed:")
        click.echo(f"Applied onboarding {data['id']} as import #{run.id}.")
        click.echo(f"Undo with: flask onboarding revert {data['id']} --database {service.connected_database()}")

    @onboarding.command("revert")
    @click.argument("onboarding_id")
    @click.option("--database", default=None, help="Name of the connected database (required).")
    def onboarding_revert(onboarding_id, database):
        """Delete everything the onboarding ONBOARDING_ID created."""
        from padel_app.services import onboarding_service as service

        _require_database(service, database)
        try:
            deleted = service.revert(onboarding_id)
        except service.OnboardingRefused as exc:
            _refuse(exc.problems)
        removed = ", ".join(f"{count} {kind}" for kind, count in deleted.items()) or "nothing"
        click.echo(f"Reverted onboarding {onboarding_id}: removed {removed}.")

    @onboarding.command("list")
    def onboarding_list():
        """Every onboarding run, oldest first."""
        from padel_app.services import onboarding_service as service

        listed = service.runs()
        if not listed:
            click.echo("No onboarding has been applied.")
            return
        for run in listed:
            click.echo(
                f"{run['id']}  coach #{run['coach_id']} {run['coach_name']}  "
                f"{run['applied_at']:%Y-%m-%d %H:%M}  {run['status']}  {run['counts']}  (import #{run['import_id']})"
            )

    app.cli.add_command(onboarding)
