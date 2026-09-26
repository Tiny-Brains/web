// The home page: two pages behind one address, both about the season in the switcher.
//
// A COMPETITOR (signed in, with a model entered in this season) gets their desk: the season in one
// line, a card per model (rating, ranks, the day's move, the season's line, the last ten results),
// the versions in admission, the season's progress beside the ladder around their best model, and
// their own matches. A competitor sees no match they did not play.
//
// A VISITOR (signed out, or signed in with no model this season) gets the pitch beside one featured
// match, the top ten, and six matches from the last day worth watching. A signed-in competitor with
// no model this season sees the same page with the pitch turned into "enter your first model".
//
// Worth watching is three sorted reads of GET /v1/matches (upset, closest, top ten), two of each,
// interleaved and deduplicated, with the staff picks ahead of them when there are any. The featured
// replay is the first of that list, so the hero and the list never disagree about what is best.
//
// Game and season are a selection, not a route. The ladder tab (`?ladder=`) and the progress mode
// (`?progress=rank`) live in the address; both are omitted at their defaults.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  api,
  type ApiError,
  type Candidate,
  type LeaderboardEntry,
  type LeaderboardSeries,
  type MatchSeat,
  type MatchSummary,
  type MyMatchCard,
  type MyModel,
  type MyVersion,
  type SeriesVersion,
  type WeightClass,
} from '../api'
import { useApi, type Async } from '../lib/useApi'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useSelection, useQueryState } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { useNotifications } from '../providers/notifications-context'
import { bytes, cap, date, daysUntil, num, rating as fmtRating } from '../lib/format'
import { byPlace, matchWhen } from '../lib/match'
import { modelPath, versionPath } from '../lib/paths'
import { kStyle } from '../lib/weight-classes'
import { cx } from '../lib/cx'
import { count, fill } from '../lib/copy'
import { Shell } from '../components/Shell'
import {
  Badge,
  DataTable,
  EmptyState,
  Icon,
  IconLabel,
  Notice,
  Panel,
  PanelFoot,
  PanelHead,
  Rich,
  Section,
  Segmented,
  Skel,
  StepTracker,
  type Column,
  type Step,
} from '../components/ui'
import { ClassBadge, ModelLink, Owner, RatingValue, SeasonBadge, Trend, VersionBadge } from '../components/Model'
import { LadderTabs } from '../components/LadderTabs'
import { Replay } from '../components/Replay'
import { FrameThumb } from '../components/Viewer'
import { AskForHelp } from '../components/Help'
import { InlineError } from '../components/ErrorStates'
import T from '../../copy/home.json'

const TOP = 10
const WATCH_ROWS = 6
const PER_REASON = 2
const AROUND = 3
const RESULTS = 10
const DAY_MS = 86_400_000
const SPARK_POINTS = 24
/** The board's height in the hero; the player adds its bars under it. One CSS length, so a resize
 *  never decodes the match again. */
const FEATURE_STAGE = 'clamp(240px, 32vw, 520px)'
const FEATURE_HEIGHT = `calc(${FEATURE_STAGE} + 96px)`
/** A competitor's models, one hue each in this fixed order, never cycled: the Progress lines and
 *  the card lines draw a model in the same hue. Past the sixth a model has no line. */
const SERIES = ['var(--accent)', 'var(--cerebellum)', 'var(--parietal)', 'var(--occipital)', 'var(--temporal)', 'var(--stem)']

type Reason = 'pick' | 'top' | 'upset' | 'close'
type Worth = { m: MatchSummary; why: Reason }
/** One model's card: the version that stands for it this season, and its hue. */
type Card = { m: MyModel; v: MyVersion; color: string | null }
type Mode = 'rating' | 'rank'

export default function Home() {
  const { season, slug, live } = usePlatform()
  const { session, me } = useSession()
  const { candidates } = useNotifications()
  // Read once: a key built from the clock would fetch again on every render.
  const [dayAgo] = useState(() => new Date(Date.now() - DAY_MS).toISOString())
  const mine = useApi(`home-mine:${slug}:${me?.id ?? ''}`, () => api.myModels(slug), Boolean(me))
  const here = season?.slug ?? null
  const cards = useMemo(() => cardsOf(mine.data ?? [], here), [mine.data, here])
  const entered = (mine.data ?? []).some((m) => !m.retired && m.versions.some((v) => v.season === here && v.status !== 'rejected'))

  // A visitor's page while the session is still being asked: most readers are visitors, and a
  // competitor's desk has a placeholder of its own once we know.
  const view =
    session.state === 'loading' || !me
      ? 'visitor'
      : mine.state === 'loading' || (mine.state === 'ready' && !season)
        ? 'desk-loading'
        : mine.state === 'ready' && entered
          ? 'desk'
          : 'visitor'

  return (
    <Shell scoped>
      <div className="wrap stack home">
        {view === 'visitor' ? (
          <Visitor newcomer={Boolean(me) && mine.state === 'ready'} modelsError={me && mine.state === 'error' ? mine.error : null} dayAgo={dayAgo} />
        ) : (
          // A version in admission belongs to the live season, so a past season's desk shows none.
          <Desk cards={view === 'desk' ? cards : null} inFlight={live ? candidates.filter((c) => c.game === slug) : []} dayAgo={dayAgo} />
        )}
      </div>
    </Shell>
  )
}

/** Per model, the version of this season that stands for it: an active one first, then the best
 *  Open rating. A retired model, and one with nothing rated yet, has no card. Best rank first. */
function cardsOf(models: MyModel[], season: string | null): Card[] {
  if (!season) return []
  const out: { m: MyModel; v: MyVersion }[] = []
  for (const m of models) {
    if (m.retired) continue
    const vs = m.versions.filter((v) => v.season === season && v.ratings?.open)
    if (!vs.length) continue
    vs.sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.ratings.open.rating - a.ratings.open.rating)
    out.push({ m, v: vs[0] })
  }
  out.sort((a, b) => a.v.ratings.open.rank - b.v.ratings.open.rank)
  return out.map((c, i) => ({ ...c, color: SERIES[i] ?? null }))
}

// ---- the season, in facts -------------------------------------------------------------------

