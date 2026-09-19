// Typed client for Soma's /v1 surface.
//
// Every call is same-origin and relies on the session cookie, which is HttpOnly:
// "are we signed in?" is answered by calling /v1/me and reading 200 against 401.

import type {
  AdminUserList, Game, GameSummary, Leaderboard, Match, MatchFilters, MatchList, Me, ModelDetail,
  MintedRunnerKey, Preflight, Profile, Runner, RunnerKey, Season, SeasonMap, SeasonMapDetail,
  SeasonMapList, SeasonWeightClass, SessionRow, SeasonBaseline, SeasonBaselineList, SeasonBaselineUpload,
  Status, SubmissionResult, MyModel, VersionDetail, NotificationCategory, NotificationPage,
  NotificationSetting, RoleChange, UserRole,
} from './types'
import { assertShape, LEADERBOARD_ENTRY, ME, SEASON, type Shape } from './shape'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string
  /** Soma's 409s carry the state that caused the refusal, so a page can say which. */
  readonly detail?: unknown

  constructor(status: number, code: string, message: string, requestId?: string, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.detail = detail
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
    throw new ApiError(0, 'unreachable', 'The API could not be reached.', undefined, cause)
  }

  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    // A body that is not JSON is a proxy or a gateway answering, not Soma.
    if (res.ok) throw new ApiError(res.status, 'unreadable', 'The API answered with something that is not JSON.')
  }

  if (res.ok) {
    if (shape) assertShape(path, parsed, shape[0], shape[1])
    return parsed as T
  }

  const body = parsed as ErrorBody | null
  const e = body?.error
  if (typeof e === 'string') throw new ApiError(res.status, e, e.replace(/_/g, ' '), undefined, body?.detail)
  throw new ApiError(res.status, e?.code ?? 'unknown', e?.message ?? res.statusText, e?.request_id, body?.detail)
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
  rules?: Record<string, unknown>
  weight_classes?: SeasonWeightClass[]
}

const enc = encodeURIComponent

export const api = {
  // public reads
  status: () => request<Status>('/v1/status'),
  games: () => request<GameSummary[]>('/v1/games'),
  game: (game: string) => request<Game>(`/v1/games/${enc(game)}`),
  seasons: (game: string) => request<Season[]>(`/v1/games/${enc(game)}/seasons`, undefined, [SEASON]),

  leaderboard: (
    game: string,
    opts: { ladder?: string; season?: string | null; limit?: number; cursor?: string | null } = {},
  ) =>
    request<Leaderboard>(
      `/v1/games/${enc(game)}/leaderboard${query({ ...opts, ladder: opts.ladder ?? 'open' })}`,
      undefined,
      [LEADERBOARD_ENTRY, 'entries'],
    ),

  matches: (f: MatchFilters = {}) => request<MatchList>(`/v1/matches${query(f)}`),
  match: (id: string) => request<Match>(`/v1/matches/${enc(id)}`),

  /** One MODEL and its whole version history, addressed by its id -- the shape /v1/matches/{id}
   *  and /v1/versions/{id} already use. It used to be `{owner}/{repo}`, which was readable but
   *  needed a repository per entry; an entry is a name now, and a name is display, not an address. */
  model: (id: string) => request<ModelDetail>(`/v1/models/${enc(id)}`),
  /** One VERSION, by id: the permalink every seat, ladder row and replay points at. */
  version: (id: string) => request<VersionDetail>(`/v1/versions/${enc(id)}`),

  profile: (username: string) => request<Profile>(`/v1/profiles/${enc(username)}`),

  /** A season's boards, public from the moment each is uploaded, disabled ones included.
   *  `boards` carries each board itself, for a page that draws them. */
  seasonMaps: (game: string, season: string, opts: { enabled?: boolean; boards?: boolean } = {}) =>
    request<SeasonMapList>(
      `/v1/games/${enc(game)}/seasons/${enc(season)}/maps${query({
        enabled: opts.enabled ? 'true' : null,
        boards: opts.boards ? 'true' : null,
      })}`,
    ),
  /** One board, whole, and every time it was enabled or disabled. */
  seasonMap: (game: string, season: string, mapId: string) =>
    request<SeasonMapDetail>(`/v1/games/${enc(game)}/seasons/${enc(season)}/maps/${enc(mapId)}`),

  // session reads
  /** 200 when the session cookie is good, 401 when it is absent, expired or revoked. */
  me: () => request<Me>('/v1/me', undefined, [ME]),
  /** The caller's own models, each carrying its versions, rejected ones included; `game` narrows it
   *  to one game. Private rows get their own path, never a `mine` flag on a public route -- and
   *  Soma has no `GET /v1/games/{game}/models` list at all. */
  myModels: (game?: string | null) => request<MyModel[]>(`/v1/models${query({ game })}`),
  /** The caller's matches in every state — queued, cancelled and failed included. */
  myMatches: (opts: { game?: string | null; cursor?: string | null; limit?: number } = {}) =>
    request<MatchList>(`/v1/me/matches${query(opts)}`),
  sessions: () => request<SessionRow[]>('/v1/sessions'),
  /** Per MODEL now: the quota state and the refusal, so /submit explains itself before the POST
   *  rather than after it. Called with no model to list what the caller could submit to. */
  submissionPreflight: (game: string, model?: string | null) =>
    request<Preflight>(`/v1/games/${enc(game)}/submission${query({ model })}`),

  // session writes
  updateMe: (display_name: string | null) =>
    request<Omit<Me, 'candidates'>>('/v1/me', send('PATCH', { display_name })),

  /** `model` is the id of the entry this version belongs to; an unknown one is `unknown_model`
   *  and never an implicit create. POSTing the SAME two hashes again answers 200 with the same
   *  version and fresh upload URLs, which is how a competitor recovers expired presigns; a
   *  different hash while one is in flight is 409 `version_in_flight`. */
  submit: (body: {
    game: string
    model: string
    weights_hash: string
    manifest_hash: string
  }) => request<SubmissionResult>('/v1/submissions', send('POST', body)),

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
   *  Named by slug, so a close ends the season the admin was looking at and no other. */
  closeSeason: (game: string, season: string) =>
    request<Season>(`/v1/games/${enc(game)}/seasons/${enc(season)}/close`, send('POST')),

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
   *  DISABLED. The same name and hashes again, while it is still being admitted, re-mint the URLs. */
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

  // admin · runners
  //
  // Every machine playing this ladder, whether it is in the deployment or on somebody's
  // desk. `runners` is the fleet; `runnerKeys` is what lets a machine into it.
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
  setUserRole: (id: string, role: UserRole) =>
    request<RoleChange>(`/v1/admin/users/${enc(id)}`, send('PATCH', { role })),

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
    level?: 'all' | 'notable' | 'off'
  }) => request<{ settings: NotificationSetting[] }>('/v1/me/notification-settings', send('PATCH', body)),
}

/**
 * Full-page navigation, not fetch. Orion's OAuth2 channel answers 302 to github.com
 * with a PKCE challenge and sets the oauth-state cookie; following it in JS would
 * neither store that cookie nor leave the address bar somewhere GitHub can return to.
 */
export function startGitHubSignIn(): void {
  window.location.href = '/v1/auth/github'
}
