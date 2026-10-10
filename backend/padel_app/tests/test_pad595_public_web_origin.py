"""PAD-595 step 1: shareable links and QR codes are built on this environment's PUBLIC_WEB_ORIGIN,
which the API hands the web client, not on whatever address the coach is browsing from (the old
padellevelup.com domain still serves the app, so `window.location.origin` printed it)."""


def test_the_public_web_origin_is_served_without_a_login(app):
    app.config["PUBLIC_WEB_ORIGIN"] = "https://levapp.app/"
    res = app.test_client().get("/api/app/public-web-origin")
    assert res.status_code == 200
    assert res.get_json() == {"webOrigin": "https://levapp.app"}  # one trailing slash trimmed


def test_unset_answers_null_so_the_client_keeps_its_own_origin(app):
    app.config["PUBLIC_WEB_ORIGIN"] = None
    res = app.test_client().get("/api/app/public-web-origin")
    assert res.status_code == 200
    assert res.get_json() == {"webOrigin": None}
