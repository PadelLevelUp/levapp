"""E2E-only switches. `E2E_DEBUG_ENDPOINTS` is set by the Playwright webServer
and the Maestro runner, never by a deploy; absent means off (PAD-92)."""
import os

from flask import current_app


def debug_endpoints_enabled():
    flag = current_app.config.get("E2E_DEBUG_ENDPOINTS")
    if flag is None:
        flag = os.getenv("E2E_DEBUG_ENDPOINTS")
    return str(flag).strip().lower() in ("1", "true", "yes", "on")
