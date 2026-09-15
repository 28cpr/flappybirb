# Flappy Roguelite

A single-file Flappy Bird roguelite: every 5 pipes you pick one of three cards,
each pairing a blessing with a curse. Runs are recorded deterministically and
can be replayed.

## Running locally

Two options, both work:

**Just open the file** — `public/index.html` in a browser. Everything works
except the global leaderboard, which needs a server. Personal scores and
replays still save to `localStorage`.

**With the API** — needs Node:

```sh
npm install
npx wrangler kv namespace create SCORES              # once
npx wrangler kv namespace create SCORES --preview    # once
# paste both ids into wrangler.toml
npm run dev
```

## Deploying to Cloudflare Pages

Connect the repo in the Cloudflare dashboard (Workers & Pages → Create →
Pages → Connect to Git):

- **Build command:** *(leave empty — no build step)*
- **Build output directory:** `public`

Then bind the KV namespace: Settings → Functions → KV namespace bindings, with
variable name `SCORES` for both Production and Preview.

Or deploy from the CLI:

```sh
npm run deploy
```

## Layout

```
public/index.html        the whole game, no dependencies
functions/api/scores.js  Pages Function: GET/POST the global board
wrangler.toml            KV binding + Pages config
```

## How the global board works

`GET /api/scores` returns the top 25; `POST /api/scores` submits one run. Rows
are stored in KV as a single JSON array, sorted on write and trimmed to 100.

Submissions are clamped and type-checked server-side, and names are stripped to
`[\w -]` and truncated. Note this validates *shape*, not honesty — a crafted
POST can still claim any score. Because every run carries its seed and inputs,
the fix if it ever matters is to replay submissions server-side and verify the
score; the recording format already supports that.

KV has no transactions, so two simultaneous submissions can lose a row. That is
fine for an arcade board; switch to D1 if you need it exact.

## Replays

A run is stored as its seed, the physics steps on which the player flapped, and
the upgrade cards taken — about 230 bytes, versus megabytes for video. Playback
feeds those back through the same update path.

This only works because the simulation is deterministic: all gameplay
randomness goes through a seeded PRNG, and physics advances on a fixed 1/60
timestep regardless of display refresh rate.
