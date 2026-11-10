"""Password-reset email: correct link, never attacker-controlled, always sent.

- Reset-link poisoning: a request with Origin: https://evil.example must still produce a
  link to the real site (FRONTEND_URL), never to the attacker.
- A known Origin (FRONTEND_URL / CORS_ORIGINS) keeps working (dev on localhost).
- The reset email must not depend on the optional "password changed" notification switch.
"""
import json

import pytest

import routes.auth as auth_mod
from config import Config

SITE = 'https://valoryx.ryxtech.in'


@pytest.fixture
def sent(monkeypatch):
    calls = []
    monkeypatch.setattr(auth_mod, 'send_password_reset_email',
                        lambda to, name, link: calls.append((to, link)))
    monkeypatch.setattr(Config, 'FRONTEND_URL', SITE)
    monkeypatch.setattr(Config, 'CORS_ORIGINS', [SITE, 'http://localhost:3000'])
    return calls


def _forgot(http, email, origin=None):
    headers = {'Origin': origin} if origin else {}
    return http.post('/api/auth/forgot-password', data=json.dumps({'email': email}),
                     content_type='application/json', headers=headers)


def test_attacker_origin_cannot_redirect_the_reset_link(http, sample_user, sent):
    assert _forgot(http, sample_user.email, origin='https://evil.example').status_code == 200
    assert len(sent) == 1
    link = sent[0][1]
    assert link.startswith(f'{SITE}/reset-password?token=') and 'evil' not in link


def test_known_origin_is_kept_for_local_dev(http, sample_user, sent):
    _forgot(http, sample_user.email, origin='http://localhost:3000')
    assert sent[0][1].startswith('http://localhost:3000/reset-password?token=')


def test_no_origin_uses_the_site(http, sample_user, sent):
    _forgot(http, sample_user.email)
    assert sent[0][1].startswith(f'{SITE}/reset-password?token=')


def test_reset_email_sent_even_with_password_changed_notifications_off(http, sample_user, sent, monkeypatch):
    monkeypatch.setattr(auth_mod, '_email_enabled', lambda flag: flag != 'email_on_password_changed')
    _forgot(http, sample_user.email)
    assert len(sent) == 1


def test_reset_email_not_sent_when_all_email_is_off(http, sample_user, sent, monkeypatch):
    monkeypatch.setattr(auth_mod, '_email_enabled', lambda flag: False)
    assert _forgot(http, sample_user.email).status_code == 200  # same answer — no enumeration
    assert sent == []
