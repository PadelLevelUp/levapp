"""Wait for an uploaded build to finish processing and attach it to TestFlight's
Internal group (PAD-351). Needs PyJWT (the backend venv has it).

    python scripts/asc_attach_build.py <build-number>

Only reads builds and adds a build to the Internal beta group. It never
creates an App Store version or submits anything for review.
"""

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import jwt

KEY_ID = "79ZZ536G63"
ISSUER = "2cb8a0f4-101b-4cf9-aefc-7ad083614427"
APP_ID = "6794271800"
INTERNAL_GROUP = "9512bbc7-fefc-4f1f-a5c1-7bab3ee318db"
API = "https://api.appstoreconnect.apple.com"


def token() -> str:
    key = (Path.home() / ".appstoreconnect/private_keys" / f"AuthKey_{KEY_ID}.p8").read_text()
    now = int(time.time())
    return jwt.encode(
        {"iss": ISSUER, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
        key,
        algorithm="ES256",
        headers={"kid": KEY_ID},
    )


def call(method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        raw = resp.read()
    return json.loads(raw) if raw else {}


def main(build: str) -> None:
    query = urllib.parse.urlencode({"filter[app]": APP_ID, "filter[version]": build, "limit": 5})
    deadline = time.time() + 60 * 60
    while True:
        builds = call("GET", f"/v1/builds?{query}").get("data", [])
        state = builds[0]["attributes"]["processingState"] if builds else "NOT_FOUND"
        print(f"build {build}: {state}", flush=True)
        if state == "VALID":
            break
        if state in ("FAILED", "INVALID"):
            sys.exit(f"BUILD {build} {state}")
        if time.time() > deadline:
            sys.exit(f"BUILD {build} still {state} after an hour")
        time.sleep(60)
    build_id = builds[0]["id"]
    call(
        "POST",
        f"/v1/betaGroups/{INTERNAL_GROUP}/relationships/builds",
        {"data": [{"type": "builds", "id": build_id}]},
    )
    attached = call("GET", f"/v1/betaGroups/{INTERNAL_GROUP}/builds?limit=200").get("data", [])
    if not any(b["id"] == build_id for b in attached):
        sys.exit(f"BUILD {build} not in the Internal group after attaching")
    print(f"ATTACHED build {build} ({build_id}) to the Internal group", flush=True)


if __name__ == "__main__":
    main(sys.argv[1])
