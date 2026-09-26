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

/** The caps this season is played under. Per season, so they travel with it. A model's memory on a
 *  board is capped at `memory_flat_bytes + memory_cell_bytes × cells`; absent is 0, and 0 and 0 is a
 *  class with no memory. */
export type SeasonWeightClass = {
  class: WeightClass
  max_bytes: number
  memory_flat_bytes?: number
  memory_cell_bytes?: number
}
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
/** Matches on a board right now, trials excluded: its own uncached route, because it moves at
 *  every claim and the season document is cached until a write that concerns it. */
export type Playing = { playing: number }

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
  /** Models in the field: distinct entries with a version in this season. */
  entries: number
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
  /** Read off the name `size-terrain-Np-Hh`; `hills` is per player. Null only on a board uploaded
   *  before the name pattern was enforced. */
  size: string | null
  terrain: string | null
  hills: number | null
  /** Counted matches played on it, trials excluded. */
  matches: number
  /** The board's newest counted match: what the maps page's Watch opens. */
  latest_match: MatchRef | null
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
  /** The last twelve ratings on this ladder, oldest first, the seed at promotion included. */
  history: number[]
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

/** One version's line in the rating series: its conservative rating and rank at each edge, null
 *  where it did not stand on the ladder. rating_series() in soma/migrations/0001_init.sql. */
export type SeriesVersion = {
  version_id: string
  model_id: string
  model: string
  owner: string
  baseline: boolean
  version: number
  ratings: (number | null)[]
  ranks: (number | null)[]
}

/** GET /v1/games/{game}/leaderboard/series — soma/sql/soma-pub-leaderboard-series-query.sql.
 *  `edges` are the instants, evenly spaced from `since` to now (or the close); the last is live. */
export type LeaderboardSeries = {
  /** The season's slug. */
  season: string
  ladder: Ladder
  series: { edges: string[]; versions: SeriesVersion[] }
}

/** A staff pick as the public reads it — soma/sql/soma-pub-picks-query.sql: the card, and where it
 *  sits in the list. */
export type StaffPick = MatchSummary & { pick_id: string; position: number }
export type PickList = { game: string; picks: StaffPick[] }

/** One place on a frozen podium — soma/sql/soma-pub-podium-query.sql. One place per owner, no
 *  baselines. */
export type PodiumPlace = {
  place: number
  owner: string
  model_id: string
  model: string
  version_id: string
  version: number
  rating: number
  /** The owner's newest counted match in that season, for the picture. */
  latest_match: MatchRef | null
}

/** GET /v1/games/{game}/seasons/{slug}/podium. `ladders` is empty until the season closes. */
export type Podium = {
  season: string
  season_name: string
  closed: boolean
  closed_at: string | null
  ladders: Partial<Record<Ladder, PodiumPlace[]>>
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

/** A POINTER TO A MATCH, for a card that shows one it does not list: a profile model's latest, a
 *  podium place's, a board's. `frame` says whether GET /v1/matches/{id}/frame has a picture yet.
 *  match_ref_json() in soma/migrations/0001_init.sql. */
export type MatchRef = { id: string; played_at: string | null; frame: boolean }

/** A MATCH AS A CARD: match_summary_json() in soma/migrations/0001_init.sql — the public listing's
 *  row, and what the owner's listing, the related rail, the picks and a model's season return too. */
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
  ladders: Ladder[]
  is_trial: boolean
  /** The winner's score minus the runner-up's; null for a shared first or no result. */
  margin: number | null
  /** The best Open rating the winner beat fairly, minus its own, before the match. Positive is an
   *  upset; null when nobody was beaten fairly. */
  upset: number | null
  /** The thread's live comment count. */
  comments: number
  /** Whether a last frame exists: ask GET /v1/matches/{id}/frame only when it does. */
  frame: boolean
  seats: MatchSeat[]
  /** GET /v1/me/matches only (MyMatchCard). */
  created_at?: string
  withdrawn_reason?: string | null
  fault_reason?: string | null
  successor?: { version_id: string; model_id: string; model: string; owner: string; version: number } | null
}
/** The redesign's name for the same shape. */
export type MatchCard = MatchSummary

