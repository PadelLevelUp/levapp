from . import (
    api,
    auth,
    editor,
    editor_api,
    main,
    frontend_api,
    api_auth,
    notifications_api,
    notification_engine_api,
    startup,
)


# Register Blueprints
def register_blueprints(app):
    app.register_blueprint(main.bp)
    app.register_blueprint(auth.bp)
    # settings.admin-editor rule 1 (PAD-267): the three generic-editor surfaces
    # exist only where EDITOR_ENABLED is on; everywhere else every /editor,
    # /api/editor and legacy /api/<crud> path is a 404.
    if app.config.get("EDITOR_ENABLED"):
        app.register_blueprint(api.bp)
        app.register_blueprint(editor.bp)
        app.register_blueprint(editor_api.bp)
    app.register_blueprint(frontend_api.bp)
    app.register_blueprint(api_auth.bp)
    app.register_blueprint(notifications_api.bp)
    app.register_blueprint(notification_engine_api.bp)
    return True


__all__ = [
    "api",
    "auth",
    "editor",
    "editor_api",
    "main",
    "frontend_api",
    "api_auth",
    "notifications_api",
    "notification_engine_api",
    "startup",
]
