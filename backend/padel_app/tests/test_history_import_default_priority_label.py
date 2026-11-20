"""History import D3: the `justified_misses` priority criterion's default label says what it ranks by."""
from padel_app.models.notification_config import DEFAULT_PRIORITY_CRITERIA


def test_the_justified_misses_default_label_is_aulas_por_repor():
    labels = {c["id"]: c["label"] for c in DEFAULT_PRIORITY_CRITERIA}
    assert labels["justified_misses"] == "Aulas por repor"
