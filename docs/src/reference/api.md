# HTTP API

Soma serves the competitor API under `/v1`. Use the competition's browser-facing
origin; the local stack proxies these routes through `http://localhost:5173`.
Responses are JSON unless the route redirects or clears a session without a body.

The contracts below describe Soma's workflows. Everything a competitor needs is also a screen on
the site; use this reference when you script against the API.

**Soma caches its public reads** (the leaderboard, matches, models, versions, profiles, seasons,
games, boards and the site's community pages) for up to ten minutes, and clears a cached read the
moment a writer changes the data under it, so a public read is current when you get it. The reads
about your own account under `/v1/me`, and the member reads under `/v1/private`, are never cached.

## Signing in

Send the browser to `GET /v1/auth/{provider}` (for example `/v1/auth/github`). The provider returns
through `GET /v1/auth/{provider}/callback`, and Soma sets an HttpOnly `soma_session` cookie. A session
lasts 30 days, and Soma checks server-side revocation on each authenticated request. Use same-origin
requests so the browser sends the cookie. `GET /v1/auth-providers` lists the providers this deployment
serves, which is how the sign-in page draws a button for each.

| Method | Path | Authentication | Result |
|---|---|---|---|
| GET | `/v1/auth-providers` | Public | The sign-in providers `[{slug,label}]` |
| GET | `/v1/auth/{provider}` | Public | Begin OAuth via redirect |
| GET | `/v1/auth/{provider}/callback` | OAuth callback | Complete sign-in |
| GET | `/v1/me` | Session | Current account |
| PATCH | `/v1/me` | Session | Update your display name or bio |
| GET | `/v1/me/candidates` | Session | Your versions still being admitted or on trial |
| GET | `/v1/sessions` | Session | Your live sessions, one row each |
| DELETE | `/v1/sessions/{sid}` | Session | Revoke one of them by id |
| DELETE | `/v1/sessions/others` | Session | Revoke every session but this one |
| DELETE | `/v1/session` | Session | Revoke the current session and clear the cookie |
| GET | `/v1/profiles/{username}` | Public | A competitor's public page |
| GET | `/v1/status` | Public | Platform status |

Soma has no API bearer tokens for an SDK or CLI. Do not send a GitHub personal access token in
place of a Soma session.

## Games, seasons, and ladders

| Method | Path | Query parameters | Result |
|---|---|---|---|
| GET | `/v1/games` | None | Array of registered games |
| GET | `/v1/games/{game}` | None | One game, with its featured season |
| GET | `/v1/games/{game}/seasons` | None | The public seasons, newest first |
| GET | `/v1/games/{game}/seasons/{slug}/maps` | `enabled`, `boards` | A season's boards, in the order they were added |
| GET | `/v1/games/{game}/seasons/{slug}/maps/{map_id}` | None | One board, the board file itself, and when it was in play |
| GET | `/v1/games/{game}/seasons/{slug}/podium` | None | The top three on each ladder, frozen once the season closes |
| GET | `/v1/games/{game}/seasons/{slug}/playing` | None | How many matches are being played right now; never cached |
| GET | `/v1/games/{game}/leaderboard` | `ladder`, `season`, `limit`, `cursor` | Standings page |
| GET | `/v1/games/{game}/leaderboard/series` | `ladder`, `season` | Each entry's rank and rating at evenly spaced points over the season |

These reads are public. `game` is a slug such as `ants`. Ladder values are `nano`, `micro`,
`mini`, `small`, `large` and `open`, and the default is `open`. `season` takes a season's slug, such
as `summer-2026`; a number or a UUID does not work. Omit it for the game's **featured** season: the
public season a platform administrator featured, else the newest live public season, else the newest
public season. Seasons overlap, so name the one you mean. A private season answers here as one that
does not exist; see [Private seasons](#private-seasons).

Leaderboard `limit` defaults to 50, at most 200, and `cursor` to `"0"`. The cursor is an offset
string. Follow the returned `next_cursor` until it is null. Live ratings can reorder the board
between requests, so paging gives you no stable snapshot.

```sh
curl --fail-with-body -sS   'http://localhost:5173/v1/games/ants/leaderboard?ladder=open&limit=10'
```

The body has `season` (the slug), `season_name`, `closed`, `round` (the season's current
[round](../competing/ranking.md#rounds-and-score-resets), `{n, kind, games}`, or null), `total`,
`entries`, and `next_cursor`.
Each entry includes `rank`, `version_id`, `model_id`, `model`, `owner`, `version`, `class`,
`size_bytes`, `rating`, `provisional`, `matches`, `round_matches` (rated matches in the current
round, null without one), `baseline` (whether it is a platform entry),
`trend` (how much the rating moved on the last counted match, or null before the first), and
`history` (the last twelve ratings on this ladder, oldest first, the seed at promotion included,
rounded to two places: enough for a sparkline). Entries level on rating are ordered by version id,
the same way every time.

A season entry includes `name`, `slug`, `state`, `submissions_open_at`, `submissions_close_at`,
`closed_at`, `close_requested_at`, `visibility` (`public` or `private`), `entry` (`open` or
`restricted`), `engine_digest`, `rules`, and **`weight_classes`**: the size
boundaries the season plays under, which you need to read a standing, each with the memory its
class allows (`memory_flat_bytes` and `memory_cell_bytes`, 0 when absent). It also carries five
counts: `entries` (models in the field), `active_versions` (the ladder's size), `entered_versions`
(everything ever submitted), `in_flight_versions` (how many are mid-admission), and
`matches_played`, which **excludes trials** so it agrees with what `GET /v1/matches` can reach.
`maps` summarises the season's boards, how many are in play and how many are not, and the seats and
sides the ones in play span; `baselines` summarises its baselines the same way. `round` is the
round it is in (`{n, kind, games, started_at}`, `kind` being `round` or `finals`) and `next_round`
the reset waiting to start (`{n, kind, games, starts_at}`), each null without one. See
[Seasons](../competing/seasons.md).

A season's maps listing covers every board the season has, in play or not, because matches name
them. For each it gives `map_id`, `players`, `rows`, `cols`, whether it is `enabled` (in play),
`added_at` and the counted `matches` played on it. `?enabled=true` narrows it to the boards in play,
and `?boards=true` adds each `board`: the map file as uploaded, unchanged, which is the same JSON a
replay carries and a file `tinybrains` plays from a path. A board is public from the moment an admin
uploads it.

`rules` is the season's document, published whole: it is the contest you are entering. Who may enter
is not a rule. `entry` says whether the season is restricted to its participants, and the roster
itself, which names people, is readable only by the season's administrators.

## Private seasons

A private season is visible only to its participants, its season administrators and platform
administrators. To anyone else every route answers as it would for a season that does not exist,
and its versions and matches answer `404`. Its members read it through signed-in copies of the
public reads: the same parameters and the same response shapes, under `/v1/private`, never cached.
For a season the caller may not see, each answers exactly as the public route does.

| Method | Path | The member's copy of |
|---|---|---|
| GET | `/v1/private/games/{game}/seasons` | `/v1/games/{game}/seasons`, with the private seasons you may see |
| GET | `/v1/private/games/{game}/leaderboard` | `/v1/games/{game}/leaderboard` |
| GET | `/v1/private/games/{game}/leaderboard/series` | `/v1/games/{game}/leaderboard/series` |
| GET | `/v1/private/games/{game}/seasons/{slug}/maps` | `.../seasons/{slug}/maps` |
| GET | `/v1/private/games/{game}/seasons/{slug}/maps/{map_id}` | `.../seasons/{slug}/maps/{map_id}` |
| GET | `/v1/private/games/{game}/seasons/{slug}/podium` | `.../seasons/{slug}/podium` |
| GET | `/v1/private/games/{game}/seasons/{slug}/playing` | `.../seasons/{slug}/playing` |
| GET | `/v1/private/models/{id}` | `/v1/models/{id}` |
| GET | `/v1/private/versions/{id}` | `/v1/versions/{id}` |
| GET | `/v1/private/matches` | `/v1/matches` |
| GET | `/v1/private/matches/{id}` | `/v1/matches/{id}` |
| GET | `/v1/private/matches/{id}/frame` | `/v1/matches/{id}/frame` |
| GET | `/v1/private/matches/{id}/related` | `/v1/matches/{id}/related` |
| GET | `/v1/private/threads` | `/v1/threads`: a private season's match carries comments among the people who see its season |

Without `season`, a member read still resolves the featured season: a private season is never the
default, so name it.

## Models, versions and matches

The API addresses a model by its UUID, and a version by its own.
[Models and versions](../competing/models.md) explains why.

| Method | Path | Authentication | Parameters |
|---|---|---|---|
| POST | `/v1/games/{game}/models` | Session | Body `{name}` |
| GET | `/v1/models` | Session | Optional `game` query; the caller's models |
| GET | `/v1/models/{id}` | Public | Model UUID |
| PATCH | `/v1/models/{id}` | Session, owner | Body `{name?, retired?}` |
| GET | `/v1/models/{id}/season` | Public | This season's record: the last five results, the best and the worst, the rank now and a week ago |
| GET | `/v1/models/{id}/rivals` | Public | The head-to-head record against each model it has met |
| GET | `/v1/versions/{id}` | Public | Version UUID; only once the version is active, superseded or `disabled` (a baseline switched off), and only in a public season |
| GET | `/v1/me/versions/{id}` | Session, owner | One of your versions, in any status; never cached |
| PATCH | `/v1/versions/{id}` | Session, owner | Body `{note}` |
| GET | `/v1/games/{game}/submission` | Session | Your standing against the season's submission limits, before you make a request; optional `model` and `season` (the featured season without it) |
| GET | `/v1/matches` | Public | Filters below; optional `limit`, default 25, at most 60, and `cursor` |
| GET | `/v1/matches/{id}` | Public | Match UUID; only a finished public match in a public season |
| GET | `/v1/matches/{id}/frame` | Public | The match's last frame, with each seat's score |
| GET | `/v1/matches/{id}/related` | Public | Twelve matches related to it |
| GET | `/v1/me/matches` | Session | Every match of yours, in every state; optional `game`, `limit`, `cursor` |
| GET | `/v1/me/matches/{id}` | Session, owner | One match of yours, in any state |

A model detail reports its name, owner, whether it is retired, and every public version of it,
newest first.

A version detail reports its model, owner, game, version number, `class` and `class_max_bytes`,
the memory its class allows and `memory_bytes`, `size_bytes`, `param_count`, measured `infer_us`,
both hashes, `orion_version` (the runtime that admitted it), `season`, `status`, `phase`,
`admit_attempt`, `successor`, `reject_reason`, `note`, the latest `trial`, `ratings`, `baseline`,
`created_at` and `last_played_at`. Many fields stay null until admission produces them. `ratings`
is keyed by ladder. `successor` is **the same model's** next version number, and appears only once
this version is superseded.

**The public version route shows a version once it is on the ladder.** While yours is testing,
verified or rejected, `GET /v1/versions/{id}` answers 404, and `GET /v1/me/versions/{id}` is where
you read its phase, attempt and reason. The same split holds for matches: `GET /v1/matches/{id}`
answers a finished public match and 404 for a trial or a queued pairing, which
`GET /v1/me/matches/{id}` returns to its owner.

`GET /v1/matches` answers an object: `season`, `total`, `matches`, `sort` and `next_cursor`, each
match a card with every seat's model, owner, rank and score. It lists finished and rated matches,
newest first, and the trials of candidates that passed. Narrow it with `model` (every version of
one) or `version` (one), `game`, `season`, `ladder`, `class`, `map`, `outcome`, `owner`,
`players_min`, `players_max`, `vs` (two models that met), `since` and `top`, and order it with
`sort`: `newest`, `closest`, `upset`, `longest` or `discussed`. Follow `next_cursor` for the next
page.

**`GET /v1/me/matches` covers what that listing leaves out.** For your own matches it also
returns queued, cancelled and failed rows and your trials, newest first by when each was played or,
for one never played, created. Each row adds `withdrawn_reason` and `successor` for a cancellation,
and `fault_reason` for a failure; each seat carries `mine`, so you can tell which side is yours in
a match between two of your own models. It pages with `total` and a `next_cursor`.

A match detail contains `seats`, `is_trial`, `engine_digest` and `orion_version`, `seed`, `map`
(the board's id in its season), `reason`, `turns`, `played_at`, `played_ms`, `status`, the
cancellation and failure fields, the ladder it counted on, and a temporary `replay_url` when a
replay exists, signed for one hour. Each seat records its model and version, owner, class, rank,
score, strikes, outcome and its `rating_change`. The version's `trial` field reports trial
progress.

`GET /v1/models/{id}` answers a null body for an unknown id rather than a 404; the version, match
and profile routes answer `404 not_found`. Handle both.

## Submitting

**Ask before you post.** `GET /v1/games/{game}/submission?season=<slug>` reports your standing
against that season's submission limits (how many models and versions you hold against each cap, whether a
candidate of yours is already in flight, when a cooldown ends) in the words the refusal would use.
One read tells you about a `409` before you hit it, except `weights_already_entered`, which needs
the hash you post.

`POST /v1/submissions` requires a session and this body shape:

```json
{
  "game": "ants",
  "season": "summer-2026",
  "model": "<model UUID>",
  "weights_hash": "sha256:<64 hex digits>",
  "manifest_hash": "sha256:<64 hex digits>",
  "note": "optional: what changed in this version"
}
```

`season` is the slug of the season the version enters, and left out it is the game's featured
season. `model` is the `model_id` of an existing model of yours. Soma answers an unknown one with
`404 unknown_model`; a submission never creates a model. A `note` is optional, at most a short
paragraph, and refused with `400 note_too_long` or `422 note_word_listed`.

Replace the illustrative values with your model id and your hashes. The response is `201` with
`version_id`, `model_id`, `model`, `version`, `status`, `season`, both hashes and `upload`. Soma
records a testing version, which still has admission and its trial ahead of it before it reaches
the ladder. **Posting the same two hashes again answers `200` for the same version with fresh
upload URLs**, valid for what is left of the version's thirty-minute upload window; use it to
recover a failed upload. See [Submitting a version](../competing/submitting.md) for a
session-based example.

`POST /v1/submissions/reenter` requires a session and the body `{game, model, season, from}`. It
enters your model `model` into the season `season` with its standing in the season `from` (its
active version there, or the newest it had in play), over the same bytes: nothing is uploaded, and
the answer carries no `upload`. The new version is `testing`, and admission and a trial judge it
again under the new season's rules. It answers `201` with the new version, or `200` when that
version is already in flight. It refuses a missing field with `400 reenter_invalid`, an entry with
no version in play in `from` with `404 nothing_to_reenter`, and otherwise as a submission does.
See [Moving to a new season](../competing/seasons.md#moving-to-a-new-season).

## The site's community routes

The site's pages read these; a script may too. They are public unless marked.

| Method | Path | Result |
|---|---|---|
| GET | `/v1/announcements` | The announcements shown on the site |
| GET | `/v1/stories` | The feed of published posts and featured model stories |
| GET | `/v1/posts/{slug}` | One published post |
| GET | `/v1/models/{id}/story` | A model's approved story; its owner reads the draft at `/v1/me/models/{id}/story` and writes it with `PUT /v1/models/{id}/story` |
| GET | `/v1/games/{game}/picks` | Matches an administrator pinned |
| GET | `/v1/threads?match=` or `?model=` | The comment thread on a match or a model |
| POST | `/v1/threads/comments` | Session: post a comment or a reply |
| DELETE | `/v1/comments/{id}` | Session: delete your own comment |
| POST | `/v1/comments/{id}/reports` | Session: flag a comment |
| GET | `/v1/me/comments` | Session: your comments still being held |
| GET | `/v1/profiles/{username}/comments` | A competitor's live comments |
| GET, POST | `/v1/me/notifications`, `/v1/me/notifications/read` | Session: your notification feed, and marking it read |
| GET, PATCH | `/v1/me/notification-settings` | Session: what you are notified about |
| POST | `/v1/events` | Anonymous watch counters; answers 204 |

## Errors and rate limits

Check the HTTP status before you read a success body. Soma refuses a request with `400` for
missing hashes, a missing name or an overlong note, `401` for an invalid session, `404` for a
model you do not have, `409` for season, eligibility, quota, cooldown, duplicate-weights or
in-flight candidate conflicts, and `422` for a note or bio carrying a word the site lists. Error
details differ depending on whether Soma or the runtime under it produced the response. The
[rejection reference](rejection-reasons.md) separates request errors from later version verdicts.

Soma declares rate limits twice: per route, and per signed-in user on the routes with an account
behind them.

| Scope | Limit |
|---|---|
| Every public route | 30 requests/second, burst 60 |
| Sign-in | 5 requests/second, burst 10 |
| Every session route | 20 requests/second, burst 40 |
| Per user, on reads: `/me`, `/models`, `/me/matches`, the submission preflight, the notification feed | 10 requests/second, burst 20 |
| Per user, on writes: submission, model creation and editing, your profile, revoking a session, season administration | 1 request/second, burst 5 |
| Per administrator, uploading and switching boards and baselines | 5 requests/second, burst 40 |

Back off on `429`, and respect any retry timing the response gives. These channels declare no daily
submission allowance.

## Administrative routes

None of these is a competitor action. Each needs a live session, and Soma checks the caller's
standing on every request, so a removed administrator loses the route at their next call.

**A platform administrator** creates seasons and decides what spans the platform; anyone else gets
`403 admin_only`:

| Method | Path | What it does |
|---|---|---|
| POST | `/v1/games/{game}/seasons` | Create a season: `name`, the window, `rules`, `weight_classes`, `visibility`, `entry`, `fleet`, `providers`, and optionally `admins` (handles) |
| POST | `/v1/games/{game}/seasons/{slug}/featured` | Feature a public season: what every read that names no season resolves to |
| PATCH | `/v1/games/{game}/seasons/{slug}/fleet` | `{matches, admissions}`, each `own`, `platform` or `both`, while the season runs |
| PATCH | `/v1/games/{game}/seasons/{slug}/fill` | The idle fill, while the season runs |
| GET, POST, PATCH | `/v1/games/{game}/seasons/{slug}/rounds`, `.../rounds/{n}` | Rounds and the finals |
| POST, DELETE | `/v1/games/{game}/seasons/{slug}/admins` | Assign or remove a season administrator, by `handle` |

The rest of the platform desk lives under `/v1/admin/*` (announcements, the audit log, comment
moderation, events, notifications, picks, posts, stories, threads, users and the word list), and
`/v1/runner-keys` and `/v1/runners` hold the platform fleet.

**A season's administrators**, and platform administrators, run one season through these routes.
Any other caller is refused with `403 season_admin_only`, and a private season the caller may not
see answers `404 unknown_season`, as one that does not exist would.

| Method | Path | What it does |
|---|---|---|
| PATCH | `/v1/games/{game}/seasons/{slug}` | Edit a `scheduled` season's window, rules and weight classes; never its name, visibility, entry or fleet |
| POST | `/v1/games/{game}/seasons/{slug}/close` | Request the close, which the withdraw clock carries out within the minute |
| GET, POST, DELETE | `/v1/games/{game}/seasons/{slug}/participants` | The roster: add `{logins, provider?}` (one or many, `github` by default), remove `{id}` |
| GET | `/v1/games/{game}/seasons/{slug}/admins` | The season's administrators |
| POST, PATCH | `/v1/games/{game}/seasons/{slug}/maps`, `.../maps/{map_id}` | Upload one board, which the game's own engine checks and Soma stores out of play; `{"enabled": true}` or `false` puts it in play or takes it out |
| POST | `/v1/games/{game}/seasons/{slug}/maps/import` | `{from, maps?}`: copy another season's boards in, out of play |
| GET, POST, PATCH | `/v1/games/{game}/seasons/{slug}/baselines`, `.../baselines/{baseline}` | List, upload (a `name` and the two hashes, answered with two upload URLs; admission handles it like a submission and it lands out of play), and switch a baseline |
| POST | `/v1/games/{game}/seasons/{slug}/baselines/import` | `{from, baselines?}`: admit another season's baselines again under this season's rules, out of play |
| GET, POST | `/v1/games/{game}/seasons/{slug}/runner-keys` | The season's own runner keys and their runners; mint one, shown exactly once, which serves this season and no other |
| DELETE | `/v1/games/{game}/seasons/{slug}/runner-keys/{key}` | Revoke a key of this season |
| DELETE | `/v1/games/{game}/seasons/{slug}/runners/{runner}` | Stop one runner of this season; its current match finishes |
| GET, POST | `/v1/games/{game}/seasons/{slug}/notify` | Tell the season's people something (`{subject, link?}`), and read past sends |
| GET | `/v1/games/{game}/seasons/{slug}/audit` | Every administrative action on the season, newest first |

Soma's workflows hold the request contracts. No route forces a match, promotes a version or
withdraws your own version.

`GET /v1/admin-check` is an authorization probe: a reverse proxy calls it to decide whether to pass
a request through to an operations console, and competitors have no use for it.
