# HTTP API

Soma serves the competitor API under `/v1`. Use the competition's browser-facing
origin; the local stack proxies these routes through `http://localhost:5173`.
Responses are JSON unless the route redirects or clears a session without a body.

The contracts below describe the current workflows. Everything a competitor needs is also a screen
on the site, so reach for this reference when you are scripting against the API rather than when you
are entering a model.

**Nine public reads are cached**, so a value can be up to its age old: ten seconds for the
leaderboard, a match listing or detail, a model detail, a profile and **a version detail**; sixty
seconds for a season listing; five minutes for the game catalogue. Polling a version's status faster
than ten seconds returns the same body, so poll on that period or slower.

## Signing in

Navigate the browser to `GET /v1/auth/github`. GitHub returns through
`GET /v1/auth/github/callback`, and Soma sets an HttpOnly `soma_session` cookie.
The current session lifetime is 30 days, with server-side revocation checked on
authenticated requests. Use same-origin requests so the browser sends the cookie.

| Method | Path | Authentication | Result |
|---|---|---|---|
| GET | `/v1/auth/github` | Public | Begin OAuth via redirect |
| GET | `/v1/auth/github/callback` | OAuth callback | Complete sign-in |
| GET | `/v1/me` | Session | Current account |
| PATCH | `/v1/me` | Session | Update your display name |
| GET | `/v1/sessions` | Session | Your live sessions, one row each |
| DELETE | `/v1/sessions/{sid}` | Session | Revoke one of them by id |
| DELETE | `/v1/session` | Session | Revoke the current session and clear the cookie |
| GET | `/v1/profiles/{username}` | Public | A competitor's public page |
| GET | `/v1/status` | Public | Platform status |

API bearer tokens for an SDK or CLI are not implemented. Do not send a GitHub
personal access token as though it were a Soma session.

## Games, seasons, and ladders

| Method | Path | Query parameters | Result |
|---|---|---|---|
| GET | `/v1/games` | None | Array of registered games |
| GET | `/v1/games/{game}` | None | One game, with its current season |
| GET | `/v1/games/{game}/seasons` | None | Seasons, newest first |
| GET | `/v1/games/{game}/seasons/{slug}/maps` | `enabled`, `boards` | A season's boards, in the order they were added |
| GET | `/v1/games/{game}/seasons/{slug}/maps/{map_id}` | None | One board, the board file itself, and when it was in play |
| GET | `/v1/games/{game}/leaderboard` | `ladder`, `season`, `limit`, `cursor` | Standings page |

These reads are public. `game` is a slug such as `ants`. Ladder values are `nano`,
`micro`, `mini`, `small`, `large`, and `open`; default is `open`. `season` is a
season's slug — `summer-2026` — not a number and not a UUID. Omit it for the live
season, or latest closed season when there is no live one.

Leaderboard `limit` defaults to 50 and `cursor` to `"0"`. The cursor is an offset
string. Use returned `next_cursor` until it is null. Live ratings can reorder
between requests, so pagination is not a stable snapshot.

```sh
curl --fail-with-body -sS   'http://localhost:5173/v1/games/ants/leaderboard?ladder=open&limit=10'
```

