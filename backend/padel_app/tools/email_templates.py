"""Transactional mail, rendered in the recipient's language (pt default).

One layout for every message: a white card on the app's grey ground, the
LevApp wordmark in the brand blue, one message, at most one primary button,
and a plain-text alternative that says the same thing. No emoji, pt-PT, *tu*.
Colours are the production tokens from `packages/config/src/tokens.ts`
(primary blue-600 #1355DC, foreground grey-800 #101E33, ground #E9EDF3).
"""
from html import escape

from flask import current_app

BRAND_BLUE = "#1355DC"
FOREGROUND = "#101E33"
MUTED = "#5B6B82"
GROUND = "#E9EDF3"
CARD = "#FFFFFF"
BORDER = "#D5DCE6"

DEFAULT_WEB_ORIGIN = "https://levapp.app"


def _lang(user):
    return "en" if (getattr(user, "language", None) or "pt") == "en" else "pt"


def web_origin():
    return current_app.config.get("PUBLIC_WEB_ORIGIN") or DEFAULT_WEB_ORIGIN


def _layout(title, blocks, footer):
    """`blocks` are already-escaped HTML fragments stacked inside the card."""
    body = "".join(blocks)
    return f"""<!doctype html>
<html lang="pt">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)}</title></head>
<body style="margin:0;padding:0;background:{GROUND};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:{FOREGROUND};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{GROUND};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:{CARD};border:1px solid {BORDER};border-radius:16px;">
<tr><td style="padding:28px 28px 8px 28px;">
<img src="{web_origin()}/brand/levapp-lockup-on-light.png" width="148" height="38" alt="LevApp"
 style="display:block;border:0;outline:none;text-decoration:none;height:auto;font-size:20px;font-weight:800;letter-spacing:-0.02em;color:{BRAND_BLUE};">
</td></tr>
<tr><td style="padding:8px 28px 28px 28px;">{body}</td></tr>
</table>
<p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:18px;color:{MUTED};text-align:center;">{footer}</p>
</td></tr>
</table>
</body></html>"""


def _h1(text):
    return f'<h1 style="margin:0 0 12px 0;font-size:22px;line-height:28px;font-weight:700;color:{FOREGROUND};">{escape(text)}</h1>'


def _p(text, muted=False):
    color = MUTED if muted else FOREGROUND
    return f'<p style="margin:0 0 16px 0;font-size:15px;line-height:22px;color:{color};">{escape(text)}</p>'


def _code(code):
    """The code block. The digits are rendered verbatim, never space-separated.

    Spacing is done with `letter-spacing` so the block still reads as six
    separate characters, while selecting it copies exactly "123456". Joining
    with spaces looked identical and copied "1 2 3 4 5 6", which the code field
    rejects — the reason people retyped it by hand.

    A real copy button is not possible: no mail client runs JavaScript. Making
    the value cleanly selectable is the whole of the fix; on iOS a long-press
    then Copy now yields something that pastes.
    """
    return (
        f'<p style="margin:8px 0 8px 0;padding:18px 12px;text-align:center;background:{GROUND};border-radius:12px;'
        f'font-size:34px;line-height:40px;font-weight:700;letter-spacing:0.22em;text-indent:0.22em;'
        f'font-variant-numeric:tabular-nums;'
        f'font-family:SFMono-Regular,Menlo,Consolas,monospace;color:{FOREGROUND};">{escape(code)}</p>'
    )


def _button(label, href):
    return (
        f'<p style="margin:8px 0 20px 0;"><a href="{escape(href, quote=True)}" '
        f'style="display:inline-block;padding:14px 22px;background:{BRAND_BLUE};color:#FFFFFF;text-decoration:none;'
        f'font-size:15px;font-weight:600;border-radius:12px;">{escape(label)}</a></p>'
    )


# ── auth.email-verification rule 7 ──────────────────────────────────────────

_VERIFY = {
    "pt": {
        "subject": "O teu código LevApp: {code}",
        "title": "Confirma o teu email",
        "intro": "Olá {name}. Escreve este código na LevApp para confirmar que este email é teu.",
        "valid": "O código é válido durante 15 minutos.",
        "ignore": "Se não foste tu, ignora este email — ninguém consegue entrar na tua conta sem o código.",
        "footer": "Recebeste este email porque alguém usou este endereço para criar uma conta LevApp.",
    },
    "en": {
        "subject": "Your LevApp code: {code}",
        "title": "Confirm your email",
        "intro": "Hi {name}. Type this code into LevApp to confirm this email is yours.",
        "valid": "The code is valid for 15 minutes.",
        "ignore": "If this wasn't you, ignore this email — nobody can get into your account without the code.",
        "footer": "You got this email because someone used this address to create a LevApp account.",
    },
}


def render_verification_code_email(user, code):
    """Return (subject, text, html) for the 6-digit code mail."""
    t = _VERIFY[_lang(user)]
    name = (user.name or "").split()[0] if user.name else ""
    intro = t["intro"].format(name=name).replace("Olá .", "Olá.").replace("Hi .", "Hi.")
    subject = t["subject"].format(code=code)
    text = "\n\n".join([t["title"], intro, code, t["valid"], t["ignore"]])
    html = _layout(
        subject,
        [_h1(t["title"]), _p(intro), _code(code), _p(t["valid"], muted=True), _p(t["ignore"], muted=True)],
        t["footer"],
    )
    return subject, text, html