/** Days left, models, and on the visitor's pitch the matches played and playing now. */
function Facts({ full }: { full: boolean }) {
  const { season, live, slug } = usePlatform()
  // Playing now has its own uncached route (Soma keeps it out of the cached season document), so
  // it is read only here, where it is drawn, and only on the visitor's pitch.
  const playing = useApi(`home-playing:${slug}:${season?.slug ?? ''}`, () => api.playing(slug, season?.slug ?? ''), Boolean(full && season))
  if (!season) {
    return (
      <ul className="home-facts" aria-busy="true">
        <li>
          <Skel w={220} />
        </li>
      </ul>
    )
  }
  const left = daysUntil(season.submissions_close_at)
  return (
    <ul className="home-facts">
      {live && left !== null && left >= 0 ? (
        <li>
          <Icon id="i-clock" />
          <Rich text={count(T.facts.daysLeft, left, { n: num(left) })} />
        </li>
      ) : season.closed_at ? (
        <li>
          <Icon id="i-calendar" />
          {fill(T.facts.closed, { date: date(season.closed_at) })}
        </li>
      ) : null}
      <li>
        <Icon id="i-leaderboard" />
        <Rich text={count(T.facts.models, season.entries, { n: num(season.entries) })} />
      </li>
      {full ? (
        <>
          <li>
            <Icon id="i-matches" />
            <Rich text={count(T.facts.matches, season.matches_played, { n: num(season.matches_played) })} />
          </li>
          {(playing.data?.playing ?? 0) > 0 ? (
            <li className="live">
              <Icon id="i-live" />
              <Rich text={fill(T.facts.playing, { n: num(playing.data?.playing ?? 0) })} />
            </li>
          ) : null}
        </>
      ) : null}
    </ul>
  )
}

// ============================================================================================
// The visitor's page
// ============================================================================================

function Visitor({ newcomer, modelsError, dayAgo }: { newcomer: boolean; modelsError: ApiError | null; dayAgo: string }) {
  const { season, live, slug, gameName } = usePlatform()
  const { href, season: wanted } = useSelection()
  const [param, setParam] = useQueryState()
  const { me } = useSession()
  const classes = useWeightClasses()
  const ladder = param('ladder') || 'open'
  const key = `${slug}:${wanted ?? ''}`
  // The last day of a live season; a closed one has no last day, so it ranks its whole run.
  const since = live ? dayAgo : null

  const open = useApi(`home-open:${key}`, () => api.leaderboard(slug, { ladder: 'open', season: wanted, limit: TOP }))
  const other = useApi(`home-lb:${key}:${ladder}`, () => api.leaderboard(slug, { ladder, season: wanted, limit: TOP }), ladder !== 'open')
  const board = ladder === 'open' ? open : other
  const series = useApi(`home-spark:${key}:${ladder}`, () => api.leaderboardSeries(slug, { ladder, season: wanted, points: SPARK_POINTS }))

  const upset = useApi(`home-upset:${key}:${since ?? ''}`, () => api.matches({ game: slug, season: wanted, sort: 'upset', since, limit: PER_REASON }))
  const close = useApi(`home-close:${key}:${since ?? ''}`, () => api.matches({ game: slug, season: wanted, sort: 'closest', since, limit: PER_REASON }))
  const top = useApi(`home-top:${key}:${since ?? ''}`, () => api.matches({ game: slug, season: wanted, top: true, since, limit: PER_REASON }))
  const picks = useApi(`home-picks:${slug}`, () => api.picks(slug))

  const reads = [top, upset, close]
  const watchState: 'loading' | 'ready' | 'error' = reads.some((r) => r.state === 'loading') || picks.state === 'loading'
    ? 'loading'
    : reads.every((r) => r.state === 'error')
      ? 'error'
      : 'ready'
  const watch = useMemo(
    () =>
      worthWatching(
        (picks.data?.picks ?? []).filter((p) => p.season === season?.slug),
        top.data?.matches ?? [],
        upset.data?.matches ?? [],
        close.data?.matches ?? [],
      ),
    [picks.data, top.data, upset.data, close.data, season?.slug],
  )
  const featuredId = watchState === 'ready' ? (watch[0]?.m.id ?? null) : null
  const featured = useApi(`home-feature:${featuredId ?? ''}`, () => api.match(featuredId!), Boolean(featuredId))
  // Where each version stands on Open now, for a Top ten chip's "#3 v #5".
  const ranks = useMemo(() => new Map((open.data?.entries ?? []).map((e) => [e.version_id, e.rank])), [open.data])

  const sparks = useMemo(() => {
    const out = new Map<string, number[]>()
    for (const v of series.data?.series.versions ?? []) out.set(v.version_id, v.ratings.filter((x): x is number => x !== null))
    return out
  }, [series.data])

  const columns: Column<LeaderboardEntry>[] = [
    { key: 'rank', head: T.ladder.rank, className: 'rank', cell: (r) => <Place rank={r.rank} /> },
    {
      key: 'model',
      head: T.ladder.model,
      cell: (r) => (
        <span className="who">
          <span>
            <ModelLink modelId={r.model_id} name={r.model} version={r.version} />
            {me && r.owner === me.handle ? <span className="you-tag">{T.ladder.you}</span> : null}
          </span>
          <small>
            <Owner handle={r.owner} baseline={r.baseline} />
          </small>
        </span>
      ),
    },
    { key: 'class', head: T.ladder.class, wideOnly: true, cell: (r) => <ClassBadge k={r.class} /> },
    {
      key: 'rating',
      head: T.ladder.rating,
      align: 'right',
      cell: (r) => (
        <span className="lead home-lead">
          <RatingValue value={r.rating} provisional={r.provisional} />
        </span>
      ),
    },
    { key: 'season', head: T.ladder.season, wideOnly: true, className: 'home-spark-col', cell: (r) => <Spark values={sparks.get(r.version_id)} k={r.class} /> },
  ]

  return (
    <>
      {modelsError ? (
        <Notice tone="bad" title={T.errors.modelsTitle}>
          <p>{T.errors.modelsBody}</p>
          <AskForHelp />
        </Notice>
      ) : null}

      <section className="home-hero">
        <div className="home-pitch">
          {newcomer ? (
            <>
              <h1>
                <Rich text={T.pitch.newTitle} />
              </h1>
              <p>{T.pitch.newLede}</p>
              <div className="acts">
                <Link className="btn primary lg" to={href('/submit')}>
                  <Icon id="i-plus" />
                  {T.pitch.submit}
                </Link>
                <a className="btn lg" href={T.pitch.starterHref} target="_blank" rel="noopener noreferrer">
                  <Icon id="i-github" />
                  {T.pitch.starter}
                  <span className="vis-hidden">{T.pitch.newTab}</span>
                </a>
              </div>
            </>
          ) : (
            <>
              <h1>
                <Rich text={T.pitch.title} />
              </h1>
              <p>{classes.length ? fill(T.pitch.lede, { game: gameName, cap: cap(classes[0].max_bytes) }) : fill(T.pitch.ledeNoClasses, { game: gameName })}</p>
              <div className="acts">
                <Link className="btn primary lg" to="/start">
                  {T.pitch.start}
                </Link>
                {/* The book is not a route: nginx answers /docs, so this is a plain link. */}
                <a className="btn lg" href="/docs/">
                  {T.pitch.how}
                </a>
              </div>
            </>
          )}
          <Facts full />
        </div>
        <Featured
          state={watchState}
          worth={watch[0] ?? null}
          match={featured.data}
          failed={featured.state === 'error'}
          ranks={ranks}
        />
      </section>

      <section className="home-two">
        <Panel className="home-lb">
          <PanelHead
            icon="i-leaderboard"
            title={T.ladder.title}
            end={<LadderTabs classes={classes} value={ladder} onPick={(l) => setParam({ ladder: l === 'open' ? '' : l })} />}
          />
          <DataTable
            columns={columns}
            rows={board.data?.entries ?? []}
            state={board.state}
            loadingRows={TOP}
            rowKey={(r) => r.version_id}
            rowClass={(r) => (me && r.owner === me.handle ? 'you' : undefined)}
            empty={T.ladder.empty}
          />
          <PanelFoot>
            <Link to={href('/leaderboard', { ladder: ladder === 'open' ? null : ladder })}>
              <IconLabel icon="i-leaderboard">{ladder === 'open' ? T.ladder.more : fill(T.ladder.moreClass, { class: ladder })} →</IconLabel>
            </Link>
          </PanelFoot>
        </Panel>

        <Panel className="home-watch">
          <PanelHead icon="i-matches" title={T.watch.title} end={live ? T.watch.window : T.watch.windowFinal} />
          {watchState === 'loading' ? (
            <div className="home-wlist" aria-busy="true">
              {Array.from({ length: WATCH_ROWS }, (_, i) => (
                <div className="home-wrow" key={i}>
                  <div className="thumb-box home-thumb skel" />
                  <Skel w="70%" />
                  <Skel w="40%" />
                </div>
              ))}
            </div>
          ) : watchState === 'error' ? (
            <InlineError error={(top.error ?? upset.error ?? close.error)!} what={T.errors.watch} />
          ) : watch.length === 0 ? (
            <EmptyState>{T.watch.empty}</EmptyState>
          ) : (
            <div className="home-wlist">
              {watch.map((w) => (
                <WatchRow w={w} ranks={ranks} key={w.m.id} />
              ))}
            </div>
          )}
          <PanelFoot>
            <Link to={href('/matches')}>
              <IconLabel icon="i-matches">{T.watch.more} →</IconLabel>
            </Link>
          </PanelFoot>
        </Panel>
      </section>
    </>
  )
}

