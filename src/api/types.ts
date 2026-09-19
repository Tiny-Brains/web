// Soma's /v1 response shapes.
//
// THESE ARE ASSERTIONS, NOT VALIDATION. Soma builds each body in SQL, so these
// declarations were read off those queries and TypeScript cannot notice when one
// changes. soma/workflows/soma-*.json is the authority.

/** Open, plus one ladder per weight class the season offers. */
export type Ladder = string
export type WeightClass = string

export type SeasonState = 'scheduled' | 'open' | 'settling' | 'closed'
/** `disabled` is a baseline's alone: admitted and out of play. */
export type ModelStatus = 'testing' | 'verified' | 'active' | 'disabled' | 'superseded' | 'rejected'
export type ModelPhase =
  | 'queued' | 'verifying' | 'awaiting_trial' | 'on_the_ladder' | 'disabled' | 'rejected' | 'superseded'
export type MatchStatus = 'pending' | 'claimed' | 'running' | 'finished' | 'rated' | 'cancelled' | 'failed'
export type Outcome = 'win' | 'loss' | 'draw' | 'dq' | null

/** The caps this season is played under. Per season, so they travel with it. */
export type SeasonWeightClass = { class: WeightClass; max_bytes: number }
/** GET /v1/games/{game} reports the same shape. There is no compute cap to join to: the class is
 *  decided on bytes alone. */
export type GameWeightClass = SeasonWeightClass

/** How a season's boards stand: how many are in play and not, and what the ones in play span.
 *  `players` and `sides` are null while none is enabled. */
export type SeasonMapsSummary = {
  enabled: number
  disabled: number
  players: [number, number] | null
  sides: [number, number] | null
}

/** season_json() — the one definition of a season, returned by six routes. A season is addressed by
 *  its SLUG everywhere; its name is what a person reads. Neither ever changes. */
export type Season = {
  name: string
  slug: string
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
  maps: SeasonMapsSummary
  /** Its baselines, counted: in play, admitted and out of play, still being admitted. A trial
   *  is seated only against the first number. */
  baselines: SeasonBaselinesSummary
}

export type SeasonBaselinesSummary = { enabled: number; disabled: number; admitting: number }

/** season_baseline_json() — one baseline of a season, from the three admin routes. A baseline
 *  is a `baseline.<slug>` account, its entry and its version in the season, and the version's
 *  STATUS is whether it is in play: `active` is, `disabled` is not (every admitted upload lands
 *  there), `testing` is being admitted, `rejected` was refused — `reject_reason` says why. */
export type SeasonBaseline = {
  /** How the routes address it: the handle without `baseline.`. */
  slug: string
  name: string
  handle: string
  model_id: string
  version_id: string
  version: number
  status: 'testing' | 'disabled' | 'active' | 'rejected'
  phase: ModelPhase
  enabled: boolean
  reject_reason: string | null
  class: Ladder | null
  size_bytes: number | null
  params: number | null
  infer_us: number | null
  weights_hash: string
  added_at: string
  /** Conservative rating on the open ladder, once it has been in play. */
  rating: number | null
  matches: number | null
}

/** GET /v1/games/{game}/seasons/{slug}/baselines */
export type SeasonBaselineList = { season: string; baselines: SeasonBaseline[] }

/** POST .../baselines — the version, and two one-shot PUTs for its files while it is `testing`. */
export type SeasonBaselineUpload = SeasonBaseline & {
  upload: { model_onnx: string; manifest_json: string; expires_in: string; note: string } | null
}

/** season_map_json() — one board of a season. The header is the platform's; the board itself is the
 *  cartridge's, carried only where a page draws it. Public from the moment it is uploaded. */
export type SeasonMap = {
  map_id: string
  players: number
  rows: number
  cols: number
  /** In play. An upload lands disabled until an admin enables it. */
  enabled: boolean
  added_at: string
  /** Counted matches played on it, trials excluded. */
  matches: number
  /** The map file as uploaded, with `?boards=true` or on the one-map read. */
  board?: unknown
}

/** GET /v1/games/{game}/seasons/{slug}/maps */
export type SeasonMapList = { season: string; maps: SeasonMap[] }

/** GET /v1/games/{game}/seasons/{slug}/maps/{map_id} — the board, and when it was in play. */
export type SeasonMapDetail = SeasonMap & {
  season: string
  board: unknown
  events: { at: string; enabled: boolean; by: string; cancelled: number }[]
}

/** What a season's upload may be: whatever the game's basic boards span (limits.boards). */
export type BoardLimits = { players: [number, number]; sides: [number, number]; cells_max: number }

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
 *  authored elsewhere and rendered in a browser, so none of it may be markup. */