# ── auth.password-recovery rule 3 ───────────────────────────────────────────

_RECOVERY = {
    "pt": {
        "subject": "Recuperar o acesso à tua conta LevApp",
        "title": "Recupera o acesso à tua conta",
        "intro": "Olá {name}. Pediste para recuperar o acesso à tua conta LevApp.",
        "username": "O teu nome de utilizador é {username}.",
        "code_intro": "Escreve este código na LevApp, junto com a nova palavra-passe:",
        "valid": "O código é válido durante 15 minutos e só pode ser usado uma vez.",
        "ignore": "Se não foste tu, ignora este email — a tua palavra-passe não foi alterada.",
        "footer": "Recebeste este email porque alguém pediu para recuperar o acesso a uma conta LevApp com este endereço.",
    },
    "en": {
        "subject": "Recover access to your LevApp account",
        "title": "Recover access to your account",
        "intro": "Hi {name}. You asked to recover access to your LevApp account.",
        "username": "Your username is {username}.",
        "code_intro": "Type this code into LevApp, along with your new password:",
        "valid": "The code is valid for 15 minutes and works only once.",
        "ignore": "If this wasn't you, ignore this email — your password has not changed.",
        "footer": "You got this email because someone asked to recover access to a LevApp account with this address.",
    },
}


def render_password_recovery_email(user, code):
    """Return (subject, text, html) for the recovery mail: username + code."""
    t = _RECOVERY[_lang(user)]
    name = (user.name or "").split()[0] if user.name else ""
    intro = t["intro"].format(name=name).replace("Olá .", "Olá.").replace("Hi .", "Hi.")
    username_line = t["username"].format(username=user.username)
    subject = t["subject"]
    text = "\n\n".join([t["title"], intro, username_line, t["code_intro"], code, t["valid"], t["ignore"]])
    html = _layout(
        subject,
        [
            _h1(t["title"]),
            _p(intro),
            _p(username_line),
            _p(t["code_intro"]),
            _code(code),
            _p(t["valid"], muted=True),
            _p(t["ignore"], muted=True),
        ],
        t["footer"],
    )
    return subject, text, html


# ── auth.coach-approval rule 5 ──────────────────────────────────────────────

_APPROVED = {
    "pt": {
        "subject": "A tua conta de treinador foi aprovada",
        "title": "Estás aprovado",
        "intro": "Olá {name}. A equipa LevApp aprovou a tua conta de treinador.",
        "next": "Já podes entrar e criar o teu clube, ou pedir para te juntares a um que já exista. Depois disso passa a ti: adiciona jogadores, marca aulas e deixa a LevApp preencher as vagas.",
        "button": "Abrir a LevApp",
        "footer": "Recebeste este email porque criaste uma conta de treinador na LevApp.",
    },
    "en": {
        "subject": "Your coach account is approved",
        "title": "You're approved",
        "intro": "Hi {name}. The LevApp team approved your coach account.",
        "next": "You can sign in now and create your club, or ask to join one that already exists. After that it's over to you: add players, schedule classes and let LevApp fill the open spots.",
        "button": "Open LevApp",
        "footer": "You got this email because you created a coach account on LevApp.",
    },
}


def render_coach_approved_email(user):
    """Return (subject, text, html) for the approval mail."""
    t = _APPROVED[_lang(user)]
    name = (user.name or "").split()[0] if user.name else ""
    intro = t["intro"].format(name=name).replace("Olá .", "Olá.").replace("Hi .", "Hi.")
    # An approved coach still has to sign in, so send them to the sign-in screen
    # rather than the site root — the root redirects an anonymous visitor to
    # /auth anyway, but only after a load, and on iOS the universal link opens
    # the app at whatever path it was given.
    href = f"{web_origin()}/auth"
    subject = t["subject"]
    text = "\n\n".join([t["title"], intro, t["next"], f"{t['button']}: {href}"])
    html = _layout(subject, [_h1(t["title"]), _p(intro), _p(t["next"]), _button(t["button"], href)], t["footer"])
    return subject, text, html


def render_request_alert_email(user, title, body, path):
    """PAD-232 — one branded email for any request alert (notifications.request-alerts
    rule 2): the same title/body the pushes carry, one button into the web app."""
    lang = _lang(user)
    label = "Abrir a LevApp" if lang == "pt" else "Open LevApp"
    href = web_origin() + path
    blocks = [_h1(title), _p(body), _button(label, href)]
    footer = (
        "Podes desativar estes alertas em Definições → Preferências."
        if lang == "pt"
        else "You can turn these alerts off under Settings → Preferences."
    )
    html = _layout(title, blocks, footer)
    text = f"{title}\n\n{body}\n\n{label}: {href}\n\n{footer}\n"
    return f"[LevApp] {title}", text, html
