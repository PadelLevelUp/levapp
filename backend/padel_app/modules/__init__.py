from . import (
    auth,
    main,
    frontend_api,
    api_auth,
    notifications_api,
    notification_engine_api,
    evaluations_api,
    admin_api,
    startup,
)


# Register Blueprints
def register_blueprints(app):
    app.register_blueprint(main.bp)
    app.register_blueprint(auth.bp)
    # settings.admin-editor was deleted by PAD-550: no /editor, /api/editor or
    # legacy /api/<crud> blueprint exists, and there is no switch to turn one on.
    app.register_blueprint(frontend_api.bp)
    app.register_blueprint(api_auth.bp)
    app.register_blueprint(notifications_api.bp)
    app.register_blueprint(notification_engine_api.bp)
    app.register_blueprint(evaluations_api.bp)  # PAD-364: the v2 evaluation API
    # admin.foundation rule 11 (PAD-531): registered everywhere; its before_request
    # answers 404 on any host outside ADMIN_HOSTS.
    app.register_blueprint(admin_api.bp)
    return True


__all__ = [
    "auth",
    "main",
    "frontend_api",
    "api_auth",
    "notifications_api",
    "notification_engine_api",
    "admin_api",
    "startup",
]
