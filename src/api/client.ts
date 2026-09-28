// Typed client for Soma's /v1 surface.
//
// Every call is same-origin and relies on the session cookie, which is HttpOnly:
// "are we signed in?" is answered by calling /v1/me and reading 200 against 401.

import type {
  AdminUserList, Game, GameSummary, Leaderboard, Match, MatchFilters, MatchList, Me, ModelDetail,
  MintedRunnerKey, Preflight, Profile, Runner, RunnerKey, Season, SeasonMap, SeasonMapDetail,
  SeasonMapList, SeasonWeightClass, SessionRow, SeasonBaseline, SeasonBaselineList, SeasonBaselineUpload,
  Status, SubmissionResult, MyModel, VersionDetail, NotificationCategory, NotificationLevel, NotificationPage,
  NotificationSetting, RoleChange, UserRole,
  AdminAnnouncement, AdminAnnouncementList, AdminCommentPage, AdminPickList, AdminPost, AdminPostList,
  AdminStory, AdminStoryList, AdminUserDesk, AnnouncementKind, AnnouncementList, AuditPage,
  CommentDecided, CommentDecision, CommentingChange, CommentingTerm, CommentView, HeldComments,
  Ladder, LeaderboardSeries, ListedWord, MatchFrame, MeUpdated, ModelRivals, ModelSeason, ModelStory,
  MyMatchList, MyModelStory, NewComment, NotifyAudience, NotifyCount, NotifySend, NotifySendList,
  PickList, Podium, Post, PostedComment, ProfileComments, RelatedMatches, ReportReason, StoryAction,
  StoryKind, StoryList, Thread, ThreadLock, WatchEventBody, WatchEvents, WordList,
  Playing,
  Candidate,
  RoundBody, RoundEdit, SeasonFill, SeasonFleet, SeasonRounds,
  SeasonAdminList, SeasonImport, SeasonNotify, SeasonParticipantList, SeasonRunnerKeyList,
} from './types'
import { assertShape, LEADERBOARD_ENTRY, ME, SEASON, type Shape } from './shape'
import common from '../../copy/common.json'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string
  /** Soma's 409s carry the state that caused the refusal, so a page can say which. */
  readonly detail?: unknown
  /** The whole refusal body. Some refusals carry their facts beside `error` rather than in
   *  `detail`: 429 `too_fast` `{retry_after}`, 403 `commenting_off` `{until, reason}`, 422
   *  `bio_word_listed` `{word}`, 409 `word_listed` `{word}`. */
  readonly body?: unknown

  constructor(status: number, code: string, message: string, requestId?: string, detail?: unknown, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.detail = detail
    this.body = body
  }
}

// Two error shapes reach the browser. Orion's own failures are
// `{error: {code, message, request_id}}`; Soma's deliberate refusals are shaped by
// the workflow and are `{error: "not_a_participant", detail: {...}}`. Flattening
// the second is how a page ends up unable to say which of three refusals it hit.
type ErrorBody = {
  error?: string | { code?: string; message?: string; request_id?: string }
  detail?: unknown
}

/** `shape` is a DEV-LOOP TRIPWIRE and nothing else: see api/shape.ts. It is compiled out of a
 *  production bundle, so no page ever behaves differently for carrying one. */
async function request<T>(path: string, init?: RequestInit, shape?: [Shape, string?]): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: { accept: 'application/json', ...init?.headers },
    })
  } catch (cause) {
    // The network never answered — a different fact about the world from a 404.
    throw new ApiError(0, 'unreachable', common.errors.api.unreachable, undefined, cause)
  }

  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    // A body that is not JSON is a proxy or a gateway answering, not Soma.
    if (res.ok) throw new ApiError(res.status, 'unreadable', common.errors.api.notJson)
  }

  if (res.ok) {
    if (shape) assertShape(path, parsed, shape[0], shape[1])
    return parsed as T
  }

  const body = parsed as ErrorBody | null
  const e = body?.error
  if (typeof e === 'string') throw new ApiError(res.status, e, e.replace(/_/g, ' '), undefined, body?.detail, body)
  throw new ApiError(res.status, e?.code ?? 'unknown', e?.message ?? res.statusText, e?.request_id, body?.detail, body)
}

