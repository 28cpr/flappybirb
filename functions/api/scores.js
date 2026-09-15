/**
 * Global scoreboard — Cloudflare Pages Function.
 *
 * GET  /api/scores        -> { scores: [...] }  top runs, highest first
 * POST /api/scores        -> { ok: true, rank } submit one run
 *
 * Requires a KV namespace bound as SCORES. Without it the endpoint reports
 * that it is unconfigured and the game quietly falls back to local-only
 * scores, so the site still works.
 */

const KEY = "global:v1";
const MAX_KEEP = 100;        // rows retained
const MAX_RETURN = 25;       // rows served

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });

export const onRequestOptions = () => json({ ok: true });

export async function onRequestGet({ env }) {
  if (!env.SCORES) return json({ scores: [], unconfigured: true });
  const raw = await env.SCORES.get(KEY);
  const scores = raw ? JSON.parse(raw) : [];
  return json({ scores: scores.slice(0, MAX_RETURN) });
}

export async function onRequestPost({ request, env }) {
  if (!env.SCORES) return json({ ok: false, unconfigured: true }, 200);

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "bad json" }, 400); }

  const entry = sanitise(body);
  if (!entry) return json({ ok: false, error: "invalid entry" }, 400);

  // Read-modify-write. KV is eventually consistent and has no transactions, so
  // a simultaneous submission can lose a row; for a arcade leaderboard that is
  // an acceptable trade for the simplicity. Use D1 if you need it exact.
  const raw = await env.SCORES.get(KEY);
  const list = raw ? JSON.parse(raw) : [];
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_KEEP);
  await env.SCORES.put(KEY, JSON.stringify(trimmed));

  const rank = trimmed.findIndex(r => r.id === entry.id);
  return json({ ok: true, rank: rank < 0 ? null : rank + 1 });
}

/** Clamp and type-check anything that came from the client. */
function sanitise(b) {
  if (!b || typeof b !== "object") return null;

  const score = Math.floor(Number(b.score));
  const pipes = Math.floor(Number(b.pipes));
  if (!Number.isFinite(score) || score < 0 || score > 1e7) return null;
  if (!Number.isFinite(pipes) || pipes < 0 || pipes > 1e6) return null;

  // A run cannot score without passing pipes, and passive income is capped by
  // how long a run can plausibly last. This rejects only absurd claims — it is
  // not proof of a fair run, which would need server-side replay.
  if (pipes === 0 && score > 0) return null;

  const name = String(b.name || "anon")
    .replace(/[^\w \-]/g, "")
    .trim()
    .slice(0, 14) || "anon";

  const flaps = Array.isArray(b.flaps) ? b.flaps.slice(0, 20000).filter(Number.isFinite) : [];
  const picks = Array.isArray(b.picks) ? b.picks.slice(0, 200).filter(Number.isFinite) : [];
  const seed = Number.isFinite(Number(b.seed)) ? Number(b.seed) >>> 0 : 0;

  return {
    id: crypto.randomUUID(),
    name, score, pipes, seed, flaps, picks,
    date: Date.now()
  };
}