export type GameAbout = {
  tagline?: string
  provenance?: string
  story?: string[]
  links?: { label: string; href: string }[]
}

export type Game = GameSummary & {
  about: GameAbout | null
  limits: { max_turns?: number; turn_ms?: number; boards?: BoardLimits | null } | null
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
  /** The last twelve ratings on this ladder, oldest first, the seed at promotion included. Absent
   *  from a Soma older than 11 September 2026, so it is read as optional. */
  history?: number[]
}

export type Leaderboard = {
  /** The season's slug, and its name. */
  season: string | null
  season_name: string | null
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
  /** The season's slug. */
  season: string
  status: MatchStatus
  /** The board's id within its season. */
  map: string
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
  season: string | null
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
  /** The season's slug. */
  season: string
  status: MatchStatus
  seed: number
  /** The board's id within its season. */
  map: string
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
  orion_version: string | null
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
  /** A season's slug. */
  season?: string | null
  ladder?: string | null
  class?: string | null
  /** A board's id within the season. */
  map?: string | null
  /** The API's three, not the seat outcomes. */
  outcome?: 'decided' | 'drawn' | 'dq' | null
  model?: string | null
  owner?: string | null
  /** The match's seat count, from 2 to 8: the map decides it. */
  players_min?: number | null
  players_max?: number | null
  cursor?: string | null
  limit?: number | null
}

// ---- models and versions ------------------------------------------------------------
//
// A MODEL is an entry: a competitor's named lineage, keyed by that name under its owner and
// addressed by its id. A VERSION is one submission of it. Ratings, seats and matches all point at
// a VERSION; a rename, a retirement and a quota are all about the MODEL.

/** GET /v1/models/{id} — one entry and its whole version history. */
export type ModelDetail = {
  model_id: string
  model: string
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
  class: WeightClass | null
  size_bytes: number | null
  param_count: number | null
  infer_us: number | null
  status: ModelStatus
  phase: ModelPhase
  reject_reason: string | null
  created_at: string
  weights_hash: string | null
  manifest_hash: string | null
  /** The season's slug. */
  season: string
  ratings: Ratings
  last_played_at: string | null
}

