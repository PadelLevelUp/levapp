from . import (
    api,
    auth,
    editor,
    main,
    frontend_api,
    api_auth,
    startup,
)


# Register Blueprints
def register_blueprints(app):
    app.register_blueprint(main.bp)
    app.register_blueprint(auth.bp)
    app.register_blueprint(api.bp)
    app.register_blueprint(editor.bp)
    app.register_blueprint(frontend_api.bp)
    app.register_blueprint(api_auth.bp)
    return True


__all__ = [
    "api",
    "auth",
    "editor",
    "main",
    "frontend_api",
    "api_auth",
    "startup",
]
