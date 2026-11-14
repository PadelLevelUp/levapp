"""PAD-830: a saved message template identical to an old default follows the new default
(notifications.message-templates rule 20, NOTIFICATIONS-MESSAGE-TEMPLATES-28).

Before PAD-830 seven defaults put the class level in front of the student. A coach whose saved
text is, character for character, one of those old defaults never chose it: the web editor saves
the whole resolved set, so it only means "use the default". Those texts become the new default.
A coach who changed even one character keeps their text, and so does a text of their own.

``notification_configs.message_templates`` is one JSON dict per coach with no locale tag, so each
saved text is compared with the old default of its key in Portuguese and in English; the match
decides which new default replaces it. The old and new texts are copied here (a migration never
imports app code, which keeps moving).

Upgrade and downgrade each rewrite only an exact match, so both can run again and change nothing.
Downgrade puts the old text back wherever the stored text is the new default (it cannot tell a
coach who picked the new default from one the upgrade rewrote).

Revision ID: e830f1a2b3c4
Revises: e932a7c1d4f2
Create Date: 2026-11-13 21:10:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "e830f1a2b3c4"
down_revision = "e932a7c1d4f2"
branch_labels = None
depends_on = None

# key -> (text before PAD-830, text after)
EN = {
    "invite": (
        "Hey {name}, we have an opening in the {level} class next {weekday} at {time}. Do you want to come?",
        "Hey {name}, we have an opening in the class next {weekday} at {time}. Do you want to come?",
    ),
    "reminder": (
        "Hey {name}, just a reminder that you have the {level} class this {weekday} at {time}. Are you coming?",
        "Hey {name}, just a reminder that you have class this {weekday} at {time}. Are you coming?",
    ),
    "reminder_followup": (
        "Hey {name}, still haven't heard back — do you have a spot for the {level} class this {weekday} at {time}?",
        "Hey {name}, still haven't heard back — do you have a spot for the class this {weekday} at {time}?",
    ),
    "waiting_list_invite": (
        "Hey {name}, you're on the waiting list for the {level} class on {weekday} at {time}{side}, and a spot just opened. You're asked first: do you want it?",
        "Hey {name}, you're on the waiting list for the class on {weekday} at {time}{side}, and a spot just opened. You're asked first: do you want it?",
    ),
    "class_cancelled": (
        "Hi {name}, your {level} class on {weekday} at {time} has been cancelled. Sorry for the inconvenience!",
        "Hi {name}, your class on {weekday} at {time} has been cancelled. Sorry for the inconvenience!",
    ),
    "waiting_list_added": (
        "Hi {name}, a spot opened in the {level} class on {weekday} at {time} and you were on the waiting list, so you're in{side}. If you can't make it, let me know. 🎾",
        "Hi {name}, a spot opened in the class on {weekday} at {time} and you were on the waiting list, so you're in{side}. If you can't make it, let me know. 🎾",
    ),
    "side_moved": (
        "Hi {name}, in the {level} class on {weekday} at {time} you'll play on the {sideName} side. See you there!",
        "Hi {name}, in the class on {weekday} at {time} you'll play on the {sideName} side. See you there!",
    ),
}

PT = {
    "invite": (
        "Olá {name}, abriu uma vaga na aula de {level} na próxima {weekday} às {time}. Queres vir?",
        "Olá {name}, abriu uma vaga na aula da próxima {weekday} às {time}. Queres vir?",
    ),
    "reminder": (
        "Olá {name}, lembrete: tens a aula de {level} esta {weekday} às {time}. Vens?",
        "Olá {name}, lembrete: tens a aula esta {weekday} às {time}. Vens?",
    ),
    "reminder_followup": (
        "Olá {name}, ainda não tive resposta — tens vaga para a aula de {level} esta {weekday} às {time}?",
        "Olá {name}, ainda não tive resposta — tens vaga para a aula esta {weekday} às {time}?",
    ),
    "waiting_list_invite": (
        "Olá {name}, estás na lista de espera da aula de {level} na {weekday} às {time}{side} e abriu uma vaga. És o primeiro a ser perguntado: queres vir?",
        "Olá {name}, estás na lista de espera da aula de {weekday} às {time}{side} e abriu uma vaga. És o primeiro a ser perguntado: queres vir?",
    ),
    "class_cancelled": (
        "Olá {name}, a tua aula de {level} de {weekday} às {time} foi cancelada. Pedimos desculpa pelo incómodo!",
        "Olá {name}, a tua aula de {weekday} às {time} foi cancelada. Pedimos desculpa pelo incómodo!",
    ),
    "waiting_list_added": (
        "Olá {name}, abriu uma vaga na aula de {level} na {weekday} às {time} e estavas na lista de espera, por isso já estás inscrito{side}. Se não puderes ir, avisa. 🎾",
        "Olá {name}, abriu uma vaga na aula de {weekday} às {time} e estavas na lista de espera, por isso já estás inscrito{side}. Se não puderes ir, avisa. 🎾",
    ),
    "side_moved": (
        "Olá {name}, na aula de {level} na {weekday} às {time} vais jogar do lado {sideName}. Até já!",
        "Olá {name}, na aula de {weekday} às {time} vais jogar do lado {sideName}. Até já!",
    ),
}


notification_configs = sa.table(
    "notification_configs",
    sa.column("id", sa.Integer),
    sa.column("message_templates", sa.JSON),
)


def _rewrite(position):
    """Swap every saved text equal to one locale's text at ``position`` (0 old, 1 new) for the other."""
    other = 1 - position
    conn = op.get_bind()
    rows = conn.execute(sa.select(notification_configs.c.id, notification_configs.c.message_templates)).fetchall()
    for row_id, stored in rows:
        if not isinstance(stored, dict):
            continue
        changed = dict(stored)
        for table in (EN, PT):
            for key, pair in table.items():
                if changed.get(key) == pair[position]:
                    changed[key] = pair[other]
        if changed != stored:
            conn.execute(
                notification_configs.update()
                .where(notification_configs.c.id == row_id)
                .values(message_templates=changed)
            )


def upgrade():
    _rewrite(0)


def downgrade():
    _rewrite(1)