/** Two of each reason, interleaved (top, upset, close, top, upset, close), staff picks ahead of
 *  them, each match once under the first reason that reached it. */
function worthWatching(picks: MatchSummary[], top: MatchSummary[], upset: MatchSummary[], close: MatchSummary[]): Worth[] {
  const seen = new Set<string>()
  const out: Worth[] = []
  const take = (m: MatchSummary | undefined, why: Reason) => {
    if (!m || seen.has(m.id)) return
    seen.add(m.id)
    out.push({ m, why })
  }
  for (const p of picks.slice(0, PER_REASON)) take(p, 'pick')
  for (let i = 0; i < PER_REASON; i++) {
    take(top[i], 'top')
    // A negative or absent upset is no upset: the sort puts real ones first, and the rest are not.
    take(upset[i] && (upset[i].upset ?? 0) > 0 ? upset[i] : undefined, 'upset')
    take(close[i], 'close')
  }
  return out.slice(0, WATCH_ROWS)
}

/** The featured match: the Player tier, playing on open and stopping on its last frame, with why it
 *  was picked under it. The frame keeps one height across loading, empty and ready. */
function Featured({
  state,
  worth,
  match,
  failed,
  ranks,
}: {
  state: 'loading' | 'ready' | 'error'
  worth: Worth | null
  match: Parameters<typeof Replay>[0]['match'] | undefined
  failed: boolean
  ranks: Map<string, number>
}) {
  if (state !== 'loading' && !worth) {
    return (
      <div className="home-feature">
        <div className="replay home-feature-empty" style={{ minHeight: FEATURE_HEIGHT }}>
          <div className="replay-state">
            <b>{T.feature.none}</b>
            <p>{T.feature.noneBody}</p>
          </div>
        </div>
      </div>
    )
  }
  const m = worth?.m ?? null
  const placed = m ? byPlace(m.seats) : []
  const [a, b] = placed
  const name = (s: MatchSeat) => `${s.model} ${fill(T.watch.version, { v: s.version })}`
  const drew = a && b && a.outcome === 'draw'
  return (
    <div className="home-feature">
      {failed ? (
        <div className="replay" style={{ minHeight: FEATURE_HEIGHT }}>
          <div className="replay-state">
            <b>{T.feature.none}</b>
          </div>
        </div>
      ) : (
        <Replay match={match ?? null} tier="player" autoplay stageHeight={FEATURE_STAGE} height={FEATURE_HEIGHT} />
      )}
      <p className="home-why">
        {worth && m && a ? (
          <>
            <ReasonChip w={worth} ranks={ranks} />
            <span>
              {placed.length > 2 ? (
                <Rich text={count(T.feature.won, placed.length - 1)} vars={{ a: name(a) }} />
              ) : b ? (
                <Rich text={drew ? T.feature.drew : T.feature.beat} vars={{ a: name(a), b: name(b) }} />
              ) : null}
              {' · '}
              {m.map}
              {' · '}
              {matchWhen(m).text}
            </span>
            <Link to={`/matches/${m.id}`} state={{ via: 'tv' }}>
              {T.feature.open}
            </Link>
          </>
        ) : (
          <Skel w={320} />
        )}
      </p>
    </div>
  )
}

