# HTTP API

Soma serves the competitor API under `/v1`. Use the competition's browser-facing
origin; the local stack proxies these routes through `http://localhost:5173`.
Responses are JSON unless the route redirects or clears a session without a body.

The contracts below describe Soma's workflows. Everything a competitor needs is also a screen on
the site; use this reference when you script against the API.

**Soma caches nine public reads**, so a value can be as old as its cache: ten seconds for the
leaderboard, a match listing or detail, a model detail, a profile and **a version detail**; sixty
seconds for a season listing and the game catalogue (the list and each game). Polling a version's
status more often than every ten seconds returns the same body, so poll every ten seconds or slower.

## Signing in

Send the browser to `GET /v1/auth/github`. GitHub returns through `GET /v1/auth/github/callback`,
and Soma sets an HttpOnly `soma_session` cookie. A session lasts 30 days, and Soma checks
server-side revocation on each authenticated request. Use same-origin requests so the browser sends
the cookie.

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

Soma has no API bearer tokens for an SDK or CLI. Do not send a GitHub personal access token in
place of a Soma session.

## Games, seasons, and ladders

| Method | Path | Query parameters | Result |
|---|---|---|---|
| GET | `/v1/games` | None | Array of registered games |
| GET | `/v1/games/{game}` | None | One game, with its current season |
| GET | `/v1/games/{game}/seasons` | None | Seasons, newest first |
| GET | `/v1/games/{game}/seasons/{slug}/maps` | `enabled`, `boards` | A season's boards, in the order they were added |
| GET | `/v1/games/{game}/seasons/{slug}/maps/{map_id}` | None | One board, the board file itself, and when it was in play |
| GET | `/v1/games/{game}/leaderboard` | `ladder`, `season`, `limit`, `cursor` | Standings page |

These reads are public. `game` is a slug such as `ants`. Ladder values are `nano`, `micro`,
`mini`, `small`, `large` and `open`, and the default is `open`. `season` takes a season's slug, such
as `summer-2026`; a number or a UUID does not work. Omit it for the live season, or the latest
closed season if none is live.

Leaderboard `limit` defaults to 50 and `cursor` to `"0"`. The cursor is an offset string. Follow
the returned `next_cursor` until it is null. Live ratings can reorder the board between requests, so
paging gives you no stable snapshot.

```sh
curl --fail-with-body -sS   'http://localhost:5173/v1/games/ants/leaderboard?ladder=open&limit=10'
```