/** GET /v1/versions/{id} — one version, in full. The permalink. */
export type VersionDetail = {
  id: string
  model_id: string
  model: string
  owner: string
  game: string
  version: number
  class: WeightClass | null
  /** The cap THIS version was measured against — its own season's, not the live one's. */
  class_max_bytes: number | null
  size_bytes: number | null
  param_count: number | null
  /** The slowest reference case's inference at admission, in microseconds. Reported, not a gate. */
  infer_us: number | null
  weights_hash: string | null
  manifest_hash: string | null
  orion_version: string | null
  status: ModelStatus
  phase: ModelPhase
  admit_attempt: number | null
  successor: number | null
  reject_reason: string | null
  created_at: string
  /** The season's slug. */
  season: string
  trial: {
    match_id: string
    status: MatchStatus
    map: string
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
  created_at: string
  ratings: Ratings
}

/** One of a competitor's models, within one game and season. */
export type ProfileModel = {
  model_id: string
  model: string
  retired: boolean
  versions: ProfileVersion[]
}

/** Public, so it carries only `active` and `superseded`: a candidate mid-trial and
 *  a rejected version reach their owner through GET /v1/games/{game}/models?mine=1. */
export type ProfileGame = {
  game: string
  game_name: string
  season: string
  season_name: string
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
  | 'model_name_taken'
  | 'entries_max'
  | 'not_a_participant'

/** The state of one model within the open season, as /submit reads it before the POST. */
export type PreflightModel = {
  model_id: string
  model: string
  retired: boolean
  next_version: number
  in_flight: { version_id: string; version: number; phase: Candidate['phase'] } | null
  cooldown_until: string | null
  versions_ok: boolean
}

export type Preflight = {
  game: string
  season: {
    slug: string
    name: string
    state: Exclude<SeasonState, 'closed'>
    submissions_open_at: string
    submissions_close_at: string
  } | null
  participant: boolean
  /** Every model the caller holds in this game, so /submit can offer a choice. */
  models: { model_id: string; model: string; retired: boolean }[]
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
  version: number
  status: ModelStatus
  season: string
  weights_hash: string
  manifest_hash: string
  /** Two one-shot PUT URLs, good for thirty minutes: the platform holds no bytes of its own, so
   *  the competitor uploads the two files it just declared the hashes of. Absent when the
   *  submission was refused. Asking again with the same release tag mints fresh ones. */
  upload: {
    model_onnx: string
    manifest_json: string
    expires_in: string
    note: string
  } | null
}

// ---------------------------------------------------------------- runners (admin)
//
// A RUNNER IS A MACHINE, NOT AN ACCOUNT. It self-registers: the gate upserts a row on
// (key_id, label) the first time a machine exchanges its key, so nothing here is enrolled
// and two machines sharing one key are two rows told apart by `label` alone.
//
// Read off `soma-runners-list`'s one query. `live` is computed there and is the whole
// authorisation in one boolean: a runner is live while its own row, its key, AND its key's
// owner are all in good standing — demote the owner and every machine on their keys stops
// at its next call.

export type Runner = {
  id: string
  /** What the machine calls itself. The only thing telling two machines on one key apart. */
  label: string
  key_id: string
  key_label: string | null
  /** The eight display characters of the key it presented. The key itself is a hash. */
  key_prefix: string
  /** The admin whose key this is. Their demotion stops this machine. */
  owner: string
  /** Reported at token exchange, never enforced. A disagreement with the season's engine is
   *  why a runner claims nothing while looking perfectly healthy. */
  engine_digest: string | null
  node_version: string | null
  /** Must equal the gate's own. A match recorded against one Orion and admitted against
   *  another is what a re-validation sweep looks for. */
  orion_version: string | null
  ops_budget: number | null
  /** Derived from `uname` on the machine, not typed by anyone. */
  arch: string | null
  max_in_flight: number
  first_seen_at: string
  /** How "wedged" is read: a live runner with matches in flight and a stale last_seen. */
  last_seen_at: string
  revoked_at: string | null
  live: boolean
  in_flight: number
  played: number
}

export type RunnerKey = {
  id: string
  label: string | null
  key_prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
  /** Machines currently registered under it. Revoking the key stops all of them. */
  runners: number
}

/** The ONE response that carries `key`. It is stored as a sha256 and cannot be read back. */
export type MintedRunnerKey = RunnerKey & { key: string; note: string }

// ---- admin · users (GET /v1/admin/users, PATCH /v1/admin/users/{id}) ----
//
// Read off `soma-admin-users-list`'s one query. Baselines are never listed: nobody signs in to one.

export type UserRole = 'admin' | 'competitor'

export type AdminUser = {
  id: string
  handle: string
  display_name: string | null
  role: UserRole
  /** Listed in the deployment's SOMA_ADMIN_GITHUB_IDS: a demotion lasts until their next sign-in. */
  by_deployment: boolean
  /** The caller, whose own role the PATCH refuses. */
  you: boolean
  joined_at: string
  last_seen_at: string | null
}

export type AdminUserList = {
  /** Every admin, never filtered. */
  admins: AdminUser[]
  /** Competitors matching `q`, most recently seen first, at most 50. */
  users: AdminUser[]
  /** How many competitors match `q` in all. */
  matching: number
}

export type RoleChange = { changed: boolean; id: string; role: UserRole }

// ---- notifications (GET/POST /v1/me/notifications, GET/PATCH /v1/me/notification-settings) ----

export type NotificationCategory = 'submissions' | 'matches' | 'ratings' | 'season' | 'account' | 'admin'
/** Picks the icon family. */
export type NotificationKind = 'progress' | 'result' | 'rank' | 'alert' | 'season' | 'account'
export type NotificationTone = 'info' | 'ok' | 'warn' | 'bad'

export type Notification = {
  id: string
  category: NotificationCategory
  kind: NotificationKind
  tone: NotificationTone
  /** An explicit icon overriding the kind's; unknown ids fall back to the kind. */
  icon: string | null
  subject: string
  description: string | null
  /** An app-relative path. */
  link: string | null
  game: string | null
  /** The season's slug. */
  season: string | null
  model_id: string | null
  version_id: string | null
  match_id: string | null
  /** A handle the item is about, drawn as an avatar. */
  actor: string | null
  /** Structured extras: place, of, score, delta, class, ladder, rank, prev_rank, size_bytes… */
  data: Record<string, unknown>
  created_at: string
  read_at: string | null
}

export type NotificationPage = {
  notifications: Notification[]
  /** Unread across every category, whatever the filter. */
  unread: number
  next_cursor: string | null
}

export type NotificationSetting = {
  category: NotificationCategory
  app: boolean
  push: boolean
  /** Always on in the app. */
  locked: boolean
  /** Matches only: every rated match, the notable ones (a first place, a strike, a DQ), or none. */
  level: 'all' | 'notable' | 'off' | null
}