/** A row of Worth watching: the Thumb, the two leading seats, one reason, the time, the score. */
function WatchRow({ w, ranks }: { w: Worth; ranks: Map<string, number> }) {
  const m = w.m
  const placed = byPlace(m.seats)
  const [a, b] = placed
  return (
    <Link className="home-wrow" to={`/matches/${m.id}`} state={{ via: 'shelf' }}>
      <FrameThumb id={m.id} game={m.game} season={m.season} map={m.map} hasFrame={m.frame} className="home-thumb" />
      <span className="home-wrow-t">
        {a ? (
          <>
            {a.model} <span className="v">{fill(T.watch.version, { v: a.version })}</span>
            {placed.length === 2 && b ? (
              <>
                <span className="vs">{T.watch.vs}</span>
                {b.model} <span className="v">{fill(T.watch.version, { v: b.version })}</span>
              </>
            ) : (
              <span className="vs">{count(T.watch.andMore, placed.length - 1)}</span>
            )}
          </>
        ) : null}
      </span>
      <span className="home-wrow-sub">
        <ReasonChip w={w} ranks={ranks} />
        <span>{matchWhen(m).text}</span>
      </span>
      <span className="home-wrow-score">
        {a?.score ?? '—'}
        <span className="dash">–</span>
        {b?.score ?? '—'}
      </span>
    </Link>
  )
}

/** One reason per match, told by its icon's shape and its word, never by colour alone. */
function ReasonChip({ w, ranks }: { w: Worth; ranks: Map<string, number> }) {
  const placed = byPlace(w.m.seats)
  let icon: ReactNode
  let text: string
  switch (w.why) {
    case 'pick':
      icon = <Icon id="i-pin" />
      text = T.reasons.pick
      break
    case 'top': {
      icon = <Icon id="i-trophy" />
      const ra = placed[0] ? ranks.get(placed[0].version_id) : undefined
      const rb = placed[1] ? ranks.get(placed[1].version_id) : undefined
      text = ra && rb ? fill(T.reasons.topRanks, { a: ra, b: rb }) : T.reasons.top
      break
    }
    case 'upset':
      icon = <Icon id="i-swing" />
      text = fill(T.reasons.upset, { n: fmtRating(w.m.upset) })
      break
    default:
      icon = <EqualIcon />
      text = w.m.margin !== null ? fill(T.reasons.closeBy, { n: w.m.margin }) : T.reasons.close
  }
  return (
    <span className={cx('home-reason', w.why)} title={T.reasons.tips[w.why]}>
      {icon}
      {text}
    </span>
  )
}

/** Close: two level bars. Drawn here because the sprite has no such shape (i-draw means a drawn
 *  match, which a close one is not). */
function EqualIcon() {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 9h14M5 15h14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

/** A ladder place: a medal on one to three. The number is the word, so the medal is decoration. */
function Place({ rank }: { rank: number }) {
  if (rank > 3) return <>{rank}</>
  return (
    <span className={cx('rank top home-medal', `m${rank}`)}>
      <Icon id="i-medal" />
      {rank}
    </span>
  )
}

/** A row's season line, in the class's hue. */
function Spark({ values, k }: { values: number[] | undefined; k: WeightClass | null }) {
  if (!values || values.length < 2) return null
  const w = 96
  const h = 24
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const pts = values.map((v, i) => [2 + (i / (values.length - 1)) * (w - 4), 3 + (1 - (v - lo) / span) * (h - 6)])
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg
      className="spark home-spark"
      width={w}
      height={h}
      role="img"
      aria-label={fill(T.ladder.spark, { first: fmtRating(values[0]), last: fmtRating(values[values.length - 1]) })}
      style={kStyle(k)}
    >
      <polyline points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} />
      <circle cx={lx} cy={ly} r={3} />
    </svg>
  )
}

// ============================================================================================
// The competitor's desk
// ============================================================================================

function Desk({ cards, inFlight, dayAgo }: { cards: Card[] | null; inFlight: Candidate[]; dayAgo: string }) {
  const { slug, live, season, gameName } = usePlatform()
  const { href, season: wanted } = useSelection()
  const { me } = useSession()
  const [param, setParam] = useQueryState()
  const mode: Mode = param('progress') === 'rank' ? 'rank' : 'rating'
  const key = `${slug}:${wanted ?? ''}`
  const has = Boolean(cards?.length)

  const series = useApi(`home-series:${key}`, () => api.leaderboardSeries(slug, { ladder: 'open', season: wanted }), has)
  // The day's move, from two edges: a day ago and now. A closed season has no today.
  const day = useApi(`home-day:${key}:${dayAgo}`, () => api.leaderboardSeries(slug, { ladder: 'open', season: wanted, since: dayAgo, points: 2 }), has && live)

  const lines = useMemo(() => {
    const out = new Map<string, (number | null)[]>()
    if (series.data) for (const c of cards ?? []) out.set(c.m.id, byModel(series.data.series.versions, c.m.id, 'rating'))
    return out
  }, [series.data, cards])
  const today = useMemo(() => {
    const out = new Map<string, number>()
    if (day.data)
      for (const c of cards ?? []) {
        const [then, now] = byModel(day.data.series.versions, c.m.id, 'rating')
        if (then !== null && then !== undefined && now !== null && now !== undefined) out.set(c.m.id, now - then)
      }
    return out
  }, [day.data, cards])

  return (
    <>
      <div className="home-seasonline">
        {season ? (
          <span className="home-seasonline-name">
            <b>{gameName}</b> · <b>{season.name}</b> <SeasonBadge state={season.state} />
          </span>
        ) : (
          <Skel w={200} />
        )}
        <Facts full={false} />
      </div>

      <Section title={T.models.title} more={me ? { label: T.models.profile, to: `/profile/${me.handle}` } : undefined}>
        {cards === null ? (
          <div className="home-models" aria-busy="true">
            {[0, 1].map((i) => (
              <div className="panel home-card" key={i}>
                <Skel w="50%" />
                <div className="skel home-card-skel" />
                <Skel w="80%" />
              </div>
            ))}
          </div>
        ) : cards.length ? (
          <div className="home-models">
            {cards.map((c) => (
              <ModelCard card={c} line={series.state === 'ready' ? (lines.get(c.m.id) ?? []) : series.state === 'error' ? [] : null} today={today.get(c.m.id) ?? null} key={c.m.id} />
            ))}
          </div>
        ) : (
          <EmptyState boxed>{T.models.empty}</EmptyState>
        )}
      </Section>

      {inFlight.length ? (
        <Section title={T.flight.title}>
          <div className="stack tight">
            {inFlight.map((c) => (
              <InFlight c={c} key={c.version_id} />
            ))}
          </div>
        </Section>
      ) : null}

      {cards === null || cards.length ? (
        <section className="home-two">
          <Panel className="home-progress">
            <PanelHead
              title={T.progress.title}
              end={
                <Segmented
                  label={T.progress.mode}
                  value={mode}
                  onChange={(k) => setParam({ progress: k === 'rank' ? 'rank' : '' })}
                  items={[
                    { key: 'rating', label: T.progress.rating },
                    { key: 'rank', label: T.progress.rank },
                  ]}
                />
              }
            />
            <Progress cards={cards} series={series} mode={mode} />
          </Panel>
          <Around best={cards?.[0] ?? null} loading={cards === null} />
        </section>
      ) : null}

      <YourMatches href={href('/matches', { mine: 1 })} />
    </>
  )
}

