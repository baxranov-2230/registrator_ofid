"""Plain-text + HTML bodies for outgoing email.

Every email is sent in both forms: the text part for clients that refuse HTML,
the HTML part so the message reads like it came from the university rather
than from a script. Autoescaping is on — titles and comments contain text that
students and staff typed.
"""

from jinja2 import Environment, select_autoescape

from app.core.config import settings

_env = Environment(autoescape=select_autoescape(default=True, default_for_string=True))

_HTML = _env.from_string(
    """<!doctype html>
<html lang="uz"><body style="margin:0;padding:24px;background:#f4f5fb;font-family:Arial,sans-serif;color:#1e293b">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0">
<tr><td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:#4f46e5">ROYD · Registrator ofis</td></tr>
<tr><td style="padding:24px">
<h2 style="margin:0 0 12px;font-size:18px">{{ title }}</h2>
{% for line in lines %}<p style="margin:0 0 10px;line-height:1.5">{{ line }}</p>{% endfor %}
{% if link %}<p style="margin:20px 0 0"><a href="{{ link }}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#ffffff;border-radius:8px;text-decoration:none">{{ link_label }}</a></p>{% endif %}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">Bu xabar avtomatik yuborildi, unga javob yozmang.</td></tr>
</table></body></html>"""
)


def request_link(request_id: int, role_base: str = "/registrator/requests") -> str:
    return f"{settings.public_base_url.rstrip('/')}{role_base}/{request_id}"


def render(
    title: str,
    lines: list[str],
    link: str | None = None,
    link_label: str = "Murojaatni ochish",
) -> tuple[str, str]:
    """(text, html) bodies for one message."""
    text = "\n\n".join([title, *lines, *([link] if link else [])])
    html = _HTML.render(title=title, lines=lines, link=link, link_label=link_label)
    return text, html
