// Soma's /v1 response shapes.
//
// THESE ARE ASSERTIONS, NOT VALIDATION. Soma builds each body in SQL, so these
// declarations were read off those queries and TypeScript cannot notice when one
// changes. soma/workflows/soma-*.json is the authority.

/** Open, plus one ladder per weight class the season offers. */
export type Ladder = string
export type WeightClass = string

export type SeasonState = 'scheduled' | 'open' | 'settling' | 'closed'
export type ModelStatus = 'testing' | 'verified' | 'active' | 'superseded' | 'rejected'
export type ModelPhase = 'queued' | 'verifying' | 'awaiting_trial' | 'on_the_ladder' | 'rejected' | 'superseded'
export type MatchStatus = 'pending' | 'claimed' | 'running' | 'finished' | 'rated' | 'cancelled' | 'failed'
export type Outcome = 'win' | 'loss' | 'draw' | 'dq' | null

/** The caps this season is played under. Per season, so they travel with it. */
export type SeasonWeightClass = { class: WeightClass; max_bytes: number }
/** GET /v1/games/{game} reports the same shape. There is no compute cap to join to: the class is
 *  decided on bytes alone (devops decision 46). */
export type GameWeightClass = SeasonWeightClass

/** season_json() — the one definition of a season, returned by six routes. */
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
  /** Everything ever submitted — a different question, and a closed season asks it. */
  entered_versions: number
  /** Excludes trials, so it agrees with what GET /v1/matches can reach. */
  matches_played: number
  in_flight_versions: number
}

/** model_ratings() — one definition of a rank, keyed by ladder. */
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

/** Prose out of the cartridge's own manifest. Plain text by contract: it is read
 *  from a repository and rendered in a browser, so none of it may be markup. */
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
  /** The version that holds this row. */
  version_id: string
  /** The model it is a version of — what the row links to and prints. */
  model_id: string
  model: string
  repo: string
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
  /** The version that sat here. */
  version_id: string
  /** And the model it belongs to, which is what a seat is labelled with. */
  model_id: string
  model: string
  repo: string
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
  successor?: { version_id: string; model_id: string; model?: string; version: number } | null
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
  version_id: string
  model_id: string
  model: string
  repo: string
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
  /** The VERSION that holds the seat now — the same model's next one. Named, because two ids
   *  that both look like uuids are exactly what a page confuses. */
  successor: { version_id: string; model_id: string; model: string; owner: string; version: number } | null
  players: MatchPlayer[]
  /** Signed, and good for an hour. Absent until Kalam has uploaded the replay. */
  replay_url?: string | null
}

export type MatchFilters = {
  /** One VERSION's matches. `model` is the wider filter: every version of that entry. */
  version?: string | null
  game?: string | null
  season?: number | string | null
  ladder?: string | null
  class?: string | null
  preset?: string | null
  /** The API's three, not the seat outcomes. */
  outcome?: 'decided' | 'drawn' | 'dq' | null
  model?: string | null
  owner?: string | null
  cursor?: string | null
  limit?: number | null
}

// ---- models and versions ------------------------------------------------------------
//
// A MODEL is an entry: a competitor's named lineage, keyed by the GitHub repository it is
// published from. A VERSION is one release of it. Ratings, seats and matches all point at a
// VERSION; a rename, a retirement and a quota are all about the MODEL.

/** GET /v1/games/{game}/models/{owner}/{repo} — one entry and its whole version history. */
export type ModelDetail = {
  model_id: string
  model: string
  repo: string
  owner: string
  owner_handle: string
  baseline: boolean
  game: string
  created_at: string
  retired: boolean
  retired_at: string | null
  versions: VersionSummary[]
}

/** One row of a model's history, as the Model screen prints it. */
export type VersionSummary = {
  version_id: string
  version: number
  release_tag: string | null
  commit_sha: string | null
  class: WeightClass | null
  size_bytes: number | null
  param_count: number | null
  infer_us: number | null
  status: ModelStatus
  phase: ModelPhase
  reject_reason: string | null
  created_at: string
  weights_hash: string | null
  adapter_hash: string | null
  season: number
  ratings: Ratings
  last_played_at: string | null
}

/** GET /v1/versions/{id} — one version, in full. The permalink. */
export type VersionDetail = {
  id: string
  model_id: string
  model: string
  repo: string
  owner: string
  game: string
  version: number
  release_tag: string | null
  commit_sha: string | null
  class: WeightClass | null
  /** The cap THIS version was measured against — its own season's, not the live one's. */
  class_max_bytes: number | null
  size_bytes: number | null
  param_count: number | null
  /** The slowest reference case's inference at admission, in microseconds. Reported, not a gate. */
  infer_us: number | null
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

/** GET /v1/games/{game}/models?mine=1 — the caller's own entries, each with its versions. */
export type MyModel = {
  id: string
  name: string
  repo: string
  owner: string
  game: string
  created_at: string
  retired: boolean
  versions: VersionSummary[]
}

// ---- people -------------------------------------------------------------------------

/** A version of the caller's that is in admission. There may now be several at once — one per
 *  model, up to whatever the season's entries.in_flight_max allows. */
export type Candidate = {
  version_id: string
  model_id: string
  model: string
  repo: string
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
  version_id: string
  version: number
  class: WeightClass | null
  size_bytes: number | null
  status: ModelStatus
  release_tag: string | null
  created_at: string
  ratings: Ratings
}

/** One of a competitor's models, within one game and season. */
export type ProfileModel = {
  model_id: string
  model: string
  repo: string
  retired: boolean
  versions: ProfileVersion[]
}

/** Public, so it carries only `active` and `superseded`: a candidate mid-trial and
 *  a rejected version reach their owner through GET /v1/games/{game}/models?mine=1. */
export type ProfileGame = {
  game: string
  game_name: string
  season: number
  season_state: SeasonState
  models: ProfileModel[]
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

/** No state is named — running, behind and down are a reading of these numbers,
 *  and the thresholds are /status's, not the database's. */
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

export type SubmissionRefusal =
  | 'season_not_open'
  | 'not_a_participant'
  | 'unknown_model'
  | 'model_retired'
  | 'version_in_flight'
  | 'too_many_in_flight'
  | 'too_many_versions'
  | 'cooling_down'
  | 'weights_already_entered'

/** What creating a model can be refused for, as opposed to submitting to one. */
export type ModelRefusal =
  | 'repo_invalid'
  | 'repo_not_owned'
  | 'repo_taken'
  | 'model_name_taken'
  | 'entries_max'
  | 'not_a_participant'

/** The state of one model within the open season, as /submit reads it before the POST. */
export type PreflightModel = {
  model_id: string
  model: string
  repo: string
  retired: boolean
  next_version: number
  in_flight: { version_id: string; version: number; phase: Candidate['phase'] } | null
  cooldown_until: string | null
  versions_ok: boolean
}

export type Preflight = {
  game: string
  season: {
    number: number
    state: Exclude<SeasonState, 'closed'>
    submissions_open_at: string
    submissions_close_at: string
  } | null
  participant: boolean
  /** Every model the caller holds in this game, so /submit can offer a choice. */
  models: { model_id: string; model: string; repo: string; retired: boolean }[]
  /** The one named by ?model=, if any. */
  model: PreflightModel | null
  may_add_model: boolean
  entries_used: number
  entries_max: number | null
  in_flight_used: number
  in_flight_max: number | null
  refusal: SubmissionRefusal | null
}

export type SubmissionResult = {
  version_id: string
  model_id: string
  model: string
  repo: string
  version: number
  status: ModelStatus
  season: number
  weights_hash: string
  adapter_hash: string
}
