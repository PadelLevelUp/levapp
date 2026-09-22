"""The built-in padel competency catalogue (PAD-364, evaluations.competencies).

Seventeen entries in three groups, from the owner's canvas (AV-020). An entry is
NOT a row: a catalogue competency becomes an `evaluation_categories` row only
when a coach switches it on. `key` is stable and is what the clients translate
by; the pt label (the canvas's own wording) is what the row's `name` is stored
as, and both labels are what "the coach already has a category of that name"
is judged against (Q17 — the catalogue twin is hidden for that coach).

Group names and competency keys are separate namespaces (evaluations.competencies
rule 1): the group `technique` and the key `technique` are never compared.
"""

GROUPS = ("general", "technique", "tactics")

#: (key, group, pt, en) — order is the catalogue's display order.
CATALOGUE = (
    ("technique", "general", "Técnica", "Technique"),
    ("tactics", "general", "Tática", "Tactics"),
    ("consistency", "general", "Consistência", "Consistency"),
    ("forehand", "technique", "Direita", "Forehand"),
    ("backhand", "technique", "Esquerda", "Backhand"),
    ("volley", "technique", "Volley", "Volley"),
    ("bandeja", "technique", "Bandeja", "Bandeja"),
    ("vibora", "technique", "Víbora", "Víbora"),
    ("smash", "technique", "Smash", "Smash"),
    ("glass_exit", "technique", "Saída de vidro", "Off the glass"),
    ("double_glass", "technique", "Duplo vidro", "Double glass"),
    ("serve", "technique", "Serviço", "Serve"),
    ("defensive_position", "tactics", "Posição defensiva", "Defensive position"),
    ("attacking_position", "tactics", "Posição atacante", "Attacking position"),
    ("transition", "tactics", "Transição", "Transition"),
    ("decision_making", "tactics", "Tomada de decisão", "Decision making"),
    ("doubles_play", "tactics", "Jogo em dupla", "Playing as a pair"),
)

BY_KEY = {key: {"key": key, "group": group, "pt": pt, "en": en} for key, group, pt, en in CATALOGUE}

#: What a coach who holds no category at all starts with (rule 4, AV-021).
STARTING_KEYS = ("technique", "tactics", "consistency")

#: New competencies — catalogue and custom — are rated 1 to 5 stars.
NEW_SCALE = (1, 5)


def fold(name) -> str:
    """How two competency names are compared: trimmed, case-insensitively."""
    return " ".join(str(name or "").split()).casefold()


def labels(key) -> set:
    entry = BY_KEY[key]
    return {fold(entry["pt"]), fold(entry["en"])}