The body has `season` (the slug), `season_name`, `closed`, `total`, `entries`, and `next_cursor`. Each entry includes `rank`,
`version_id`, `model_id`, `model`, `owner`, `version`, `class`, `size_bytes`, `rating`,
`provisional`, `matches`, `baseline` (whether it is a platform entry), `trend` (how much the rating
moved on the last counted match, or null before the first), and `history` (the last twelve ratings
on this ladder, oldest first, the seed at promotion included, rounded to two places: enough for a
sparkline, and no public route serves a version's full chain).

A season entry includes `name`, `slug`, `state`, `submissions_open_at`, `submissions_close_at`,
`closed_at`, `close_requested_at`, `engine_digest`, `rules`, and **`weight_classes`**: the size
boundaries the season plays under, which you need to read a standing. It also carries five counts:
`entries` (models in the field), `active_versions` (the ladder's size), `entered_versions`
(everything ever submitted), `in_flight_versions` (how many are mid-admission), and
`matches_played`, which **excludes trials** so it agrees with what `GET /v1/matches` can reach.
`maps` summarises the season's boards: how many are in play and how many are not, and the seats and
sides the ones in play span. See [Seasons](../competing/seasons.md).

A season's maps listing covers every board the season has, in play or not, because matches name
them. For each it gives `map_id`, `players`, `rows`, `cols`, whether it is `enabled` (in play),
`added_at` and the counted `matches` played on it. `?enabled=true` narrows it to the boards in play,
and `?boards=true` adds each `board`: the map file as uploaded, unchanged, which is the same JSON a
replay carries and a file `tinybrains` plays from a path. A board is public from the moment an admin
uploads it.

`rules` is the season's document with one redaction: the API reports a participant list as
`{"enabled": true}` and withholds the roster, because the roster names people. The API publishes the
rest of the contest you are entering in full.

## Models, versions and matches

The API addresses a model by its UUID, and a version by its own.
[Models and versions](../competing/models.md) explains why.

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

A model detail reports its name, owner, whether it is retired, and every version of it, newest
first.

A version detail reports its model, owner, game, version number, `class` and `class_max_bytes`,
`size_bytes`, `param_count`, measured `infer_us`, both hashes, `orion_version` (the runtime that
admitted it, which the platform records in place of an evaluator digest), `season`, `status`,
`phase`, `admit_attempt`, `successor`, `reject_reason`, the latest `trial`, `ratings`, `baseline`,
and `last_played_at`. Many fields stay null until admission produces them. `ratings` is keyed by
ladder. `successor` is **the same model's** next version number, and appears only once this version
is superseded.

`GET /v1/matches` is an array of **finished and rated matches only**, newest played first, with the
requested model's rank and score, and it has no cursor.

**`GET /v1/me/matches` covers what that listing leaves out.** For your own matches it also
returns queued, cancelled and failed rows and your trials, newest first by when each was played or,
for one never played, created. Each row adds `withdrawn_reason` and `successor` for a cancellation,
and `fault_reason` for a failure; each seat carries `mine`, so you can tell which side is yours in
a match between two of your own models. It pages with `total` and a `next_cursor`.

A match detail contains `players`, `is_trial`, engine/evaluator identities, seed,
`map` (the board's id in its season), ending reason, timing, status, cancellation/failure fields, and a temporary
`replay_url` when available. Each player records its model/version, score, rank,
strikes, and per-ladder `rating_change`. The version's `trial` field also reports trial progress.

The detail workflows do not turn an absent database row into a `404`, so an unknown UUID can get a
null body instead of a structured not-found error. Handle a null body as well as HTTP errors.

## Submitting

**Ask before you post.** `GET /v1/games/{game}/submission` reports your standing against the
season's submission limits (how many models and versions you hold against each cap, whether a
candidate of yours is already in flight, when a cooldown ends) in the words the refusal would use.
One read tells you about a `409` before you hit it, except `weights_already_entered`, which needs
the hash you post.

`POST /v1/submissions` requires a session and this body shape:

```json
{
  "game": "ants",
  "model": "<model UUID>",
  "weights_hash": "sha256:<64 hex digits>",
  "manifest_hash": "sha256:<64 hex digits>"
}
```

`model` is the `model_id` of an existing model of yours. Soma answers an unknown one with
`404 unknown_model`; a submission never creates a model.

Replace the illustrative values with your model id and your hashes. The response is `201` with
`version_id`, `model_id`, `model`, `version`, `status`, `season`, and both hashes. Soma records a
testing version, which still has admission and its trial ahead of it before it reaches the ladder.
**Posting the same two hashes again answers `200` for the same version with fresh upload URLs**,
valid for what is left of the version's thirty-minute upload window; use it to recover a failed
upload. See [Submitting a version](../competing/submitting.md) for a session-based example.

## Errors and rate limits

Check the HTTP status before you read a success body. Soma refuses a request with `400` for
missing hashes or a missing name, `401` for an invalid session, `404` for a model you do not have,
and `409` for season, eligibility, quota, cooldown, duplicate-weights or in-flight candidate
conflicts. Error details differ depending on whether Soma or the runtime under it produced the
response. The [rejection reference](rejection-reasons.md) separates request errors from later
version verdicts.

Soma declares rate limits twice: per route, and per signed-in user on the routes with an account
behind them.

| Scope | Limit |
|---|---|
| Every public route | 30 requests/second, burst 60 |
| Every session route | 20 requests/second, burst 40 |
| Per user, on reads: `/me`, `/models`, the session routes, `/me/matches`, the submission preflight | 10 requests/second, burst 20 |
| Per user, on writes: submission, model creation and editing, season administration | 1 request/second, burst 5 |

Back off on `429`, and respect any retry timing the response gives. These channels declare no daily
submission allowance. Soma caches the public reads for ten seconds or more, so a tight poll earns you
nothing but a `429`.

## Administrative routes

`POST /v1/games/{game}/seasons` creates a season and needs its `name`,
`PATCH /v1/games/{game}/seasons/{slug}` edits a scheduled one (never its name), and
`POST /v1/games/{game}/seasons/{slug}/close` requests closure.
`POST /v1/games/{game}/seasons/{slug}/maps` uploads one board: the game's own engine checks it, and
Soma stores it out of play. `PATCH .../maps/{map_id}` with `{"enabled": true}` or `false` puts it in
play or takes it out. An administrator manages a season's baselines the same way.
`GET /v1/games/{game}/seasons/{slug}/baselines` lists them; `POST` records one by a `name` and the
two hashes and answers two upload URLs, after which admission handles it as it handles a submission
and it lands out of play; `PATCH .../baselines/{baseline}` switches it. All eight need an
administrator's live session, and none is a competitor action. Soma's workflows hold their request
contracts. No public route forces a match, promotes a version or withdraws your own version.

`GET /v1/admin-check` is an authorization probe: a reverse proxy calls it to decide whether to pass
a request through to an operations console, and competitors have no use for it.
