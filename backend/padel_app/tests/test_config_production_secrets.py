"""B-003: production must never run on the committed dev signing fallbacks."""
import pytest

from padel_app import config


def _env(**over):
    base = {"SECRET_KEY": "", "FLASK_SECRET_KEY": "", "JWT_SECRET_KEY": ""}
    base.update(over)
    return base


def test_production_refuses_unset_secrets():
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        config.get_config_class("production", environ=_env())


def test_production_refuses_dev_fallback_values():
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        config.get_config_class("production", environ=_env(SECRET_KEY="dev-secret-key", JWT_SECRET_KEY="real-jwt"))


def test_production_accepts_flask_secret_key_alias():
    cls = config.get_config_class("production", environ=_env(FLASK_SECRET_KEY="real-secret", JWT_SECRET_KEY="real-jwt"))
    assert cls is config.ProdConfig


def test_development_keeps_fallbacks():
    assert config.get_config_class("development", environ=_env()) is config.DevConfig