/** One model's value at each edge, over all its versions this season: the best rating (or rank)
 *  any of them held, so a new version carries the line on from the one it replaced. */
function byModel(versions: SeriesVersion[], modelId: string, pick: Mode): (number | null)[] {
  const vs = versions.filter((v) => v.model_id === modelId)
  if (!vs.length) return []
  const n = Math.max(...vs.map((v) => v.ratings.length))
  return Array.from({ length: n }, (_, i) => {
    let best: number | null = null
    for (const v of vs) {
      const x = pick === 'rating' ? v.ratings[i] : v.ranks[i]
      if (x === null || x === undefined) continue
      if (best === null || (pick === 'rating' ? x > best : x < best)) best = x
    }
    return best
  })
}

/** Follows an element's width, for a chart drawn in pixels rather than stretched. */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const seen = new ResizeObserver((entries) => setW(Math.round(entries[0]?.contentRect.width ?? 0)))
    seen.observe(el)
    return () => seen.disconnect()
  }, [ref])
  return w
}

// ---- your models ------------------------------------------------------------------------------

function ModelCard({ card, line, today }: { card: Card; line: (number | null)[] | null; today: number | null }) {
  const { m, v, color } = card
  const open = v.ratings.open
  const klass = v.class ? v.ratings[v.class] : undefined
  const results = useApi(`home-res:${m.id}:${v.season}`, () => api.matches({ game: m.game, season: v.season, model: m.id, limit: RESULTS }))
  const played = (results.data?.matches ?? []).filter((x) => x.status === 'rated' || x.status === 'finished')
  const style = { ...kStyle(v.class), '--c': color ?? 'var(--muted)' } as CSSProperties
  return (
    <Link className="panel home-card" to={modelPath(m.id)} style={style}>
      <div className="home-card-head">
        <b>
          {m.name} <span className="v">{fill(T.models.version, { v: v.version })}</span>
        </b>
        <ClassBadge k={v.class} />
        <span className="muted">{bytes(v.size_bytes)}</span>
        <VersionBadge status={v.status} />
      </div>
      <div className="home-card-nums">
        <span className="home-big">
          <RatingValue value={open?.rating} provisional={open?.provisional} />
        </span>
        {open ? (
          <span className="home-rk">
            <b>#{open.rank}</b>
            {T.models.open}
          </span>
        ) : null}
        {klass && v.class ? (
          <span className="home-rk">
            <b>#{klass.rank}</b>
            {v.class}
          </span>
        ) : null}
        <Today value={today} />
      </div>
      <ModelLine values={line} name={m.name} />
      <div className="home-card-foot">
        <span className="home-results" role="list" aria-label={T.models.results}>
          {results.state === 'loading'
            ? Array.from({ length: RESULTS }, (_, i) => <span className="skel" aria-hidden="true" key={i} />)
            : played.map((x) => {
                const r = resultOf(x.seats, x.seats.find((s) => s.model_id === m.id))
                return r ? (
                  <span className={cx('home-res', r.tone)} title={r.title} role="listitem" key={x.id}>
                    {r.word}
                  </span>
                ) : null
              })}
        </span>
        <span className="home-count">{count(T.models.matches, open?.matches ?? 0, { n: num(open?.matches ?? 0) })}</span>
      </div>
    </Link>
  )
}

/** The day's move beside the rating: an arrow shape and a number, never colour alone. */
function Today({ value }: { value: number | null }) {
  if (value === null) return null
  const d = Math.round(value * 10) / 10
  if (d === 0)
    return (
      <span className="trend flat home-today" aria-label={T.models.todayFlatLabel}>
        {T.models.todayFlat}
      </span>
    )
  const n = Math.abs(d).toFixed(1)
  return d > 0 ? (
    <span className="trend up home-today" aria-label={fill(T.models.todayUpLabel, { n })}>
      {fill(T.models.todayUp, { n })}
    </span>
  ) : (
    <span className="trend down home-today" aria-label={fill(T.models.todayDownLabel, { n })}>
      {fill(T.models.todayDown, { n })}
    </span>
  )
}

/** The card's season line, in the model's hue, as wide as the card. */
function ModelLine({ values, name }: { values: (number | null)[] | null; name: string }) {
  const box = useRef<HTMLDivElement>(null)
  const w = useWidth(box)
  const h = 46
  const known = (values ?? []).map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null)
  let body: ReactNode = null
  if (values === null) body = <div className="skel home-card-skel" />
  else if (known.length >= 2 && w > 0) {
    const lo = Math.min(...known.map((p) => p[1]))
    const hi = Math.max(...known.map((p) => p[1]))
    const span = hi - lo || 1
    const n = values.length
    const pts = known.map(([i, v]) => [5 + (i / Math.max(1, n - 1)) * (w - 10), 5 + (1 - (v - lo) / span) * (h - 10)])
    const [lx, ly] = pts[pts.length - 1]
    body = (
      <svg width={w} height={h} role="img" aria-label={fill(T.models.line, { model: name, first: fmtRating(known[0][1]), last: fmtRating(known[known.length - 1][1]) })}>
        <polyline points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} />
        <circle cx={lx} cy={ly} r={4} />
      </svg>
    )
  }
  return (
    <div className="home-line" ref={box}>
      {body}
    </div>
  )
}

type Result = { word: string; tone: 'w' | 'l' | 'd' | ''; title: string }

