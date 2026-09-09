// Typed client for Soma's /v1 surface.
//
// Every call is same-origin and relies on the session cookie, which is HttpOnly:
// JS cannot read it, so "are we signed in?" is answered by calling /v1/me and
// seeing whether it is a 200 or a 401. There is no token in localStorage to go
// stale, and nothing to attach by hand.
//
// THE TYPES BELOW ARE ASSERTIONS, NOT VALIDATION. Soma builds each response body
// in SQL -- json_build_object in the workflow's one query -- so these declarations
// were read off those queries and TypeScript cannot notice when one changes.
// soma/workflows/soma-*.json is the authority; compare it when editing here.

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

// Two error shapes reach the browser and both have to be read.
//
// Orion's own failures -- an unroutable path, a rate limit, a workflow that
// halted -- are `{error: {code, message, request_id}}`. Soma's deliberate
// refusals are shaped by the workflow itself and are `{error: "not_a_participant",
// detail: {...}}`, where `error` is a plain string naming the reason. Flattening
// the second into "something went wrong" is how a page ends up unable to say
// which of three refusals it hit.
type ErrorBody = {
  error?: string | { code?: string; message?: string; request_id?: string }
  detail?: unknown
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      // Same-origin through the dev proxy, but stated so a future cross-origin
      // deployment sends the cookie rather than silently dropping it.
      credentials: 'include',
      ...init,
      headers: { accept: 'application/json', ...init?.headers },
    })
  } catch (cause) {
    // The network never answered. This is the state /error is written for, and
    // it is a different fact about the world from a 404, so it gets a status of
    // its own rather than being reported as one.
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

  if (!res.ok) {
    const body = parsed as ErrorBody | null
    const e = body?.error
    if (typeof e === 'string') {
      throw new ApiError(res.status, e, e.replace(/_/g, ' '), undefined, body?.detail)
    }
    throw new ApiError(
      res.status,
      e?.code ?? 'unknown',
      e?.message ?? res.statusText,
      e?.request_id,
      body?.detail,
    )
  }
  return parsed as T
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

// ---- the vocabulary -----------------------------------------------------------------

/** Open, plus one ladder per weight class the season offers. */
export type Ladder = string
export type WeightClass = string

/** Derived in season_json(), never stored: a route cannot invent a fifth. */
export type SeasonState = 'scheduled' | 'open' | 'settling' | 'closed'

export type ModelStatus = 'testing' | 'verified' | 'active' | 'superseded' | 'rejected'
export type ModelPhase = 'queued' | 'verifying' | 'awaiting_trial' | 'on_the_ladder' | 'rejected' | 'superseded'
export type MatchStatus = 'pending' | 'claimed' | 'running' | 'finished' | 'rated' | 'cancelled' | 'failed'
export type Outcome = 'win' | 'loss' | 'draw' | 'dq' | null

/** The caps this season is played under. Per season, so they travel with it. */
export type SeasonWeightClass = { class: WeightClass; max_bytes: number }
/** The same, joined to the cartridge's FLOP cap. Only GET /v1/games/{game} has it. */
export type GameWeightClass = SeasonWeightClass & { flop_cap: number | null }

/** season_json() -- the one definition of a season, returned by six routes. */
export type Season = {
  number: number
  state: SeasonState
  submissions_open_at: string
  submissions_close_at: string
  closed_at: string | null
  close_requested_at: string | null
  engine_digest: string | null
  rules: Record<string, unknown> | null
  weight_classes: SeasonWeightClass[]
  /** The ladder's size. */
  active_versions: number
  /** Everything ever submitted -- a different question, and a closed season asks it. */
  entered_versions: number
  /** Excludes trials, so it agrees with what GET /v1/matches can reach. */
  matches_played: number
  in_flight_versions: number
}

/** model_ratings() -- one definition of a rank, keyed by ladder. */
export type Rating = {
  rating: number
  mu: number
  sigma: number
  provisional: boolean
  matches: number
  rank: number
  field: number
}
export type Ratings = Record<Ladder, Rating>

// ---- games --------------------------------------------------------------------------

export type GameSummary = {
  id: string
  name: string
  season: Season | null
}

/** Prose and links out of the cartridge's own manifest. Plain text by contract:
 *  a registration document is read from a repository and rendered in a browser,
 *  so nothing in it may be inserted as markup. A cartridge may ship none. */
export type GameAbout = {
  tagline?: string
  provenance?: string
  story?: string[]
  links?: { label: string; href: string }[]
}

export type GamePreset = { name: string; players: number; maps: number }

export type Game = GameSummary & {
  about: GameAbout | null
  presets: GamePreset[] | null
  limits: { max_turns?: number; turn_ms?: number } | null
  strike_limit: number | null
  weight_classes: GameWeightClass[] | null
}

// ---- leaderboard --------------------------------------------------------------------

export type LeaderboardEntry = {
  rank: number
  model_id: string
  owner: string
  version: number
  class: WeightClass
  size_bytes: number | null
  rating: number
  provisional: boolean
  matches: number
  baseline: boolean
  /** The last rating move on this ladder, or null before the first one. */
  trend: number | null
}

export type Leaderboard = {
  season: number | null
  closed: boolean | null
  total: number
  entries: LeaderboardEntry[]
  /** An offset, as a string. Absent once the last page has been read. */
  next_cursor: string | null
}

// ---- matches ------------------------------------------------------------------------

export type MatchSeat = {
  seat: number
  model_id: string
  owner: string
  baseline: boolean
  class: WeightClass
  version: number
  rank: number | null
  score: number | null
  strikes: number | null
  outcome: Outcome
  /** GET /v1/me/matches only: whether this seat is the caller's. */
  mine?: boolean
}

export type MatchSummary = {
  id: string
  game: string
  season: number
  status: MatchStatus
  preset: string
  seed: number
  reason: string | null
  turns: number | null
  played_at: string | null
  created_at?: string
  ladders: Ladder[]
  is_trial: boolean
  seats: MatchSeat[]
  withdrawn_reason?: string | null
  fault_reason?: string | null
  fault_seat?: number | null
  successor?: { model_id: string; version: number } | null
}

export type MatchList = {
  season: number | null
  /** Only counted on the first page; paging does not re-count. */
  total: number | null
  matches: MatchSummary[]
  next_cursor: string | null
}

export type RatingChange = {
  mu_before: number | null
  sigma_before: number | null
  mu_after: number
  sigma_after: number
}

export type MatchPlayer = {
  seat: number
  model_id: string
  owner: string | null
  baseline: boolean | null
  class: WeightClass | null
  model_version: number | null
  outcome: Outcome
  rank: number | null
  score: number | null
  strikes: number | null
  rating_change: Record<Ladder, RatingChange> | null
}

export type Match = {
  id: string
  game: string
  season: number
  status: MatchStatus
  seed: number
  preset: string
  reason: string | null
  turns: number | null
  played_ms: number | null
  played_at: string | null
  created_at: string
  withdrawn_reason: string | null
  successor_id: string | null
  fault_reason: string | null
  fault_seat: number | null
  engine_digest: string | null
  evaluator_digest: string | null
  is_trial: boolean
  ladders: Ladder[]
  strike_limit: number | null
  successor: { model_id: string; owner: string; version: number } | null
  players: MatchPlayer[]
  /** Signed, and good for an hour. Absent until Kalam has uploaded the replay. */
  replay_url?: string | null
}

// ---- models -------------------------------------------------------------------------

export type ModelDetail = {
  id: string
  owner: string
  game: string
  version: number
  repo: string | null
  release_tag: string | null
  commit_sha: string | null
  class: WeightClass | null
  /** The cap THIS version was measured against -- its own season's, not the live one's. */
  class_max_bytes: number | null
  size_bytes: number | null
  param_count: number | null
  flops_estimate: number | null
  weights_hash: string | null
  adapter_hash: string | null
  evaluator_digest: string | null
  status: ModelStatus
  phase: ModelPhase
  admit_attempt: number | null
  successor: number | null
  reject_reason: string | null
  created_at: string
  season: number
  trial: {
    match_id: string
    status: MatchStatus
    preset: string
    queued_at: string
    waiting_s: number | null
  } | null
  ratings: Ratings
  baseline: boolean
  last_played_at: string | null
}

/** GET /v1/models -- the caller's own versions, in every state. */
export type MyModel = {
  id: string
  owner: string
  game: string
  version: number
  repo: string | null
  release_tag: string | null
  class: WeightClass | null
  size_bytes: number | null
  status: ModelStatus
  phase: ModelPhase
  reject_reason: string | null
  created_at: string
  season: number
  ratings: Ratings
  last_played_at: string | null
}

// ---- people -------------------------------------------------------------------------

export type Candidate = {
  model_id: string
  game: string
  version: number
  phase: 'queued' | 'verifying' | 'awaiting_trial'
}

export type Me = {
  id: string
  handle: string
  display_name: string | null
  role: string
  created_at: string
  candidates: Candidate[]
}

export type ProfileVersion = {
  model_id: string
  version: number
  class: WeightClass | null
  size_bytes: number | null
  status: ModelStatus
  repo: string | null
  release_tag: string | null
  created_at: string
  ratings: Ratings
}

/** One section per game-and-season the person has entered. Public, so it carries
 *  only `active` and `superseded` -- a candidate mid-trial and a rejected version
 *  are private and reach the owner's own view through GET /v1/models. */
export type ProfileGame = {
  game: string
  game_name: string
  season: number
  season_state: SeasonState
  versions: ProfileVersion[]
}

export type Profile = {
  handle: string
  display_name: string | null
  role: string
  baseline: boolean
  created_at: string
  games: ProfileGame[]
}

export type SessionRow = {
  sid: string
  issued_at: string
  expires_at: string
  last_seen_at: string
  user_agent: string | null
  current: boolean
}

// ---- the arena ----------------------------------------------------------------------

/** No state is named -- running, behind and down are a reading of these numbers,
 *  and the thresholds are the page's, not the database's. */
export type Status = {
  checked_at: string
  arena: {
    matches_last_hour: number
    queue: number
    in_flight: number
    awaiting_rating: number
    median_played_ms: number | null
    last_played_at: string | null
    last_rated_at: string | null
    admission_queue: number
    awaiting_trial: number
  }
}

// ---- submitting ---------------------------------------------------------------------

export type SubmissionRefusal = 'season_not_open' | 'not_a_participant' | 'version_in_flight' | 'weights_already_entered'

export type Preflight = {
  game: string
  season: {
    number: number
    state: Exclude<SeasonState, 'closed'>
    submissions_open_at: string
    submissions_close_at: string
  } | null
  participant: boolean
  next_version: number
  in_flight: { model_id: string; version: number; phase: Candidate['phase'] } | null
  refusal: SubmissionRefusal | null
}

export type SubmissionResult = {
  model_id: string
  version: number
  status: ModelStatus
  season: number
  weights_hash: string
  adapter_hash: string
}

export type MatchFilters = {
  game?: string | null
  season?: number | string | null
  ladder?: string | null
  class?: string | null
  preset?: string | null
  /** The API's three, not the seat outcomes: decided, drawn, or a seat disqualified. */
  outcome?: 'decided' | 'drawn' | 'dq' | null
  model?: string | null
  owner?: string | null
  cursor?: string | null
  limit?: number | null
}

// ---- the routes ---------------------------------------------------------------------

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
      `/v1/games/${enc(game)}/leaderboard${query({
        ladder: opts.ladder ?? 'open',
        season: opts.season,
        limit: opts.limit,
        cursor: opts.cursor,
      })}`,
    ),

  matches: (f: MatchFilters = {}) => request<MatchList>(`/v1/matches${query(f)}`),
  match: (id: string) => request<Match>(`/v1/matches/${enc(id)}`),
  model: (id: string) => request<ModelDetail>(`/v1/models/${enc(id)}`),
  profile: (username: string) => request<Profile>(`/v1/profiles/${enc(username)}`),

  // session reads
  /** 200 when the session cookie is good, 401 when it is absent, expired or revoked. */
  me: () => request<Me>('/v1/me'),
  myModels: (game?: string | null) => request<MyModel[]>(`/v1/models${query({ game })}`),
  /** The caller's matches in every state -- queued, cancelled and failed included. */
  myMatches: (opts: { game?: string | null; cursor?: string | null; limit?: number } = {}) =>
    request<MatchList>(`/v1/me/matches${query(opts)}`),
  sessions: () => request<SessionRow[]>('/v1/sessions'),
  submissionPreflight: (game: string) => request<Preflight>(`/v1/games/${enc(game)}/submission`),

  // session writes
  updateMe: (display_name: string | null) =>
    request<Omit<Me, 'candidates'>>('/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ display_name }),
    }),

  submit: (body: { game: string; repo: string; release_tag: string; weights_hash: string; adapter_hash: string }) =>
    request<SubmissionResult>('/v1/submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /** `others` revokes every session but the current one. */
  revokeSession: (sid: string) => request<null>(`/v1/sessions/${enc(sid)}`, { method: 'DELETE' }),
  signOut: () => request<{ ok: true }>('/v1/session', { method: 'DELETE' }),

  // admin
  createSeason: (
    game: string,
    body: {
      submissions_open_at: string
      submissions_close_at: string
      rules?: Record<string, unknown>
      weight_classes?: SeasonWeightClass[]
    },
  ) =>
    request<Season>(`/v1/games/${enc(game)}/seasons`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),

  updateSeason: (
    game: string,
    number: number,
    body: {
      submissions_open_at?: string
      submissions_close_at?: string
      rules?: Record<string, unknown>
      weight_classes?: SeasonWeightClass[]
    },
  ) =>
    request<Season>(`/v1/games/${enc(game)}/seasons/${number}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /** Queued, not immediate: Jodi's clock settles the ratings and freezes the standings. */
  closeSeason: (game: string) =>
    request<Season>(`/v1/games/${enc(game)}/seasons/current/close`, { method: 'POST' }),
}

/**
 * Full-page navigation, not fetch. The endpoint is Orion's own OAuth2 sign-in
 * channel: it answers 302 to github.com with a PKCE challenge and sets the
 * oauth-state cookie. Following it in JS would neither store the cookie against
 * the document nor leave the address bar somewhere GitHub can return to.
 *
 * GitHub sends the browser back to /v1/auth/github/callback. A completed sign-in
 * lands on the app with the session cookie set; a refused one is a fixed 401 from
 * the channel, which nginx turns into /signin/callback?error=incomplete.
 */
export function startGitHubSignIn(): void {
  window.location.href = '/v1/auth/github'
}
