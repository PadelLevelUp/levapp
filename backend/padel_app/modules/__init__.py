from . import (
    api,
    auth,
    editor,
    main,
    startup,
)


# Register Blueprints
def register_blueprints(app):
    app.register_blueprint(main.bp)
    app.register_blueprint(auth.bp)
    app.register_blueprint(api.bp)
    app.register_blueprint(editor.bp)
    return True


__all__ = [
    "api",
    "auth",
    "editor",
    "main",
    "startup",
]