export type MatchSort = 'newest' | 'closest' | 'upset' | 'longest' | 'discussed'

/** GET /v1/matches — soma/sql/soma-pub-matches-list-query.sql. */
export type MatchList = {
  /** The season's slug when `game` was given, else null. Absent from GET /v1/me/matches, which
   *  spans seasons: optional so a page can hold either listing. */
  season?: string | null
  /** Only counted on the first page; paging does not re-count. Counted to 10,000 at most. */
  total: number | null
  /** Whether more than `total` matched: the count stopped at 10,000. First page only. */
  total_capped?: boolean | null
  /** The sort this page was read in; each has its own cursor, so a cursor is never reused across sorts. */
  sort?: MatchSort
  matches: MatchSummary[]
  next_cursor: string | null
}

/** GET /v1/me/matches — soma/sql/soma-user-matches-query.sql: every state, with `mine` on each seat. */
export type MyMatchCard = MatchSummary & {
  created_at: string
  withdrawn_reason: string | null
  fault_reason: string | null
  successor: { version_id: string; model_id: string; model: string; owner: string; version: number } | null
  seats: (MatchSeat & { mine: boolean })[]
}
export type MyMatchList = {
  /** First page only. Uncapped: it is one person's matches. */
  total: number | null
  matches: MyMatchCard[]
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
  version: number | null
  outcome: Outcome
  rank: number | null
  score: number | null
  strikes: number | null
  /** Per ladder this seat was rated on; null until the count clock has rated the match. */
  rating_change: Record<Ladder, RatingChange> | null
}

/** ONE MATCH, WHOLE: match_detail_json() in soma/migrations/0001_init.sql — the card, less
 *  `comments`, with each seat's rating_change and what only the match page prints. Returned by
 *  GET /v1/matches/{id} and GET /v1/me/matches/{id}. */
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
  engine_digest: string | null
  orion_version: string | null
  is_trial: boolean
  ladders: Ladder[]
  strike_limit: number | null
  margin: number | null
  upset: number | null
  frame: boolean
  /** The VERSION that holds the seat now — the same model's next one. Named, because two ids
   *  that both look like uuids are exactly what a page confuses. */
  successor: { version_id: string; model_id: string; model: string; owner: string; version: number } | null
  seats: MatchPlayer[]
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
  /** The other model of a head to head; needs `model` (400 `vs_needs_model`). */
  vs?: string | null
  owner?: string | null
  /** The match's seat count, from 2 to 8: the map decides it. */
  players_min?: number | null
  players_max?: number | null
  /** Default `newest`. `discussed` ranks by live comments in the `since` window (default 7 days). */
  sort?: MatchSort | null
  /** An ISO instant: played at or after it (for `discussed`, commented at or after it). */
  since?: string | null
  /** Only matches seating two or more of the Open ladder's top ten. Needs `game`. */
  top?: boolean | null
  cursor?: string | null
  /** 1..60, default 25. */
  limit?: number | null
}

/** GET /v1/matches/{id}/frame — soma/sql/soma-pub-matches-frame-query.sql. `turn` and `frame` are
 *  null until the runner reported one; `frame` is the cartridge's own, stored opaque. */
export type FrameSeat = {
  seat: number
  model_id: string
  model: string
  owner: string | null
  version: number | null
  rank: number | null
  score: number | null
  outcome: Outcome
}
export type MatchFrame = {
  id: string
  map: string
  turn: number | null
  seats: FrameSeat[]
  frame: unknown | null
}

/** GET /v1/matches/{id}/related — soma/sql/soma-pub-matches-related-query.sql: up to twelve
 *  cards, these models' latest first, then the board's, then the season's. */
export type RelatedMatches = { id: string; matches: MatchSummary[] }

/** POST /v1/events — the watch counter's vocabulary (watch_events CHECKs). */
export type WatchEvent = 'visit' | 'opened' | 'finished'
export type WatchVia = 'tv' | 'shelf' | 'grid' | 'next' | 'rail' | 'link'
export type WatchEventBody =
  | { event: 'visit' }
  | { event: 'opened'; match: string; via: WatchVia }
  | { event: 'finished'; match: string }

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

