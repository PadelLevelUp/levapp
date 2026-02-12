import click
from werkzeug.security import generate_password_hash
from padel_app.sql_db import db


def register_cli(app):
    @app.cli.command("seed")
    @click.option("--admin-user", default="admin")
    @click.option("--admin-email", default="admin@example.com")
    @click.option(
        "--admin-password",
        envvar="ADMIN_PASSWORD",
        prompt=True,
        hide_input=True,
        confirmation_prompt=True,
    )
    def seed(admin_user, admin_email, admin_password):
        from padel_app.models import Backend_App, User

        with app.app_context():
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

            apps_app = Backend_App.query.filter_by(name="Aplicações").first()
            if not apps_app:
                apps_app = Backend_App(name="Aplicações", app_model_name="Backend_App")
                apps_app.create()

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