function query(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue
    q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

function send(method: string, body?: unknown): RequestInit {
  if (body === undefined) return { method }
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

type SeasonBody = {
  /** Create only: the name, from which Soma derives the slug. Neither can be changed afterwards. */
  name?: string
  submissions_open_at?: string
  submissions_close_at?: string
  /** Create only (N30). visibility is fixed at creation; private forces restricted. fleet is the
   *  policy for which runners play/admit it; admins are platform handles assigned at creation. */
  visibility?: 'public' | 'private'
  entry?: 'open' | 'restricted'
  fleet?: { matches: 'own' | 'platform' | 'both'; admissions: 'own' | 'platform' | 'both' }
  admins?: string[]
  rules?: Record<string, unknown>
  weight_classes?: SeasonWeightClass[]
}

const enc = encodeURIComponent

/**
 * THE MEMBER'S COPY OF A PUBLIC READ. Every read that can name a private season has a twin under
 * `/v1/private` -- the same path, the same statement, the same body -- which is signed in and
 * uncached, and answers a private season to its participants, its season admins and platform admins
 * (and anything else exactly as the public route does). The public routes never reveal a private
 * season at all. So a read takes `priv` only when the season it reads (or, for a read by id, any
 * season the viewer can see) is private: everything else stays on the cached public route.
 * `usePlatform().priv()` is the one place that decides.
 */
function reach(path: string, priv?: boolean): string {
  return priv ? `/v1/private${path.slice('/v1'.length)}` : path
}

export const api = {
  // public reads
  status: () => request<Status>('/v1/status'),
  games: () => request<GameSummary[]>('/v1/games'),
  game: (game: string) => request<Game>(`/v1/games/${enc(game)}`),
  /** Every season of the game, newest first. `priv` adds the private ones this viewer may see. */
  seasons: (game: string, priv?: boolean) =>
    request<Season[]>(reach(`/v1/games/${enc(game)}/seasons`, priv), undefined, [SEASON]),

  leaderboard: (
    game: string,
    { priv, ...opts }: { ladder?: string; season?: string | null; limit?: number; cursor?: string | null; priv?: boolean } = {},
  ) =>
    request<Leaderboard>(
      reach(`/v1/games/${enc(game)}/leaderboard${query({ ...opts, ladder: opts.ladder ?? 'open' })}`, priv),
      undefined,
      [LEADERBOARD_ENTRY, 'entries'],
    ),

  /** Public matches as cards. Each sort pages by its own cursor: pass `next_cursor` back with the
   *  SAME sort. `total` is counted on the first page only and stops at 10,000 (`total_capped`).
   *  400 `sort_invalid`, `vs_needs_model`. */
  matches: (f: MatchFilters = {}, priv?: boolean) =>
    request<MatchList>(reach(`/v1/matches${query({ ...f, top: f.top ? 'true' : null })}`, priv)),
  /** One match, whole, with a replay URL signed for an hour. A trial is readable only once its
   *  candidate is public. 404 `not_found` (no longer a 200 with a null body). */
  match: (id: string, priv?: boolean) => request<Match>(reach(`/v1/matches/${enc(id)}`, priv)),
  /** A card's resting picture: the last frame, which the browser draws. `frame` is null until the
   *  runner reported one; once it has, the answer is cached for good. 404 `not_found` for a match
   *  that is not public. */
  matchFrame: (id: string, priv?: boolean) => request<MatchFrame>(reach(`/v1/matches/${enc(id)}/frame`, priv)),
  /** Up to twelve cards for the rail beside a match. 404 `not_found` for a match that is not public. */
  relatedMatches: (id: string, priv?: boolean) =>
    request<RelatedMatches>(reach(`/v1/matches/${enc(id)}/related`, priv)),
  /** Count a visit, an open (with how the viewer got there) or a replay watched to its end. 204
   *  always; a private or unknown match writes nothing. `keepalive` lets it outlive a navigation.
   *  400 `event_invalid`, `via_invalid`, `match_invalid`. */
  recordEvent: (body: WatchEventBody) =>
    request<null>('/v1/events', { ...send('POST', body), keepalive: true }),

  /** Per version, its rating and rank at each of `points` edges (2..200, default 60) from `since`
   *  (default the season's open) to now, from the hourly snapshots. 404 `unknown_season`. */
  leaderboardSeries: (
    game: string,
    {
      priv,
      ...opts
    }: { ladder?: Ladder | null; since?: string | null; points?: number | null; season?: string | null; priv?: boolean } = {},
  ) => request<LeaderboardSeries>(reach(`/v1/games/${enc(game)}/leaderboard/series${query(opts)}`, priv)),
  /** Staff picks, in their order. 404 `unknown_game`. */
  picks: (game: string) => request<PickList>(`/v1/games/${enc(game)}/picks`),
  /** A season's frozen podium, per ladder; empty until it closes. 404 `unknown_season`. */
  podium: (game: string, season: string, priv?: boolean) =>
    request<Podium>(reach(`/v1/games/${enc(game)}/seasons/${enc(season)}/podium`, priv)),

  /** Matches on a board right now. Uncached on Soma's side, so read it only where it is drawn. */
  playing: (game: string, season: string, priv?: boolean) =>
    request<Playing>(reach(`/v1/games/${enc(game)}/seasons/${enc(season)}/playing`, priv)),

  /** One MODEL and its whole version history, addressed by its id -- the shape /v1/matches/{id}
   *  and /v1/versions/{id} already use. It used to be `{owner}/{repo}`, which was readable but
   *  needed a repository per entry; an entry is a name now, and a name is display, not an address. */
  model: (id: string, priv?: boolean) => request<ModelDetail>(reach(`/v1/models/${enc(id)}`, priv)),
  /** Record, last five, best win and worst loss on Open this season, and rank now against a week
   *  ago. 404 `unknown_model`. */
  modelSeason: (id: string) => request<ModelSeason>(`/v1/models/${enc(id)}/season`),
  /** Per opposing model this season, most losses first; `limit` 1..100, default 20.
   *  404 `unknown_model`. */
  modelRivals: (id: string, limit?: number | null) =>
    request<ModelRivals>(`/v1/models/${enc(id)}/rivals${query({ limit })}`),
  /** The approved story. 404 `no_story` while none is public — the ordinary answer for most
   *  models, not an error to show. */
  modelStory: (id: string) => request<ModelStory>(`/v1/models/${enc(id)}/story`),
  /** One VERSION, by id: the permalink every seat, ladder row and replay points at. Public once
   *  `active`, `disabled` or `superseded`; 404 `not_found` otherwise (the owner reads it through
   *  myVersion). */
  version: (id: string, priv?: boolean) => request<VersionDetail>(reach(`/v1/versions/${enc(id)}`, priv)),

  /** 404 `unknown_user`. */
  profile: (username: string) => request<Profile>(`/v1/profiles/${enc(username)}`),
  /** The author's live comments, newest first, twenty a page. 404 `unknown_user`. */
  profileComments: (username: string, cursor?: string | null) =>
    request<ProfileComments>(`/v1/profiles/${enc(username)}/comments${query({ cursor })}`),

  /** A host's thread: twenty top-level comments a page with their replies. Name exactly one of
   *  `match` and `model`. 400 `host_required`; 404 `unknown_host` (a match the viewer may not see
   *  too). `priv` reads a private season's match, among the people its season shows to. */
  thread: (host: { match: string } | { model: string }, cursor?: string | null, priv?: boolean) =>
    request<Thread>(reach(`/v1/threads${query({ ...host, cursor })}`, priv)),

  /** Published posts and featured model stories as cards, newest first; `limit` 1..60, default 20.
   *  400 `kind_invalid`. */
  stories: (opts: { kind?: StoryKind | null; cursor?: string | null; limit?: number | null } = {}) =>
    request<StoryList>(`/v1/stories${query(opts)}`),
  /** One published post. 404 `unknown_post`. */
  post: (slug: string) => request<Post>(`/v1/posts/${enc(slug)}`),
  /** Live announcements, newest first. */
  announcements: () => request<AnnouncementList>('/v1/announcements'),

  /** A season's boards, public from the moment each is uploaded, disabled ones included.
   *  `boards` carries each board itself, for a page that draws them. */
  seasonMaps: (game: string, season: string, opts: { enabled?: boolean; boards?: boolean; priv?: boolean } = {}) =>
    request<SeasonMapList>(
      reach(
        `/v1/games/${enc(game)}/seasons/${enc(season)}/maps${query({
          enabled: opts.enabled ? 'true' : null,
          boards: opts.boards ? 'true' : null,
        })}`,
        opts.priv,
      ),
    ),
  /** One board, whole, and every time it was enabled or disabled. */
  seasonMap: (game: string, season: string, mapId: string, priv?: boolean) =>
    request<SeasonMapDetail>(reach(`/v1/games/${enc(game)}/seasons/${enc(season)}/maps/${enc(mapId)}`, priv)),

  // session reads
  /** 200 when the session cookie is good, 401 when it is absent, expired or revoked. */
  me: () => request<Me>('/v1/me', undefined, [ME]),
  /** The caller's versions still being admitted or on trial. Their own route: Soma serves /v1/me
   *  from a cached session entry, and these move with every admit tick. */
  candidates: () => request<Candidate[]>('/v1/me/candidates'),
  /** The caller's own models, each carrying its versions, rejected ones included; `game` narrows it
   *  to one game. Private rows get their own path, never a `mine` flag on a public route -- and
   *  Soma has no `GET /v1/games/{game}/models` list at all. */
  myModels: (game?: string | null) => request<MyModel[]>(`/v1/models${query({ game })}`),
  /** The caller's matches in every state — queued, cancelled and failed included — as cards with
   *  `mine` on each seat. `limit` defaults to 25. */
  myMatches: (opts: { game?: string | null; cursor?: string | null; limit?: number } = {}) =>
    request<MyMatchList>(`/v1/me/matches${query(opts)}`),
  /** One match the caller has a seat in, in any status: a trial in progress, or a rejected
   *  candidate's. 404 `not_found`. */
  myMatch: (id: string) => request<Match>(`/v1/me/matches/${enc(id)}`),
  /** One of the caller's versions in any status (an admin's for a baseline too). 404 `not_found`. */
  myVersion: (id: string) => request<VersionDetail>(`/v1/me/versions/${enc(id)}`),
  /** The writer's view of a story: the approved text and any held edit. 404 `unknown_model` for a
   *  model the caller may not write. */
  myModelStory: (id: string) => request<MyModelStory>(`/v1/me/models/${enc(id)}/story`),
  /** Your held comments on one host, to draw in place for you alone. */
  myHeldComments: (host: { match: string } | { model: string }) =>
    request<HeldComments>(`/v1/me/comments${query(host)}`),
  sessions: () => request<SessionRow[]>('/v1/sessions'),
  /** Per MODEL now: the quota state and the refusal, so /submit explains itself before the POST
   *  rather than after it. Called with no model to list what the caller could submit to. */
  submissionPreflight: (game: string, model?: string | null, season?: string | null) =>
    request<Preflight>(`/v1/games/${enc(game)}/submission${query({ model, season })}`),

  // session writes
  /** A field left out is left alone; null or blank clears it. A bare string is the display name,
   *  as the account page has always called it. 400 `display_name_too_long` (60),
   *  `bio_too_long` (160); 422 `bio_word_listed` (the word is `body.word`). */
  updateMe: (body: { display_name?: string | null; bio?: string | null } | string | null) =>
    request<MeUpdated>(
      '/v1/me',
      send('PATCH', typeof body === 'object' && body !== null ? body : { display_name: body }),
    ),

  /** A version's one-line note (≤ 120); blank clears it. The owner, or an admin for a baseline's.
   *  400 `note_too_long`; 404 `unknown_version`; 422 `note_word_listed`. */
  updateVersionNote: (id: string, note: string | null) =>
    request<VersionDetail>(`/v1/versions/${enc(id)}`, send('PATCH', { note })),

  /** Replace a model's story. A text that trips the word list is HELD — `pending` carries it and
   *  the public keeps the old text — rather than refused. 400 `story_invalid` (a one-line title
   *  1–80, text 1–20,000); 404 `unknown_model`. */
  putModelStory: (id: string, body: { title: string; body: string }) =>
    request<MyModelStory>(`/v1/models/${enc(id)}/story`, send('PUT', body)),

  /** 201. `state` is `held` on a listed word or a link: show it to its author as held.
   *  400 `host_required`, `body_invalid` (one line, 1–500); 401 `session_revoked`;
   *  403 `commenting_off` (`body.until`, `body.reason`); 404 `unknown_host`, `unknown_parent`;
   *  409 `thread_locked`, `comment_refused` (a race); 429 `too_fast` (15 s) or `daily_limit` (100
   *  a day), with `body.retry_after` in seconds. */
  postComment: (body: NewComment) =>
    request<PostedComment>('/v1/threads/comments', send('POST', body)),
  /** Your own comment becomes `deleted` (a placeholder while replies hang beneath it). 204.
   *  401 `session_revoked`; 404 `unknown_comment`. */
  deleteComment: (id: string) => request<null>(`/v1/comments/${enc(id)}`, send('DELETE')),
  /** One report per reader per comment; a second is accepted and changes nothing. 201.
   *  400 `reason_invalid`, `words_too_long` (200); 401 `session_revoked`; 404 `unknown_comment`
   *  (not live); 409 `own_comment`. */
  reportComment: (id: string, body: { reason?: ReportReason | null; words?: string | null } = {}) =>
    request<{ reported: true; comment_id: string }>(`/v1/comments/${enc(id)}/reports`, send('POST', body)),

  /** `model` is the id of the entry this version belongs to; an unknown one is `unknown_model`
   *  and never an implicit create. POSTing the SAME two hashes again answers 200 with the same
   *  version and fresh upload URLs, good for what is left of its thirty-minute upload window,
   *  which is how a competitor recovers a failed PUT; past that window, and for a different hash
   *  while one is in flight, it is 409 `version_in_flight`. */
  submit: (body: {
    game: string
    model: string
    weights_hash: string
    manifest_hash: string
    /** The season's slug. Left out means the game's featured season (S3); web always sends the
     *  season it is showing, so a submission lands in the season the competitor is looking at --
     *  and never sends null for a season it cannot see, which would enter the featured one. */
    season: string
    /** The version's one-line note, ≤ 120. 400 `note_too_long`; 422 `note_word_listed`. */
    note?: string | null
  }) => request<SubmissionResult>('/v1/submissions', send('POST', body)),

  /** THE ONE-CLICK RE-ENTRY: your entry `model` enters `season` with the version it stands with in
   *  `from` -- the same weights and manifest, over bytes already in the bucket, so nothing uploads.
   *  From there it is an ordinary submission: 201 with a `testing` version, 200 when it is already
   *  in flight, and a submission's own refusals; 404 `nothing_to_reenter`, 400 `reenter_invalid`. */
  reenter: (body: { game: string; model: string; season: string; from: string }) =>
    request<SubmissionResult>('/v1/submissions/reenter', send('POST', body)),

  /** An entry is a name, unique among your own for this game. Nothing else is declared. */
  createModel: (game: string, body: { name: string }) =>
    request<ModelDetail>(`/v1/games/${enc(game)}/models`, send('POST', body)),

  /** Rename or retire. The id is the key and never moves, which is what makes the name safe to
   *  edit -- when the repository was the key it had to be immutable, because a model that could
   *  move would be a different entry wearing this one's ratings and its whole match history. */
  updateModel: (id: string, body: { name?: string; retired?: boolean }) =>
    request<ModelDetail>(`/v1/models/${enc(id)}`, send('PATCH', body)),

  /** `others` revokes every session but the current one. */
  revokeSession: (sid: string) => request<null>(`/v1/sessions/${enc(sid)}`, send('DELETE')),
  signOut: () => request<{ ok: true }>('/v1/session', send('DELETE')),

  // admin
  createSeason: (game: string, body: SeasonBody) =>
    request<Season>(`/v1/games/${enc(game)}/seasons`, send('POST', body)),

  /** Dates, rules and caps, before the season opens. Its name and slug are never editable. */
  updateSeason: (game: string, season: string, body: SeasonBody) =>
    request<Season>(`/v1/games/${enc(game)}/seasons/${enc(season)}`, send('PATCH', body)),

  /** Queued, not immediate: Soma's withdraw clock settles the ratings and freezes the standings.
   *  Named by slug, so a close ends the season the admin was looking at and no other. The season's
   *  own admins may ask too. 202; 409 `season_not_live`. */
  closeSeason: (game: string, season: string) =>
    request<Season>(`/v1/games/${enc(game)}/seasons/${enc(season)}/close`, send('POST')),

  /** A season's rounds, finals and idle fill: every round, the finals' progress, each version's
   *  games in the current round, and the capacity to choose numbers against. Platform admin. */
  seasonRounds: (game: string, season: string) =>
    request<SeasonRounds>(`/v1/games/${enc(game)}/seasons/${enc(season)}/rounds`),

  /** Schedule a score reset, or -- once the window has closed and nothing is being admitted -- the
   *  finals. One round waits at a time. Answers the rounds document. */
  addSeasonRound: (game: string, season: string, body: RoundBody) =>
    request<SeasonRounds>(`/v1/games/${enc(game)}/seasons/${enc(season)}/rounds`, send('POST', body)),

  /** Move, re-number or cancel a waiting round; a started one takes `games` alone. */
  updateSeasonRound: (game: string, season: string, n: number, body: RoundEdit) =>
    request<SeasonRounds>(`/v1/games/${enc(game)}/seasons/${enc(season)}/rounds/${n}`, send('PATCH', body)),

  /** The fleet policy, any time the season is live: which runners play and admit it. */
  setSeasonFleet: (game: string, season: string, fleet: SeasonFleet) =>
    request<Season>(`/v1/games/${enc(game)}/seasons/${enc(season)}/fleet`, send('PATCH', { fleet })),

  /** The idle fill, any time the season is live: capacity, not a rule. */
  setSeasonFill: (game: string, season: string, fill: SeasonFill) =>
    request<SeasonRounds>(`/v1/games/${enc(game)}/seasons/${enc(season)}/fill`, send('PATCH', { fill })),

  /** Upload one map file, exactly as mapgen wrote it. It is stored DISABLED: nothing is paired on
   *  it until an admin enables it. The engine itself judges it on the way in. */
  addSeasonMap: (game: string, season: string, board: unknown) =>
    request<SeasonMap>(`/v1/games/${enc(game)}/seasons/${enc(season)}/maps`, send('POST', board)),

  /** Put a board in play or take it out. Disabling cancels the matches queued on it; the ones
   *  already running finish and count. There is no delete. */
  setSeasonMap: (game: string, season: string, mapId: string, enabled: boolean) =>
    request<SeasonMap>(
      `/v1/games/${enc(game)}/seasons/${enc(season)}/maps/${enc(mapId)}`,
      send('PATCH', { enabled }),
    ),

  /** A season's baselines, every upload with where it stands. Admin only: an upload still
   *  being admitted, or refused, is nobody else's business. */
  seasonBaselines: (game: string, season: string) =>
    request<SeasonBaselineList>(`/v1/games/${enc(game)}/seasons/${enc(season)}/baselines`),

  /** Record a baseline by its name and the two hashes, as a submission is recorded, and get two
   *  one-shot PUTs for its files. Admission then admits it like any submission and lands it
   *  DISABLED. The same name and hashes again, inside its thirty-minute upload
   *  window, re-mint the URLs for what is left of it. */
  addSeasonBaseline: (
    game: string,
    season: string,
    body: { name: string; weights_hash: string; manifest_hash: string },
  ) =>
    request<SeasonBaselineUpload>(
      `/v1/games/${enc(game)}/seasons/${enc(season)}/baselines`,
      send('POST', body),
    ),

  /** Put an admitted baseline in play or take it out. Disabling cancels the matches queued against
   *  it; the ones already running finish and count. There is no delete. */
  setSeasonBaseline: (game: string, season: string, slug: string, enabled: boolean) =>
    request<SeasonBaseline>(
      `/v1/games/${enc(game)}/seasons/${enc(season)}/baselines/${enc(slug)}`,
      send('PATCH', { enabled }),
    ),

  // a season's admin desk: its admins and platform admins (season-admin-only). 401 a dead session,
  // 404 `unknown_season` (a private one the caller may not see too), 403 `season_admin_only`; a write
  // after the close is 409 `season_closed`.
  seasonParticipants: (game: string, season: string) =>
    request<SeasonParticipantList>(`/v1/games/${enc(game)}/seasons/${enc(season)}/participants`),
  /** Bulk add: `logins` one per line or comma-separated, under `provider` (github when left out). A
   *  login already listed is left as it is. 201 with the roster. 400 `logins_required`. */
  addSeasonParticipants: (game: string, season: string, body: { provider?: string | null; logins: string }) =>
    request<SeasonParticipantList>(`/v1/games/${enc(game)}/seasons/${enc(season)}/participants`, send('POST', body)),
  /** A soft remove, by row id. 404 `unknown_participant`. */
  removeSeasonParticipant: (game: string, season: string, id: string) =>
    request<SeasonParticipantList>(`/v1/games/${enc(game)}/seasons/${enc(season)}/participants`, send('DELETE', { id })),
  seasonAdmins: (game: string, season: string) =>
    request<SeasonAdminList>(`/v1/games/${enc(game)}/seasons/${enc(season)}/admins`),
  /** Platform admin only. 201 (200 when already one). 404 `unknown_handle`; 422 `baseline_cannot_admin`. */
  addSeasonAdmin: (game: string, season: string, handle: string) =>
    request<SeasonAdminList>(`/v1/games/${enc(game)}/seasons/${enc(season)}/admins`, send('POST', { handle })),
  /** Platform admin only. 404 `unknown_season_admin`. */
  removeSeasonAdmin: (game: string, season: string, handle: string) =>
    request<SeasonAdminList>(`/v1/games/${enc(game)}/seasons/${enc(season)}/admins`, send('DELETE', { handle })),
  seasonRunnerKeys: (game: string, season: string) =>
    request<SeasonRunnerKeyList>(`/v1/games/${enc(game)}/seasons/${enc(season)}/runner-keys`),
  /** A key bound to this season for good, returned once. 400 `label_required`. */
  createSeasonRunnerKey: (game: string, season: string, label: string) =>
    request<MintedRunnerKey>(`/v1/games/${enc(game)}/seasons/${enc(season)}/runner-keys`, send('POST', { label })),
  /** Any key of this season, whoever minted it. Answers the season's keys. 404 `unknown_key`. */
  revokeSeasonRunnerKey: (game: string, season: string, key: string) =>
    request<SeasonRunnerKeyList>(`/v1/games/${enc(game)}/seasons/${enc(season)}/runner-keys/${enc(key)}`, send('DELETE')),
  /** One runner of this season's keys. Answers the season's keys. 404 `unknown_runner`. */
  revokeSeasonRunner: (game: string, season: string, runner: string) =>
    request<SeasonRunnerKeyList>(`/v1/games/${enc(game)}/seasons/${enc(season)}/runners/${enc(runner)}`, send('DELETE')),
  /** The season's own audit log, newest first, fifty a page; `action` narrows by prefix. */
  seasonAudit: (game: string, season: string, opts: { action?: string | null; cursor?: string | null } = {}) =>
    request<AuditPage>(`/v1/games/${enc(game)}/seasons/${enc(season)}/audit${query(opts)}`),
  seasonNotify: (game: string, season: string) =>
    request<SeasonNotify>(`/v1/games/${enc(game)}/seasons/${enc(season)}/notify`),
  /** A `broadcast` to the season's people. 201 with the sends. 400 `notify_invalid`; 422 `no_recipients`. */
  sendSeasonNotify: (game: string, season: string, body: { subject: string; link?: string | null }) =>
    request<SeasonNotify>(`/v1/games/${enc(game)}/seasons/${enc(season)}/notify`, send('POST', body)),
  /** Copy another season's boards in, switched off; `maps` narrows it. 404 `unknown_source`. */
  importSeasonMaps: (game: string, season: string, body: { from: string; maps?: string[] }) =>
    request<SeasonImport>(`/v1/games/${enc(game)}/seasons/${enc(season)}/maps/import`, send('POST', body)),
  /** Re-admit another season's baselines here over the same bytes; `baselines` narrows it by slug.
   *  404 `unknown_source`. */
  importSeasonBaselines: (game: string, season: string, body: { from: string; baselines?: string[] }) =>
    request<SeasonImport>(`/v1/games/${enc(game)}/seasons/${enc(season)}/baselines/import`, send('POST', body)),
  /** Platform admin only: the season the game shows by default. 422 `season_not_public`. */
  featureSeason: (game: string, season: string) =>
    request<Season>(`/v1/games/${enc(game)}/seasons/${enc(season)}/featured`, send('POST')),
  /** Platform admin only: narrow a SCHEDULED season's entry to its participants. One way and once
   *  — entry never widens and visibility never changes, so this is the only edit either takes
   *  after creation. 409 `season_not_scheduled` / `entry_already_restricted` / `season_closed`. */
  restrictSeasonEntry: (game: string, season: string) =>
    request<Season>(`/v1/games/${enc(game)}/seasons/${enc(season)}/entry`, send('PATCH', { entry: 'restricted' })),

  // admin · runners
  //
  // Every machine playing this ladder, whether it is in the deployment or on somebody's
  // desk, the platform's and every season's. `runners` is the fleet; `runnerKeys` is what lets a
  // machine into it -- every admin's and season admin's keys, any of which the platform may revoke.
  runners: () => request<Runner[]>('/v1/runners'),
  runnerKeys: () => request<RunnerKey[]>('/v1/runner-keys'),

  /** The ONLY call that ever returns key material, and it returns it once: the row stores a
   *  sha256 and an eight-character display prefix. Losing it costs a revoke and another mint,
   *  which is free — the table holds as many as you like. */
  createRunnerKey: (body: { label?: string }) =>
    request<MintedRunnerKey>('/v1/runner-keys', send('POST', body)),

  /** Stops EVERY machine on this key at its next token exchange, within ten minutes. */
  revokeRunnerKey: (id: string) => request<null>(`/v1/runner-keys/${enc(id)}`, send('DELETE')),

  /** Stops ONE machine and leaves the key working for the others on it. An in-flight match is
   *  not cancelled: the row's lease lapses and the reap clock frees it. */
  revokeRunner: (id: string) => request<null>(`/v1/runners/${enc(id)}`, send('DELETE')),

  // admin · users
  //
  // Every admin, and the competitors matching `q`. Soma refuses a change to the caller's own role,
  // so an admin is always made and unmade by another one.
  adminUsers: (q?: string) =>
    request<AdminUserList>(`/v1/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  /** 200 `changed: false` when the role already stood. 400 `role_invalid`; 404 `unknown_user`;
   *  409 `not_yourself`, `not_a_person`, `role_not_changed` (a race). */
  setUserRole: (id: string, role: UserRole) =>
    request<RoleChange>(`/v1/admin/users/${enc(id)}`, send('PATCH', { role })),
  /** One user's desk, by id or handle. 404 `unknown_user`. */
  adminUser: (idOrHandle: string) => request<AdminUserDesk>(`/v1/admin/users/${enc(idOrHandle)}`),
  /** Switch commenting off for a term with a reason (≤ 300), or on with `null`. By id only.
   *  400 `body_invalid`; 404 `unknown_user`; 409 `not_a_person`. */
  setUserCommenting: (id: string, body: { off: CommentingTerm; reason: string } | { off: null }) =>
    request<CommentingChange>(`/v1/admin/users/${enc(id)}/commenting`, send('PATCH', body)),

  // admin · audit and events
  /** Newest first, fifty a page. `admin` is a handle, `action` a prefix (`comment.`), `q` searches
   *  the target and the reason. */
  adminAudit: (
    opts: { admin?: string | null; action?: string | null; q?: string | null; cursor?: string | null } = {},
  ) => request<AuditPage>(`/v1/admin/audit${query(opts)}`),
  /** Per day since `since` (a date, default thirty days back): visits, opens by way, finishes. */
  adminEvents: (since?: string | null) => request<WatchEvents>(`/v1/admin/events${query({ since })}`),

  // admin · comments, threads, the word list
  /** Fifty a page. `q` is `@handle` or text. 400 `view_invalid`. */
  adminComments: (opts: { view?: CommentView | null; q?: string | null; cursor?: string | null } = {}) =>
    request<AdminCommentPage>(`/v1/admin/comments${query(opts)}`),
  /** Up to 100 ids; an id in the wrong state for the action is left as it is. Each decision is an
   *  audit line. 400 `action_invalid`, `ids_invalid`, `reason_too_long` (300). */
  decideComments: (body: { ids: string[]; action: CommentDecision; reason?: string | null }) =>
    request<CommentDecided>('/v1/admin/comments/decide', send('POST', body)),
  /** Lock or unlock a thread, named by its id or its host; a host with no thread gets one.
   *  400 `host_required`, `locked_required`, `reason_too_long`; 404 `unknown_thread`. */
  lockThread: (
    body: ({ thread: string } | { match: string } | { model: string }) & { locked: boolean; reason?: string | null },
  ) => request<ThreadLock>('/v1/admin/threads', send('PATCH', body)),
  adminWords: () => request<WordList>('/v1/admin/words'),
  /** 201. 400 `word_invalid` (letters and digits, single spaces, hyphens or apostrophes, ≤ 40);
   *  409 `word_listed` (the listed word is `body.word`). */
  addWord: (word: string) => request<ListedWord>('/v1/admin/words', send('POST', { word })),
  /** 204. 404 `unknown_word`. */
  removeWord: (id: string) => request<null>(`/v1/admin/words/${enc(id)}`, send('DELETE')),

  // admin · posts, stories, announcements
  adminPosts: () => request<AdminPostList>('/v1/admin/posts'),
  /** Starts a draft. 201. 400 `post_invalid` (slug a-z0-9 words joined by hyphens ≤ 80, title
   *  1–120, body ≤ 100,000); 409 `slug_taken`. */
  createPost: (body: { slug: string; title: string; body?: string }) =>
    request<AdminPost>('/v1/admin/posts', send('POST', body)),
  /** 404 `unknown_post`. */
  adminPost: (id: string) => request<AdminPost>(`/v1/admin/posts/${enc(id)}`),
  /** Saves, publishes (`published: true`) or unpublishes. 400 `post_invalid`, `published_invalid`;
   *  404 `unknown_post`; 409 `slug_taken`. */
  updatePost: (id: string, body: { slug?: string; title?: string; body?: string; published?: boolean }) =>
    request<AdminPost>(`/v1/admin/posts/${enc(id)}`, send('PATCH', body)),
  /** Every story, newest edit first, a held edit whole. */
  adminStories: () => request<AdminStoryList>('/v1/admin/stories'),
  /** 400 `action_invalid`, `reason_too_long`; 404 `unknown_story`; 409 `story_state` (the story as
   *  it stands is `detail`). */
  updateStory: (modelId: string, body: { action: StoryAction; reason?: string | null }) =>
    request<AdminStory>(`/v1/admin/stories/${enc(modelId)}`, send('PATCH', body)),
  adminAnnouncements: () => request<AdminAnnouncementList>('/v1/admin/announcements'),
  /** Publishes at once. 201. 400 `kind_invalid`, `announcement_invalid` (body one line 1–200; link
   *  a site path or an https:// URL; ends_at ahead of now). */
  createAnnouncement: (body: {
    kind: AnnouncementKind
    body: string
    link?: string | null
    dismissable?: boolean
    ends_at?: string | null
  }) => request<AdminAnnouncement>('/v1/admin/announcements', send('POST', body)),
  /** Takes it down; there is no edit. 400 `disabled_required`; 404 `unknown_announcement`. */
  disableAnnouncement: (id: string) =>
    request<AdminAnnouncement>(`/v1/admin/announcements/${enc(id)}`, send('PATCH', { disabled: true })),

  // admin · Notify
  /** Who a send would reach, before sending. 400 `audience_invalid`. */
  notifyCount: (audience: NotifyAudience) =>
    request<NotifyCount>('/v1/admin/notify/count', send('POST', { audience })),
  /** The sent log, newest first, with how many have read each. */
  notifySends: () => request<NotifySendList>('/v1/admin/notify'),
  /** Sends now: one `broadcast` notification each. 201. 400 `audience_invalid`, `notify_invalid`
   *  (subject 1–200; link a site path); 422 `no_recipients`. */
  sendNotify: (body: { subject: string; link?: string | null; audience: NotifyAudience }) =>
    request<NotifySend>('/v1/admin/notify', send('POST', body)),

  // admin · picks
  /** Live picks across every game, in order. */
  adminPicks: () => request<AdminPickList>('/v1/admin/picks'),
  /** Pins a match at the end. 201, the whole list. 404 `unknown_match`; 409 `already_pinned`;
   *  422 `match_not_public`. */
  pinPick: (matchId: string) => request<AdminPickList>('/v1/admin/picks', send('POST', { match_id: matchId })),
  /** `ids` is every live pick id in the new order. 409 `order_incomplete`. */
  reorderPicks: (ids: string[]) => request<AdminPickList>('/v1/admin/picks', send('PATCH', { ids })),
  /** 404 `unknown_pick`. */
  unpinPick: (id: string) =>
    request<{ unpinned: string } & AdminPickList>(`/v1/admin/picks/${enc(id)}`, send('DELETE')),

  /** The caller's feed, newest first. `since` is what the bell polls with. */
  notifications: (
    opts: {
      category?: NotificationCategory | null
      unread?: boolean
      since?: string | null
      cursor?: string | null
      limit?: number
    } = {},
  ) =>
    request<NotificationPage>(
      `/v1/me/notifications${query({ ...opts, unread: opts.unread ? 'true' : null })}`,
    ),
  markNotificationsRead: (body: { ids: string[] } | { all: true; category?: NotificationCategory }) =>
    request<{ unread: number }>('/v1/me/notifications/read', send('POST', body)),
  notificationSettings: () =>
    request<{ settings: NotificationSetting[] }>('/v1/me/notification-settings'),
  updateNotificationSetting: (body: {
    category: NotificationCategory
    app?: boolean
    push?: boolean
    level?: NotificationLevel
  }) => request<{ settings: NotificationSetting[] }>('/v1/me/notification-settings', send('PATCH', body)),
}

/** One sign-in provider the deployment serves, from `GET /v1/auth-providers`. */
export type AuthProvider = { slug: string; label: string }

/** The providers the sign-in page offers. Public, so no session is needed. */
export function authProviders(): Promise<AuthProvider[]> {
  return request<AuthProvider[]>('/v1/auth-providers')
}

/**
 * Full-page navigation, not fetch. Orion's oauth2_login answers 302 to the provider
 * with a PKCE challenge and sets the oauth-state cookie; following it in JS would
 * neither store that cookie nor leave the address bar somewhere the provider can return to.
 *
 * With a `slug`, it begins that provider's grant directly (`/v1/auth/{slug}`). Without one,
 * it goes to the `/signin` chooser, which draws a button per provider and, when there is only
 * one, passes straight through to it.
 */
export function startSignIn(slug?: string): void {
  window.location.href = slug ? `/v1/auth/${slug}` : '/signin'
}