The body has `season` (the slug), `season_name`, `closed`, `total`, `entries`, and `next_cursor`. Each entry includes `rank`,
`version_id`, `model_id`, `model`, `owner`, `version`, `class`, `size_bytes`, `rating`,
`provisional`, `matches`, `baseline` (whether it is a platform entry), `trend` (how much the rating
moved on the last counted match, or null before the first), and `history` (the last twelve ratings
on this ladder, oldest first, the seed at promotion included, rounded to two places — enough for a
sparkline; a version's full chain is not a public route).

A season entry includes `name`, `slug`, `state`, `submissions_open_at`, `submissions_close_at`,
`closed_at`, `close_requested_at`, `engine_digest`, `rules`, and **`weight_classes`** — the size
boundaries that season is played under, which a standing cannot be read without. It also carries
five counts, which answer different questions: `entries` (models in the field), `active_versions`
(the ladder's size), `entered_versions` (everything ever submitted), `in_flight_versions` (how many
are mid-admission), and `matches_played`, which **excludes trials** so that it agrees with what
`GET /v1/matches` can reach. `maps` summarises its boards: how many are in play and how many are
not, and the seats and sides the ones in play span. See [Seasons](../competing/seasons.md).

A season's maps listing gives each board's `map_id`, `players`, `rows`, `cols`, whether it is
`enabled` (in play), `added_at` and the counted `matches` played on it — every board the season has,
in play or not, because matches name them. `?enabled=true` narrows it to the boards in play and
`?boards=true` adds each `board`, the map file exactly as uploaded: the same JSON a replay carries,
and a file `tinybrains` plays from a path. A board is public from the moment it is uploaded.

`rules` is the season's document with one redaction: a participant list is reported as
`{"enabled": true}` rather than as the roster, because the roster names people. Everything else is
the contest you are entering and is published in full.

## Models, versions and matches

A model is addressed by its UUID, and so is a version.
See [Models and versions](../competing/models.md) for why.

| Method | Path | Authentication | Parameters |
|---|---|---|---|
| POST | `/v1/games/{game}/models` | Session | Body `{name}` |
| GET | `/v1/games/{game}/models` | Public | Optional `owner`, or `mine=1` with a session |
| GET | `/v1/models/{id}` | Public | Model UUID |
| PATCH | `/v1/models/{id}` | Session, owner | Body `{name?, retired?}` |
| GET | `/v1/versions/{id}` | Public | Version UUID |
| GET | `/v1/models` | Session | Optional `game` query; the caller's models |
| GET | `/v1/games/{game}/submission` | Session | Your standing against every one of the season's rules, before you make a request |
| GET | `/v1/matches` | Public | `model` (every version of one) or `version` (one); optional `limit`, default 25 |
| GET | `/v1/matches/{id}` | Public | Match UUID |
| GET | `/v1/me/matches` | Session | Every match of yours, in every state; optional `game`, `limit`, `cursor` |

A model detail reports its name, owner, whether it is retired, and every version
of it newest first.

A version detail reports its model, owner, game, version number, `class` and `class_max_bytes`, `size_bytes`, `param_count`, measured `infer_us`,
both hashes, `orion_version` — the runtime that admitted it, which is what the platform records
where it once recorded an evaluator digest — `season`, `status`, `phase`, `admit_attempt`,
`successor`, `reject_reason`, the latest `trial`, `ratings`, `baseline`, and `last_played_at`. Many
fields are null before admission produces them. `ratings` is keyed by ladder. `successor` is **the
same model's** next version number, and is reported only once this version is superseded.

`GET /v1/matches` is an array of **finished and rated matches only**, newest played first, with the
requested model's rank and score, and it has no cursor.

**`GET /v1/me/matches` is the half that cannot do.** On your own matches you also see queued,
cancelled and failed rows and your trials, newest first by when they were played or, for one that
never was, created. Each row adds `withdrawn_reason` and `successor` for a cancellation, and
`fault_reason` and `fault_seat` for a failure; each seat carries `mine`, so you can tell which side
is yours in a match between two of your own models. It pages with `total` and a `next_cursor`.

A match detail contains `players`, `is_trial`, engine/evaluator identities, seed,
`map` (the board's id in its season), ending reason, timing, status, cancellation/failure fields, and a temporary
`replay_url` when available. Each player records its model/version, score, rank,
strikes, and per-ladder `rating_change`. Trial progress is also available through
the version's `trial` field.

The current detail workflows do not explicitly turn an absent database row into
`404`; clients should handle a null body as well as HTTP errors. Do not assume
that every unknown UUID receives a structured not-found error.

## Submitting

**Ask before you post.** `GET /v1/games/{game}/submission` reports your standing against every rule
the season declares — how many models and versions you hold against each cap, whether a candidate
of yours is already in flight, when a cooldown ends — in the same words the refusal would use. It
costs one read and turns a `409` into something you knew beforehand.

`POST /v1/submissions` requires a session and this body shape:

```json
{
  "game": "ants",
  "model": "<model UUID>",
  "weights_hash": "sha256:<64 hex digits>",
  "manifest_hash": "sha256:<64 hex digits>"
}
```

`model` is the `model_id` of an existing model of yours. An unknown one is
`404 unknown_model`: a submission never creates one.

Replace the illustrative values with your model id and actual hashes. The response
is `201` with `version_id`, `model_id`, `model`, `version`, `status`, `season`,
and both hashes. It records a testing version rather than accepting the entry
directly onto the ladder. **Posting the same two hashes again answers `200` for
the same version with fresh upload URLs**, good for what is left of the version's
thirty-minute upload window, which is how a failed upload is recovered.
See [Submitting a version](../competing/submitting.md) for a session-based example.

## Errors and rate limits

Handle the HTTP status before interpreting a success body. Request refusals
include `400` for missing hashes or a missing name, `401` for invalid sessions,
`404` for a model you do not have, and `409` for season, eligibility, quota,
cooldown, duplicate-weights or in-flight candidate conflicts. Error details
can vary by whether Soma or the underlying runtime produced the response.
The [rejection reference](rejection-reasons.md) separates request errors from
later version verdicts.

Rate limits are declared twice: per route, and per signed-in user on the routes that have an
account behind them.

| Scope | Limit |
|---|---|
| Every public route | 30 requests/second, burst 60 |
| Every session route | 20 requests/second, burst 40 |
| Per user, on reads — `/me`, `/models`, the session routes, `/me/matches`, the submission preflight | 10 requests/second, burst 20 |
| Per user, on writes — submission, model creation and editing, season administration | 1 request/second, burst 5 |

Back off on `429`; when a response provides retry timing, respect it. No daily submission allowance
is declared by these channels. Because the public reads are cached for ten seconds or more, a tight
poll buys nothing but a `429`.

## Administrative routes

`POST /v1/games/{game}/seasons` creates a season and needs its `name`,
`PATCH /v1/games/{game}/seasons/{slug}` edits a scheduled one (never its name), and
`POST /v1/games/{game}/seasons/{slug}/close` requests closure. `POST
/v1/games/{game}/seasons/{slug}/maps` uploads one board, which is stored out of play and checked by
the game's own engine, and `PATCH .../maps/{map_id}` with `{"enabled": true}` or `false` puts it in
play or takes it out. A season's baselines are managed the same way: `GET
/v1/games/{game}/seasons/{slug}/baselines` lists them, `POST` records one by a `name` and the two
hashes — answering two upload URLs, after which it is admitted exactly as a submission is and lands
out of play — and `PATCH .../baselines/{baseline}` switches it. All eight require an administrator's
live session and are not competitor actions. Their request
contracts are maintained in Soma's workflows. There is no public route for
forcing a match, promoting a version, or withdrawing your own version.

`GET /v1/admin-check` is not a competitor route either: it is an authorization probe a reverse
proxy calls to decide whether to pass a request through to an operations console.
