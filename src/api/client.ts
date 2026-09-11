// Typed client for Soma's /v1 surface.
//
// Every call is same-origin and relies on the session cookie, which is HttpOnly:
// "are we signed in?" is answered by calling /v1/me and reading 200 against 401.

import type {
  Game, GameSummary, Leaderboard, Match, MatchFilters, MatchList, Me, ModelDetail,
  Preflight, Profile, Season, SeasonWeightClass, SessionRow, Status, SubmissionResult, MyModel,
  VersionDetail,
} from './types'

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

  if (res.ok) return parsed as T

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
  seasons: (game: string) => request<Season[]>(`/v1/games/${enc(game)}/seasons`),

  leaderboard: (
    game: string,
    opts: { ladder?: string; season?: number | string | null; limit?: number; cursor?: string | null } = {},
  ) =>
    request<Leaderboard>(
      `/v1/games/${enc(game)}/leaderboard${query({ ...opts, ladder: opts.ladder ?? 'open' })}`,
    ),

  matches: (f: MatchFilters = {}) => request<MatchList>(`/v1/matches${query(f)}`),
  match: (id: string) => request<Match>(`/v1/matches/${enc(id)}`),

  /** One MODEL and its whole version history, addressed by the repository it is published from --
   *  which is the entry's key, so the URL is constructible from a GitHub link and readable in a
   *  way a uuid never was. */
  model: (game: string, owner: string, repo: string) =>
    request<ModelDetail>(`/v1/games/${enc(game)}/models/${enc(owner)}/${enc(repo)}`),
  /** One VERSION, by id: the permalink every seat, ladder row and replay points at. */
  version: (id: string) => request<VersionDetail>(`/v1/versions/${enc(id)}`),

  profile: (username: string) => request<Profile>(`/v1/profiles/${enc(username)}`),

  // session reads
  /** 200 when the session cookie is good, 401 when it is absent, expired or revoked. */
  me: () => request<Me>('/v1/me'),
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

  /** `model` is the entry this release belongs to -- its id, or its repository path. A repository
   *  with no model behind it is `unknown_model` and never an implicit create: a typo in a repo path
   *  would otherwise quietly start a second lineage with its own version numbers. */
  submit: (body: {
    game: string
    model: string
    release_tag: string
    weights_hash: string
    adapter_hash: string
  }) => request<SubmissionResult>('/v1/submissions', send('POST', body)),

  createModel: (game: string, body: { name: string; url: string }) =>
    request<ModelDetail>(`/v1/games/${enc(game)}/models`, send('POST', body)),

  /** Rename or retire. The repository is the key and cannot move: a model that could would be a
   *  different entry wearing this one's ratings and its whole match history. */
  updateModel: (
    game: string,
    owner: string,
    repo: string,
    body: { name?: string; retired?: boolean },
  ) =>
    request<ModelDetail>(`/v1/games/${enc(game)}/models/${enc(owner)}/${enc(repo)}`, send('PATCH', body)),

  /** `others` revokes every session but the current one. */
  revokeSession: (sid: string) => request<null>(`/v1/sessions/${enc(sid)}`, send('DELETE')),
  signOut: () => request<{ ok: true }>('/v1/session', send('DELETE')),

  // admin
  createSeason: (game: string, body: SeasonBody) =>
    request<Season>(`/v1/games/${enc(game)}/seasons`, send('POST', body)),

  updateSeason: (game: string, number: number, body: SeasonBody) =>
    request<Season>(`/v1/games/${enc(game)}/seasons/${number}`, send('PATCH', body)),

  /** Queued, not immediate: Jodi's clock settles the ratings and freezes the standings. */
  closeSeason: (game: string) =>
    request<Season>(`/v1/games/${enc(game)}/seasons/current/close`, send('POST')),
}

/**
 * Full-page navigation, not fetch. Orion's OAuth2 channel answers 302 to github.com
 * with a PKCE challenge and sets the oauth-state cookie; following it in JS would
 * neither store that cookie nor leave the address bar somewhere GitHub can return to.
 */
export function startGitHubSignIn(): void {
  window.location.href = '/v1/auth/github'
}