/** One row of a model's history. Soma now returns the whole version_json() here, so it is the
 *  same shape as VersionDetail; the name is kept for the pages that import it. */
export type VersionSummary = VersionDetail

/** GET /v1/versions/{id} — one version, in full. The permalink. version_json() in
 *  soma/migrations/0001_init.sql, which GET /v1/models/{id}, GET and PATCH /v1/me/versions/{id}
 *  and PATCH /v1/versions/{id} return too. */
export type VersionDetail = {
  version_id: string
  model_id: string
  model: string
  owner: string
  game: string
  version: number
  class: WeightClass | null
  /** The cap THIS version was measured against — its own season's, not the live one's. */
  class_max_bytes: number | null
  /** The class's memory numbers, filled in as 0 where the season leaves them out. */
  class_memory_flat_bytes: number | null
  class_memory_cell_bytes: number | null
  size_bytes: number | null
  /** What admission priced the model's declared memory at; null for a model without one. */
  memory_bytes: number | null
  /** The owner's line about this version (≤ 120), or null. */
  note: string | null
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

/** One of the caller's versions in GET /v1/models — soma/sql/soma-user-models-list-query.sql. A
 *  narrower row than version_json(): no hashes, measurements beyond size, note or trial. */
export type MyVersion = {
  version_id: string
  version: number
  class: WeightClass | null
  size_bytes: number | null
  memory_bytes: number | null
  status: ModelStatus
  phase: ModelPhase
  reject_reason: string | null
  created_at: string
  /** The season's slug. */
  season: string
  ratings: Ratings
  last_played_at: string | null
}

/** GET /v1/models — the caller's own entries, each with its versions, rejected ones included. */
export type MyModel = {
  id: string
  name: string
  owner: string
  game: string
  created_at: string
  retired: boolean
  versions: MyVersion[]
}

/** GET /v1/models/{id}/season — soma/sql/soma-pub-models-season-query.sql: the model on the Open
 *  ladder of its game's current season. `delta` is the conservative rating's move in that match. */
export type ModelSeason = {
  model_id: string
  model: string
  /** The season's slug; null when the game has none. */
  season: string | null
  record: { played: number; won: number; drawn: number; lost: number }
  /** Newest first. */
  last_five: MatchSummary[]
  best_win: { delta: number; match: MatchSummary } | null
  worst_loss: { delta: number; match: MatchSummary } | null
  rank: {
    /** Its best version's place on Open now, null while none stands. */
    now: number | null
    field: number
    /** From the hourly snapshot a week back; null before the season is a week old. */
    week_ago: number | null
    week_ago_field: number | null
  }
}

/** GET /v1/models/{id}/rivals — soma/sql/soma-pub-models-rivals-query.sql, most losses first. */
export type Rival = {
  model_id: string
  model: string
  owner: string
  baseline: boolean
  played: number
  won: number
  lost: number
}
export type ModelRivals = { model_id: string; season: string | null; rivals: Rival[] }

/** GET /v1/models/{id}/story — soma/sql/soma-pub-models-story-query.sql: the approved text only.
 *  `updated_at` is when it was last approved. */
export type ModelStory = {
  model_id: string
  title: string
  body: string
  featured: boolean
  featured_at: string | null
  updated_at: string | null
}

/** A held edit: the text that tripped the word list and the word (or `link`) it tripped on.
 *  story_pending_json() in soma/migrations/0001_init.sql. */
export type StoryPending = { title: string; body: string; hold_tag: string }

/** GET /v1/me/models/{id}/story and PUT /v1/models/{id}/story — soma/sql/soma-user-shared-story.sql:
 *  the writer's view. Every story field is null for a model with no story yet. */
export type MyModelStory = {
  model_id: string
  model: string
  /** The approved text the public reads; null until one is approved. */
  title: string | null
  body: string | null
  /** An edit held on a listed word while the public keeps `title` and `body`. */
  pending: StoryPending | null
  featured_at: string | null
  approved_at: string | null
  updated_at: string | null
  removed: boolean
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

/** GET /v1/me — soma/sql/soma-user-me-query.sql. Served from the session's entry in Redis on
 *  Soma's side; `candidates` are GET /v1/me/candidates, polled with the bell. */
export type Me = {
  id: string
  handle: string
  display_name: string | null
  /** One line, ≤ 160. */
  bio: string | null
  role: string
  created_at: string
  /** Commenting switched off by an admin: until when (`infinity` for good) and why. Both null
   *  while it is on. */
  comments_off_until: string | null
  comments_off_reason: string | null
}

/** PATCH /v1/me — soma/sql/soma-user-me-update-read.sql: the account, without the switch or the
 *  candidates. */
export type MeUpdated = Pick<Me, 'id' | 'handle' | 'display_name' | 'bio' | 'role' | 'created_at'>

export type ProfileVersion = {
  version_id: string
  version: number
  class: WeightClass | null
  size_bytes: number | null
  memory_bytes: number | null
  status: ModelStatus
  created_at: string
  ratings: Ratings
}

/** One of a competitor's models, within one game and season. */
export type ProfileModel = {
  model_id: string
  model: string
  retired: boolean
  /** Its newest counted match in that season, for the card's picture. */
  latest_match: MatchRef | null
  versions: ProfileVersion[]
}

/** A podium place a closed season froze: soma/sql/soma-pub-profile-get-query.sql. */
export type Medal = {
  game: string
  /** The season's slug. */
  season: string
  season_name: string
  ladder: Ladder
  /** 1, 2 or 3. */
  place: number
  model_id: string
  model: string
  version: number
}

/** Public, so it carries only `active`, `disabled` and `superseded`: a candidate mid-trial and
 *  a rejected version reach their owner through GET /v1/models and /v1/me/versions/{id}. */
export type ProfileGame = {
  game: string
  game_name: string
  season: string
  season_name: string
  season_state: SeasonState
  models: ProfileModel[]
}

/** GET /v1/profiles/{username} — soma/sql/soma-pub-profile-get-query.sql. */
export type Profile = {
  handle: string
  display_name: string | null
  bio: string | null
  /** Newest season first. */
  medals: Medal[]
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
  /** Two one-shot PUT URLs, good until the version's upload window closes, thirty minutes after
   *  its first POST: the platform holds no bytes of its own, so the competitor uploads the two
   *  files it just declared the hashes of. Absent when the submission was refused. Asking again
   *  with the same two hashes inside the window mints fresh ones, expiring at the same time. */
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
// Read off `soma-admin-runners-list`'s one query. `live` is computed there and is the whole
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
  /** Reported with the token: the longest match its channel holds, and the seats it asks at once;
   *  null before a runner reported them. Soma's claim hands it only matches that fit. */
  match_timeout_ms: number | null
  seat_concurrency: number | null
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
  commenting: CommentingSwitch
  /** While `commenting` is `off`: until when (`infinity` for good). */
  comments_off_until: string | null
  /** Their comments by what the desk acts on. */
  comments: { held: number; reported: number; removed: number }
}

export type CommentingSwitch = 'on' | 'off'

export type AdminUserList = {
  /** Every admin, never filtered. */
  admins: AdminUser[]
  /** Competitors matching `q`, most recently seen first, at most 50. */
  users: AdminUser[]
  /** How many competitors match `q` in all. */
  matching: number
}

export type RoleChange = { changed: boolean; id: string; role: UserRole }

/** GET /v1/admin/users/{id} — soma/sql/soma-admin-users-get-query.sql: one user's desk, by id or
 *  handle. Each list is the newest fifty (sessions twenty). */
export type AdminUserDesk = {
  user: {
    id: string
    handle: string
    display_name: string | null
    role: UserRole | 'baseline'
    bio: string | null
    created_at: string
    commenting: CommentingSwitch
    comments_off_until: string | null
    comments_off_reason: string | null
  }
  counts: { live: number; held: number; removed: number; deleted: number; reported: number }
  sessions: {
    issued_at: string
    last_seen_at: string
    expires_at: string
    revoked_at: string | null
    user_agent: string | null
    live: boolean
  }[]
  models: {
    model_id: string
    model: string
    game: string
    retired: boolean
    versions: {
      version_id: string
      version: number
      status: ModelStatus
      class: WeightClass | null
      season: string
      created_at: string
    }[]
  }[]
  comments: {
    id: string
    state: CommentState
    hold_tag: string | null
    body: string
    created_at: string
    decided_at: string | null
    host: ThreadHost
    host_id: string
    reports: number
  }[]
  reports: {
    comment_id: string
    reporter: string
    reason: ReportReason | null
    words: string | null
    at: string
  }[]
  audit: AuditEntry[]
}

/** How long an admin switches commenting off for. */
export type CommentingTerm = 'day' | 'week' | 'month' | 'forever'

/** PATCH /v1/admin/users/{id}/commenting — soma/sql/soma-admin-users-commenting-read.sql, read
 *  after the change. `changed` is false when the switch already stood that way. */
export type CommentingChange = {
  id: string
  handle: string
  commenting: CommentingSwitch
  comments_off_until: string | null
  comments_off_reason: string | null
  changed: boolean
}

// ---- admin · audit and events ----

/** One audit_log line — soma/sql/soma-admin-audit-list-query.sql. `action` is `<thing>.<verb>`
 *  (`season.create`, `comment.remove`); `target_id` is text because seasons and boards go by slug. */
export type AuditEntry = {
  id: string
  at: string
  /** The acting admin's handle. */
  admin: string
  action: string
  target_kind: string
  target_id: string | null
  reason: string | null
  detail: Record<string, unknown>
}
export type AuditPage = { entries: AuditEntry[]; next_cursor: string | null }

/** GET /v1/admin/events — soma/sql/soma-admin-events-query.sql: counted per day, never per person.
 *  Days with nothing counted are absent, not zero. */
export type WatchDay = {
  /** A date, YYYY-MM-DD. */
  day: string
  visits: number
  opened: number
  opened_via: Partial<Record<WatchVia, number>>
  finished: number
}
export type WatchEvents = { since: string; days: WatchDay[] }

// ---- notifications (GET/POST /v1/me/notifications, GET/PATCH /v1/me/notification-settings) ----

export type NotificationCategory = 'submissions' | 'matches' | 'ratings' | 'season' | 'community' | 'account' | 'admin'
/** Picks the icon family. */
export type NotificationKind = 'progress' | 'result' | 'rank' | 'alert' | 'season' | 'account' | 'medal'
  | 'reply' | 'comment' | 'broadcast'
export type NotificationTone = 'info' | 'ok' | 'warn' | 'bad'
export type NotificationLevel = 'all' | 'notable' | 'replies' | 'off'

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
  /** Matches: every rated match, the notable ones (a first place, a strike, a DQ), or none.
   *  Community: replies to you, every comment on your models and matches, or none. */
  level: NotificationLevel | null
}

// ---- community (threads and comments) ----
//
// One thread per host, a match or a model, made on its first comment or lock. A comment is one line
// of plain text, ≤ 500. `held` is visible to its author alone until an admin decides; `removed` is
// an admin's and restorable; `deleted` is the author's. A removed or deleted comment with live
// replies stays as a placeholder with no author and no body.

export type CommentState = 'live' | 'held' | 'removed' | 'deleted'
export type ThreadHost = 'match' | 'model'
export type ReportReason = 'spam' | 'abuse' | 'off_topic' | 'other'

/** comment_json() in soma/migrations/0001_init.sql. */
export type Comment = {
  id: string
  /** Null for a top-level comment. */
  parent_id: string | null
  /** The top-level comment it hangs under; its own id when it is one. */
  root_id: string
  state: CommentState
  /** The listed word (or `link`) a held comment tripped on; null unless held. */
  hold_tag: string | null
  /** Null on a placeholder. */
  body: string | null
  author: string | null
  /** The Owner tag: the author owns the model, or a version seated in the match. */
  owner: boolean
  created_at: string
}

/** A top-level comment with every reply beneath it, oldest reply first. */
export type ThreadRoot = Comment & { replies: Comment[] }

/** GET /v1/threads — soma/sql/soma-pub-threads-query.sql: twenty roots a page, newest first. A
 *  host with no thread yet answers `thread_id: null` and no roots. */
export type Thread = {
  thread_id: string | null
  /** Live comments on the whole thread. */
  comments: number
  locked: boolean
  roots: ThreadRoot[]
  next_cursor: string | null
}

/** Where a comment lives: its host, and the link to it. */
export type CommentHostRef = {
  host: ThreadHost
  host_id: string
  /** The model's name on a model thread; null on a match's. */
  host_name: string | null
  /** An app path: `/matches/<id>#comment-<id>` or `/models/<id>#comment-<id>`. */
  link: string
}

/** GET /v1/profiles/{username}/comments — soma/sql/soma-pub-profile-comments-query.sql. */
export type ProfileComment = Comment & CommentHostRef
export type ProfileComments = { handle: string; comments: ProfileComment[]; next_cursor: string | null }

/** POST /v1/threads/comments → 201 — soma/sql/soma-user-comments-create-read.sql. `state` is
 *  `held` when the text tripped the word list or carries a link. */
export type PostedComment = Comment & { mine: true; host: ThreadHost; host_id: string }

/** GET /v1/me/comments — soma/sql/soma-user-comments-held-query.sql: your held comments on one host,
 *  oldest first, to draw in place for you alone. */
export type HeldComments = { comments: (Comment & { mine: true })[] }

export type NewComment = ({ match: string; model?: never } | { model: string; match?: never }) & {
  /** A live comment in the same thread; a reply to a reply hangs under the same root. */
  parent?: string | null
  body: string
}

/** 429 from POST /v1/threads/comments carries this beside `error` (`too_fast` or `daily_limit`),
 *  and a `Retry-After` header. Read it off ApiError.body. */
export type CommentRateLimit = { error: 'too_fast' | 'daily_limit'; retry_after: number; detail: string }
/** 403 `commenting_off` carries these beside `error`. Read them off ApiError.body. */
export type CommentingOff = { error: 'commenting_off'; until: string; reason: string | null }

// ---- stories, posts and announcements ----

/** One card of GET /v1/stories — soma/sql/soma-pub-stories-query.sql: a published team post or a
 *  featured model story. `excerpt` is the first 280 characters of the text. */
export type StoryCard =
  | {
      kind: 'team'
      id: string
      slug: string
      title: string
      excerpt: string
      author: string
      baseline: false
      /** When it was published. */
      at: string
    }
  | {
      kind: 'model'
      model_id: string
      model: string
      title: string
      excerpt: string
      author: string
      baseline: boolean
      /** The class of the model's newest version. */
      class: WeightClass | null
      /** When it was featured. */
      at: string
    }
export type StoryKind = 'all' | 'team' | 'model'
export type StoryList = {
  kind: StoryKind
  /** First page only. */
  total: number | null
  stories: StoryCard[]
  next_cursor: string | null
}

/** GET /v1/posts/{slug} — soma/sql/soma-pub-posts-get-query.sql. */
export type Post = {
  id: string
  slug: string
  title: string
  body: string
  author: string
  published_at: string
  updated_at: string
}

export type AnnouncementKind = 'notice' | 'season' | 'maintenance' | 'incident'

/** GET /v1/announcements — soma/sql/soma-pub-announcements-query.sql: live ones, newest first.
 *  `link` is a site path or an https:// URL. */
export type Announcement = {
  id: string
  kind: AnnouncementKind
  body: string
  link: string | null
  dismissable: boolean
  ends_at: string | null
  published_at: string
}
export type AnnouncementList = { announcements: Announcement[] }

// ---- admin · comments, threads and the word list ----

export type CommentView = 'held' | 'reported' | 'all'

/** One row of the comment desk — soma/sql/soma-admin-comments-list-query.sql: the whole comment,
 *  whatever its state, with its reports. */
export type AdminComment = {
  id: string
  state: CommentState
  hold_tag: string | null
  body: string
  parent_id: string | null
  root_id: string
  created_at: string
  decided_at: string | null
  decided_by: string | null
  author: { id: string; handle: string; commenting_off_until: string | null }
  host: ThreadHost
  host_id: string
  host_name: string | null
  thread: { id: string; locked: boolean }
  reports: {
    count: number
    /** Per reason; a report with none is counted under `none`. */
    reasons: Partial<Record<ReportReason | 'none', number>>
    /** The newest ten. */
    recent: { reporter: string; reason: ReportReason | null; words: string | null; at: string }[]
  }
}

/** GET /v1/admin/comments. `next_cursor` is a keyset for `all` and an offset for the other two. */
export type AdminCommentPage = {
  view: CommentView
  /** The tab counts, whatever the view and the search. */
  counts: { held: number; reported: number }
  comments: AdminComment[]
  next_cursor: string | null
}

export type CommentDecision = 'approve' | 'remove' | 'restore'

/** POST /v1/admin/comments/decide — soma/sql/soma-admin-comments-decide-read.sql: every id asked
 *  about as it stands now, and how many moved. An id in the wrong state for the action is left. */
export type CommentDecided = {
  action: CommentDecision
  comments: { id: string; state: CommentState; decided_at: string | null }[]
  decided: number
}

/** PATCH /v1/admin/threads — soma/sql/soma-admin-threads-lock-read.sql. `changed` is false when it
 *  already stood that way. */
export type ThreadLock = {
  thread_id: string
  host: ThreadHost
  host_id: string
  comments: number
  locked: boolean
  locked_at: string | null
  locked_by: string | null
  changed: boolean
}

/** soma/sql/soma-admin-words-list-query.sql. Words are stored lower-case. */
export type ListedWord = { id: string; word: string; added_by: string; added_at: string }
export type WordList = { words: ListedWord[] }

// ---- admin · posts, stories, announcements, Notify, picks ----

/** GET /v1/admin/posts — soma/sql/soma-admin-posts-list-query.sql: the newest 500, drafts
 *  included, without their text. */
export type AdminPostRow = {
  id: string
  slug: string
  title: string
  author: string
  published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}
export type AdminPostList = { posts: AdminPostRow[] }
/** One post, draft included — soma/sql/soma-admin-shared-post.sql. */
export type AdminPost = AdminPostRow & { body: string }

export type StoryAction = 'feature' | 'unfeature' | 'approve' | 'reject' | 'remove' | 'restore'

/** One story on the admin desk — soma/sql/soma-admin-shared-stories.sql. A held edit comes whole in
 *  `pending`. */
export type AdminStory = {
  model_id: string
  model: string
  owner: string
  baseline: boolean
  /** The approved text; null while only a held edit exists. */
  title: string | null
  excerpt: string | null
  held: boolean
  pending: StoryPending | null
  featured: boolean
  featured_at: string | null
  removed: boolean
  removed_at: string | null
  approved_at: string | null
  updated_at: string
}
export type AdminStoryList = { stories: AdminStory[] }

/** soma/sql/soma-admin-shared-announcements.sql: live first, then past, newest first. */
export type AdminAnnouncement = Announcement & {
  live: boolean
  published_by: string
  disabled_by: string | null
  disabled_at: string | null
}
export type AdminAnnouncementList = { announcements: AdminAnnouncement[] }

/** Chips that combine as a union. `class` narrows a season's submitters; baselines never receive. */
export type NotifyAudience = {
  everyone?: boolean
  game?: string
  season?: string
  class?: Exclude<Ladder, 'open'>
  /** 1..100 model ids: each model's owner. */
  models?: string[]
  /** 1..500 handles. */
  handles?: string[]
}

/** POST /v1/admin/notify/count — soma/sql/soma-admin-shared-audience.sql. `audience` is everyone the
 *  chips name; `recipients` those of them who take season notifications, which is who a send reaches. */
export type NotifyCount = { audience: number; recipients: number }

/** One send — soma/sql/soma-admin-shared-sends.sql. */
export type NotifySend = {
  id: string
  subject: string
  link: string | null
  audience: NotifyAudience
  sent_by: string
  sent_at: string
  recipients: number
  /** Recipients who have read it. */
  read: number
}
export type NotifySendList = { sends: NotifySend[] }

/** A pick on the admin desk — soma/sql/soma-admin-shared-picks.sql. Across every game. */
export type AdminPick = StaffPick & { pinned_by: string; pinned_at: string }
export type AdminPickList = { picks: AdminPick[] }