/** W, L or D for two seats; a place such as 2/4 for more; DQ for a disqualified seat. */
function resultOf(seats: { rank: number | null; outcome: MatchSeat['outcome'] }[], mine: { rank: number | null; outcome: MatchSeat['outcome'] } | undefined): Result | null {
  if (!mine) return null
  const R = T.results
  if (mine.outcome === 'dq') return { word: R.dq, tone: 'l', title: R.dqTitle }
  if (seats.length === 2) {
    if (mine.outcome === 'win') return { word: R.win, tone: 'w', title: R.winTitle }
    if (mine.outcome === 'loss') return { word: R.loss, tone: 'l', title: R.lossTitle }
    if (mine.outcome === 'draw') return { word: R.draw, tone: 'd', title: R.drawTitle }
    return null
  }
  if (mine.rank === null) return null
  const vars = { place: mine.rank, of: seats.length }
  return { word: fill(R.place, vars), tone: mine.rank === 1 ? 'w' : '', title: fill(R.placeTitle, vars) }
}

// ---- in flight ----------------------------------------------------------------------------------

/** Submitted, Admitted, Trial, Playing: where a version in admission stands. */
function InFlight({ c }: { c: Candidate }) {
  const S = T.flight.steps
  const at = c.phase === 'awaiting_trial' ? 2 : 1
  const steps: Step[] = [S.submitted, S.admitted, S.trial, S.playing].map((label, i) => ({
    label,
    tone: i < at ? 'done' : i === at ? 'now' : 'todo',
  }))
  return (
    <Link className="panel home-flight" to={versionPath(c.model_id, c.version)}>
      <h3>
        {c.model} <span className="muted">{fill(T.flight.version, { v: c.version })}</span>
      </h3>
      <StepTracker steps={steps} />
      <Badge tone="wait">{T.flight.phase[c.phase]}</Badge>
    </Link>
  )
}

// ---- progress -----------------------------------------------------------------------------------

const PAD = { l: 48, r: 150, t: 16, b: 30 }
const CHART_H = 300
const CHART_MIN_W = 560

