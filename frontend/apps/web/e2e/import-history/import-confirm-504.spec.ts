import { test, expect } from "@playwright/test";
import { COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";

/**
 * PAD-11: Excel upload shows false 504 error despite successful upload.
 *
 * Root cause: the import "Confirm" step was a single blocking POST that sent no
 * bytes until fully done. On large uploads the front gateway returned a 504
 * before the backend finished — even though rows were committed incrementally,
 * so the data persisted and only showed up after a manual refresh.
 *
 * Fix: the confirm step now streams (SSE), keeping the connection alive with
 * progress events and delivering the final results in the stream, so the
 * gateway never idle-times-out and the UI reflects the outcome without a refresh.
 *
 * These tests exercise the streaming confirm endpoint directly (the analyze step
 * depends on OpenAI and is out of scope here) and assert it returns a proper
 * event-stream that ends with the created records.
 */

let counter = 0;

async function getAuthToken(
  request: import("@playwright/test").APIRequestContext,
): Promise<string> {
  const res = await request.post("/api/auth/login", {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  const body = await res.json();
  return body.accessToken;
}

function uniquePlayers(n: number) {
  counter++;
  const ts = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    name: `Confirm Player ${ts}-${counter}-${i + 1}`,
    email: `confirm-${ts}-${counter}-${i + 1}@e2e.com`,
  }));
}

// ---------------------------------------------------------------------------
// PAD-11: streaming confirm returns an event-stream (not a blocking JSON body)
// ---------------------------------------------------------------------------

test("PAD-11: import confirm streams progress and completes without a 504", async ({
  request,
}) => {
  const token = await getAuthToken(request);
  const players = uniquePlayers(3);

  const res = await request.post("/api/app/import/confirm/stream", {
    headers: { Authorization: `Bearer ${token}` },
    data: { Players: players },
  });

  // Must NOT be a 504 (or any error) — a real streamed 200 response.
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/event-stream");

  const body = await res.text();

  // The stream must carry a terminal "done" event with the per-table results.
  const doneLine = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)))
    .find((ev) => ev.type === "done");

  expect(doneLine, "stream must end with a done event").toBeTruthy();
  expect(doneLine.results.Players.imported).toBe(3);
  expect(doneLine.results.Players.errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// PAD-11: the streamed import actually persists the players (no refresh needed)
// ---------------------------------------------------------------------------

test("PAD-11: streamed confirm persists players and they are queryable", async ({
  request,
}) => {
  const token = await getAuthToken(request);
  const players = uniquePlayers(2);

  const res = await request.post("/api/app/import/confirm/stream", {
    headers: { Authorization: `Bearer ${token}` },
    data: { Players: players },
  });
  expect(res.status()).toBe(200);
  await res.text();

  // The players should be immediately queryable (they were committed).
  for (const p of players) {
    const listRes = await request.get(
      `/api/app/coach_players_paginated?search=${encodeURIComponent(p.name)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(listRes.ok()).toBeTruthy();
    const list = await listRes.json();
    const names = (list.items ?? []).map((it: any) => it?.name);
    expect(names).toContain(p.name);
  }
});
