"""
Class colour swatches — the backend half of ``frontend/packages/config/src/class-colors.ts``.

PAD-246 retired four coach-pickable colours because they read as a status
(amber = needs the coach, red = canceled, green = done). Stored classes are
moved off them once by an Alembic data migration; this module holds the
mapping so the migration and its test share one definition. The frontend
file is the other copy — ``test_class_colors_remap.py`` pins them together.
"""

# Retired swatch (lower-case) -> replacement. Decided 2026-09-08.
RETIRED_CLASS_COLOR_REMAP = {
    "#ef4444": "#A21CAF",  # red -> plum
    "#f97316": "#0891B2",  # orange -> cyan
    "#eab308": "#0D9488",  # yellow -> teal
    "#22c55e": "#0D9488",  # green -> teal
}


def remap_class_color(value):
    """Return the replacement for a retired swatch, else the value untouched."""
    if not isinstance(value, str):
        return value
    return RETIRED_CLASS_COLOR_REMAP.get(value.lower(), value)