/** A step of 1, 2 or 5 times a power of ten that cuts `span` into about `want` pieces. */
function niceStep(span: number, want: number): number {
  const raw = span / want || 1
  const p = 10 ** Math.floor(Math.log10(raw))
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p
  return 10 * p
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Your models' rating (or rank) on Open over the season, one line each, with the rating that holds
 *  #10 today as a dashed line to beat. A crosshair reads every model at the edge it snaps to, by
 *  pointer or by the arrow keys; the table under it says the same without either. */
function Progress({ cards, series, mode }: { cards: Card[] | null; series: Async<LeaderboardSeries>; mode: Mode }) {
  const box = useRef<HTMLDivElement>(null)
  const width = useWidth(box)
  const [at, setAt] = useState<number | null>(null)

  let body: ReactNode
  if (cards === null || series.state === 'loading') body = <div className="skel home-pchart-skel" />
  else if (series.state === 'error') body = <InlineError error={series.error} what={T.errors.series} />
  else {
    const versions = series.data.series.versions
    const edges = series.data.series.edges
    const n = edges.length
    const last = n - 1
    const lines = cards
      .filter((c) => c.color)
      .map((c) => ({ id: c.m.id, name: c.m.name, color: c.color!, values: byModel(versions, c.m.id, mode) }))
    const all = lines.flatMap((l) => l.values).filter((x): x is number => x !== null)
    const tenth = versions.find((v) => v.ranks[last] === TOP)
    const ref = mode === 'rating' ? (tenth?.ratings[last] ?? null) : tenth ? TOP : null
    if (n < 2 || !all.length) body = <EmptyState>{T.progress.empty}</EmptyState>
    else {
      const W = Math.max(CHART_MIN_W, width)
      const H = CHART_H
      const plotW = W - PAD.l - PAD.r
      const plotH = H - PAD.t - PAD.b
      const withRef = ref === null ? all : [...all, ref]
      let lo: number
      let hi: number
      let ticks: number[]
      let y: (v: number) => number
      if (mode === 'rating') {
        const min = Math.min(...withRef)
        const max = Math.max(...withRef)
        const pad = Math.max(0.5, (max - min) * 0.08)
        lo = min - pad
        hi = max + pad
        const step = niceStep(hi - lo, 5)
        ticks = []
        for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(Math.round(t * 100) / 100)
        y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * plotH
      } else {
        lo = 1
        hi = Math.max(...withRef) + 1
        const step = Math.max(1, Math.round(niceStep(hi - 1, 4)))
        ticks = [1]
        for (let t = step; t <= hi; t += step) if (t > 1) ticks.push(t)
        y = (v) => PAD.t + ((v - lo) / (hi - lo)) * plotH
      }
      const x = (i: number) => PAD.l + (i / last) * plotW
      const xTicks = [...new Set([0, 1, 2, 3, 4].map((k) => Math.round((k * last) / 4)))]
      const say = (v: number) => (mode === 'rating' ? fmtRating(v) : fill(T.progress.rankValue, { n: v }))

      // End labels, dropped rather than stacked where two would collide: the legend names them all.
      const ends = lines
        .map((l) => {
          let i = last
          while (i >= 0 && l.values[i] === null) i--
          return i < 0 ? null : { l, i, v: l.values[i]!, y: y(l.values[i]!) }
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .sort((a, b) => a.y - b.y)
      const labelled = new Set<string>()
      let prev = -Infinity
      for (const e of ends) {
        if (e.y - prev >= 15) {
          labelled.add(e.l.id)
          prev = e.y
        }
      }

      const pickAt = (e: PointerEvent<SVGSVGElement>) => {
        const r = e.currentTarget.getBoundingClientRect()
        const i = Math.round(((e.clientX - r.left - PAD.l) / plotW) * last)
        setAt(Math.min(last, Math.max(0, i)))
      }
      const step = (e: KeyboardEvent<SVGSVGElement>) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        setAt((a) => Math.min(last, Math.max(0, (a ?? last) + (e.key === 'ArrowLeft' ? -1 : 1))))
      }
      const tipLeft = at === null ? 0 : x(at) + 190 > W ? x(at) - 190 : x(at) + 12
      const caption = mode === 'rating' ? T.progress.caption : T.progress.captionRank

      body = (
        <figure className="home-figure">
          {lines.length > 1 ? (
            <ul className="home-legend">
              {lines.map((l) => (
                <li style={{ '--c': l.color } as CSSProperties} key={l.id}>
                  <i aria-hidden="true" />
                  {l.name}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="home-pscroll">
            <div className="home-pplot" style={{ width: W }}>
              <svg
                width={W}
                height={H}
                tabIndex={0}
                aria-label={caption}
                onPointerMove={pickAt}
                onPointerLeave={() => setAt(null)}
                onFocus={() => setAt(last)}
                onBlur={() => setAt(null)}
                onKeyDown={step}
              >
                <g className="home-grid">
                  {ticks.map((t) => (
                    <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} key={t} />
                  ))}
                </g>
                {ticks.map((t) => (
                  <text className="home-tick" x={PAD.l - 8} y={y(t) + 4} textAnchor="end" key={t}>
                    {mode === 'rating' ? t : fill(T.progress.rankValue, { n: t })}
                  </text>
                ))}
                {xTicks.map((i) => (
                  <text className="home-tick" x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} key={i}>
                    {shortDate(edges[i])}
                  </text>
                ))}
                {ref !== null ? (
                  <>
                    <line className="home-ref" x1={PAD.l} x2={W - PAD.r} y1={y(ref)} y2={y(ref)} />
                    <text className="home-reflab" x={PAD.l + 8} y={y(ref) - 7}>
                      {mode === 'rating' ? fill(T.progress.ref, { rating: fmtRating(ref) }) : T.progress.refRank}
                    </text>
                  </>
                ) : null}
                {lines.map((l) => (
                  <g style={{ '--c': l.color } as CSSProperties} key={l.id}>
                    {runs(l.values).map((run, k) => (
                      <polyline className="home-ln" points={run.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} key={k} />
                    ))}
                  </g>
                ))}
                {ends.map((e) => (
                  <g style={{ '--c': e.l.color } as CSSProperties} key={e.l.id}>
                    <circle className="home-dot" cx={x(e.i)} cy={e.y} r={4.5} />
                    {labelled.has(e.l.id) ? (
                      <text className="home-endlab" x={x(e.i) + 10} y={e.y + 4}>
                        {e.l.name} <tspan>{say(e.v)}</tspan>
                      </text>
                    ) : null}
                  </g>
                ))}
                {at !== null ? (
                  <g className="home-cross">
                    <line x1={x(at)} x2={x(at)} y1={PAD.t} y2={H - PAD.b} />
                    {lines.map((l) =>
                      l.values[at] !== null && l.values[at] !== undefined ? (
                        <circle className="home-dot" style={{ '--c': l.color } as CSSProperties} cx={x(at)} cy={y(l.values[at]!)} r={4} key={l.id} />
                      ) : null,
                    )}
                  </g>
                ) : null}
              </svg>
              {at !== null ? (
                <div className="home-tip" style={{ left: tipLeft, top: PAD.t }} aria-hidden="true">
                  <small>{shortDate(edges[at])}</small>
                  {lines.map((l) => (
                    <span style={{ '--c': l.color } as CSSProperties} key={l.id}>
                      <i />
                      <b>{l.values[at] === null || l.values[at] === undefined ? '—' : say(l.values[at]!)}</b>
                      {l.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <figcaption className="vis-hidden">
            {caption}
            <table>
              <thead>
                <tr>
                  <th>{T.progress.tableModel}</th>
                  <th>{T.progress.tableNow}</th>
                  <th>{T.progress.tableBest}</th>
                  <th>{T.progress.tableRank}</th>
                </tr>
              </thead>
              <tbody>
                {cards
                  .filter((c) => c.color)
                  .map((c) => {
                    const r = byModel(versions, c.m.id, 'rating').filter((v): v is number => v !== null)
                    return (
                      <tr key={c.m.id}>
                        <td>{c.m.name}</td>
                        <td>{fmtRating(c.v.ratings.open?.rating)}</td>
                        <td>{r.length ? fmtRating(Math.max(...r)) : '—'}</td>
                        <td>{c.v.ratings.open ? fill(T.progress.rankValue, { n: c.v.ratings.open.rank }) : '—'}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </figcaption>
        </figure>
      )
    }
  }

  return (
    <div className="home-pchart" ref={box}>
      {body}
    </div>
  )
}

/** A line's unbroken stretches: an edge where the model stood nowhere breaks it. */
function runs(values: (number | null)[]): [number, number][][] {
  const out: [number, number][][] = []
  let cur: [number, number][] = []
  values.forEach((v, i) => {
    if (v === null || v === undefined) {
      if (cur.length) out.push(cur)
      cur = []
    } else cur.push([i, v])
  })
  if (cur.length) out.push(cur)
  // A lone point is a dot nobody sees as a line; keep it as a two-point stub so it draws.
  return out.map((r) => (r.length === 1 ? [r[0], r[0]] : r))
}

// ---- around you ---------------------------------------------------------------------------------

/** The Open ladder from three places above your best model to three below, and the gap upward. */
function Around({ best, loading }: { best: Card | null; loading: boolean }) {
  const { slug } = usePlatform()
  const { href, season: wanted } = useSelection()
  const { me } = useSession()
  const rank = best?.v.ratings.open?.rank ?? null
  const offset = rank ? Math.max(0, rank - 1 - AROUND) : 0
  const limit = rank ? rank - offset + AROUND : 0
  const rows = useApi(
    `home-around:${slug}:${wanted ?? ''}:${offset}:${limit}`,
    () => api.leaderboard(slug, { ladder: 'open', season: wanted, limit, cursor: String(offset) }),
    rank !== null,
  )
  const entries = rows.data?.entries ?? []
  const at = best ? entries.findIndex((e) => e.version_id === best.v.version_id) : -1
  const above = at > 0 ? entries[at - 1] : null
  const gap = above && at >= 0 ? above.rating - entries[at].rating : null

  const columns: Column<LeaderboardEntry>[] = [
    { key: 'rank', head: T.ladder.rank, className: 'rank', cell: (r) => <Place rank={r.rank} /> },
    {
      key: 'model',
      head: T.ladder.model,
      cell: (r) => (
        <span className="who">
          <ModelLink modelId={r.model_id} name={r.model} version={r.version} />
          <small>
            <Owner handle={r.owner} baseline={r.baseline} />
          </small>
        </span>
      ),
    },
    { key: 'class', head: T.ladder.class, className: 'home-k', cell: (r) => <ClassBadge k={r.class} /> },
    {
      key: 'rating',
      head: T.ladder.rating,
      align: 'right',
      cell: (r) => (
        <span className="lead">
          <RatingValue value={r.rating} provisional={r.provisional} />
        </span>
      ),
    },
    { key: 'last', head: T.ladder.last, align: 'right', cell: (r) => <Trend value={r.trend} /> },
  ]

  return (
    <Panel className="home-around">
      <PanelHead icon="i-leaderboard" title={T.around.title} end={T.around.ladder} />
      {!loading && rank === null ? (
        <EmptyState>{T.around.empty}</EmptyState>
      ) : rows.state === 'error' ? (
        <InlineError error={rows.error} what={T.errors.around} />
      ) : (
        <DataTable
          columns={columns}
          rows={entries}
          state={loading ? 'loading' : rows.state}
          loadingRows={AROUND * 2 + 1}
          rowKey={(r) => r.version_id}
          rowClass={(r) => (me && r.owner === me.handle ? 'you' : undefined)}
        />
      )}
      <PanelFoot
        end={
          <Link to={href('/leaderboard')}>
            <IconLabel icon="i-leaderboard">{T.around.more} →</IconLabel>
          </Link>
        }
      >
        {rows.state !== 'ready' || at < 0 ? null : rank === 1 ? (
          <span>{T.around.lead}</span>
        ) : above && gap !== null ? (
          <span className="home-gap">
            {gap < 0.05 ? fill(T.around.level, { rank: above.rank }) : <Rich text={fill(T.around.gap, { n: fmtRating(gap), rank: above.rank })} />}
          </span>
        ) : null}
      </PanelFoot>
    </Panel>
  )
}

// ---- your matches -------------------------------------------------------------------------------

const MINE_READ = 40

function isQueued(m: MatchSummary): boolean {
  return m.status === 'pending' || m.status === 'claimed' || m.status === 'running'
}

/** Queued pairings on top, then the last ten played, all of this season. The owner's listing
 *  spans every season, so it is read wider than ten and cut here. */
function mineOf(list: MyMatchCard[], season: string | null): MyMatchCard[] {
  const inSeason = list.filter((m) => m.season === season && m.status !== 'cancelled' && m.status !== 'failed')
  return [...inSeason.filter(isQueued), ...inSeason.filter((m) => !isQueued(m)).slice(0, RESULTS)]
}

function YourMatches({ href }: { href: string }) {
  const { slug, season } = usePlatform()
  const { me } = useSession()
  const navigate = useNavigate()
  const read = useApi(`home-my:${slug}:${me?.id ?? ''}`, () => api.myMatches({ game: slug, limit: MINE_READ }), Boolean(me))
  const rows = read.data ? mineOf(read.data.matches, season?.slug ?? null) : []
  const H = T.mine

  return (
    <Panel className="home-mine">
      <PanelHead icon="i-matches" title={H.title} />
      {read.state === 'error' ? (
        <>
          <InlineError error={read.error} what={T.errors.matches} />
          <div className="panel-body">
            <AskForHelp />
          </div>
        </>
      ) : read.state === 'ready' && rows.length === 0 ? (
        <EmptyState>{H.empty}</EmptyState>
      ) : (
        <div className="tscroll">
          <table className="table">
            <thead>
              <tr>
                <th>{H.result}</th>
                <th>{H.model}</th>
                <th className="r">{H.score}</th>
                <th>{H.opponents}</th>
                <th className="home-board">{H.board}</th>
                <th className="r home-when">{H.when}</th>
              </tr>
            </thead>
            <tbody aria-busy={read.state === 'loading' || undefined}>
              {read.state === 'loading'
                ? Array.from({ length: 5 }, (_, i) => (
                    <tr key={i}>
                      {[26, 90, 42, 120, 110, 42].map((w, c) => (
                        <td className={c === 4 ? 'home-board' : c === 5 ? 'home-when' : undefined} key={c}>
                          <Skel w={w} />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((m) => {
                    const mine = m.seats.find((s) => s.mine) ?? m.seats[0]
                    const others = byPlace(m.seats.filter((s) => s !== mine))
                    const top = others[0]
                    const queued = isQueued(m)
                    const live = m.status === 'claimed' || m.status === 'running'
                    const r = queued ? null : resultOf(m.seats, mine)
                    return (
                      <tr className={cx('home-mrow', queued && 'q')} onClick={() => navigate(`/matches/${m.id}`, { state: { via: 'link' } })} key={m.id}>
                        <td>
                          {queued ? (
                            <span className="home-res q" title={live ? H.playing : H.queued}>
                              <Icon id={live ? 'i-live' : 'i-clock'} label={live ? H.playing : H.queued} />
                            </span>
                          ) : r ? (
                            <span className={cx('home-res', r.tone)} title={r.title}>
                              {r.word}
                            </span>
                          ) : (
                            <span className="home-res">—</span>
                          )}
                        </td>
                        <td className="home-me">
                          <b>{mine?.model}</b> <span className="v">{fill(H.version, { v: mine?.version ?? '' })}</span>
                        </td>
                        <td className="r">
                          {/* The score is the row's link, so the row is reachable without a pointer. */}
                          <Link className="home-sc" to={`/matches/${m.id}`} state={{ via: 'link' }} onClick={(e) => e.stopPropagation()}>
                            {queued ? (
                              <span className="muted">{live ? H.playingWord : H.queuedWord}</span>
                            ) : (
                              <>
                                {mine?.score ?? '—'}
                                <span className="dash">–</span>
                                {top?.score ?? '—'}
                              </>
                            )}
                          </Link>
                        </td>
                        <td className="home-opp">
                          {top ? (
                            <>
                              {H.vs} <b>{top.model}</b> <span className="v">{fill(H.version, { v: top.version })}</span>
                              {others.length > 1 ? <span className="muted"> {fill(H.others, { n: others.length - 1 })}</span> : null}
                            </>
                          ) : null}
                        </td>
                        <td className="home-board muted">
                          <IconLabel icon="i-map">{m.map}</IconLabel>
                        </td>
                        <td className="r home-when muted">{matchWhen(m).text}</td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      )}
      <PanelFoot>
        <Link to={href}>
          <IconLabel icon="i-matches">{H.more} →</IconLabel>
        </Link>
      </PanelFoot>
    </Panel>
  )
}
