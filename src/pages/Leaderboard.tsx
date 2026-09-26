// The ladder at full width: the season's versions and their ratings, one dataset behind five views
// (Table, Trend, Rank race, Size v rating, Movers), under a sticky row of views and filters.
//
// EVERY CONTROL LIVES IN THE ADDRESS, so a view is a link somebody can send: `view`, `ladder`,
// `win` (the window), `baselines=hidden`, `mine=1` and `cmp`, the compared set. `cmp` absent is the
// default set (the top ten and the reader's own versions), `-` is none, and otherwise it is the
// versions' ids cut to eight characters and joined by dots, which is unique on one ladder and keeps
// the address short. Ticking a box replaces the entry rather than pushing one. A new visit starts
// on Table because a visit carries no `view`.
//
// THE WHOLE FIELD ON ONE PAGE: one read of 200 rows, Soma's ceiling, and a Load more past it.
// Hiding baselines closes the ranks up here, in the page, because the API ranks everyone.
//
// ONE SERIES, TWO USES. The season-long series feeds the table's sparkline whatever the window, and
// Trend, Rank race and Movers when the window is the season; a week or a day is a second read. A
// rank in Rank race is computed here from the ratings at each reading, among every version on the
// ladder then (baselines too unless they are hidden), so a crossing is a place changing hands and
// hiding the baselines closes those ranks up as well.
//
// A closed season shows its podium (Soma's, frozen at the close: one place per owner, no
// baselines) above the row, and its window is the season. While it runs, rows one to three carry
// a medal instead.

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError, type LeaderboardEntry, type LeaderboardSeries, type PodiumPlace, type SeasonWeightClass } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useSelection } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { useLadderHeads } from '../lib/useLadderHeads'
import { bytes, dateTime, num, rating as fmtRating } from '../lib/format'
import { classVar, kStyle } from '../lib/weight-classes'
import { cx } from '../lib/cx'
import { count, fill } from '../lib/copy'
import { Shell } from '../components/Shell'
import { Badge, EmptyState, Icon, PageHeader, Panel, PanelBody, PanelFoot, Rich, Select, Skel, Tabs, type IconId } from '../components/ui'
import { ClassBadge, ClassIcon, ModelLink, Owner, OwnerLink, RatingSparkline, RatingValue, Trend } from '../components/Model'
import { ladderEmpty } from '../components/LadderTable'
import { LadderTabs } from '../components/LadderTabs'
import { SizeRatingPlot } from '../components/SizeRatingPlot'
import { MatchCard, CardSkeletons } from '../components/MatchCard'
import { FrameThumb } from '../components/Viewer'
import { InlineError, NotFound } from '../components/ErrorStates'
import { AskForHelp } from '../components/Help'
import T from '../../copy/leaderboard.json'
import common from '../../copy/common.json'

/** Soma's ceiling for one read, and the whole field at today's volume. */
const FIELD = 200
const VIEWS = ['table', 'trend', 'race', 'size', 'movers'] as const
type View = (typeof VIEWS)[number]
const VIEW_ICON: Record<View, IconId> = { table: 'i-table', trend: 'i-swing', race: 'i-rank', size: 'i-scatter', movers: 'i-up' }
const WINS = ['season', 'week', 'today'] as const
type Win = (typeof WINS)[number]
/** The default compared set's head: the top of the ladder. */
const TOP = 10
/** The columns of the table, for the opened row's span. */
const COLUMNS = 10

type Series = LeaderboardSeries['series']
type Busy = 'loading' | 'ready' | 'error'

const short = (id: string) => id.replace(/-/g, '').slice(0, 8)

/** The window's first instant and how many readings to ask for. Snapshots are hourly, so a day asks
 *  for one a hour and a week one every three; both floor to the hour, which keeps the request's key
 *  (and so the fetch) still within it. Never before the season opened. */
function windowOf(win: Win, openedAt: string | null | undefined): { since: string | null; points: number } {
  if (win === 'season') return { since: null, points: 60 }
  const now = Date.now()
  const hour = 3_600_000
  const today = new Date()
  const from = win === 'today' ? new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() : Math.floor(now / hour) * hour - 7 * 24 * hour
  const opened = openedAt ? new Date(openedAt).getTime() : 0
  const since = Math.max(from, Number.isNaN(opened) ? 0 : opened)
  const hours = Math.max(1, Math.floor((now - since) / hour))
  const points = win === 'today' ? Math.min(25, hours + 1) : Math.min(57, Math.floor(hours / 3) + 1)
  return { since: new Date(since).toISOString(), points: Math.max(2, points) }
}

export default function Leaderboard() {
  const { live, slug, season, gameName } = usePlatform()
  const { href, season: wanted } = useSelection()
  const { me } = useSession()
  const classes = useWeightClasses()
  const [params, setParams] = useSearchParams()
  const param = (k: string) => params.get(k) ?? ''
  const set = useCallback(
    (values: Record<string, string>, replace = false) => {
      const next = new URLSearchParams(params)
      for (const [k, v] of Object.entries(values)) {
        if (v) next.set(k, v)
        else next.delete(k)
      }
      setParams(next, { replace })
    },
    [params, setParams],
  )

  const closed = season?.state === 'closed'
  const ladder = param('ladder') || 'open'
  // `plot` is the old address of Size v rating, which links sent before the redesign still carry.
  const rawView = param('view') === 'plot' ? 'size' : param('view')
  const view: View = (VIEWS as readonly string[]).includes(rawView) ? (rawView as View) : 'table'
  const win: Win = !closed && (WINS as readonly string[]).includes(param('win')) ? (param('win') as Win) : 'season'
  const hide = param('baselines') === 'hidden'
  const mine = Boolean(me) && param('mine') === '1'
  const ladderName = ladder === 'open' ? common.ladder.open : ladder

  // ---- the field: one read, and Load more past Soma's ceiling ----
  const boardKey = `lb:${slug}:${wanted}:${ladder}`
  const board = useApi(boardKey, () => api.leaderboard(slug, { ladder, season: wanted, limit: FIELD }))
  const [extra, setExtra] = useState<{ key: string; rows: LeaderboardEntry[]; next: string | null } | null>(null)
  const [moreState, setMoreState] = useState<{ busy: boolean; error: ApiError | null }>({ busy: false, error: null })
  const ours = extra?.key === boardKey ? extra : null
  const all = useMemo(() => [...(board.data?.entries ?? []), ...(ours?.rows ?? [])], [board.data, ours])
  const next = ours ? ours.next : (board.data?.next_cursor ?? null)
  const loadMore = async () => {
    if (!next) return
    setMoreState({ busy: true, error: null })
    try {
      const page = await api.leaderboard(slug, { ladder, season: wanted, limit: FIELD, cursor: next })
      setExtra({ key: boardKey, rows: [...(ours?.rows ?? []), ...page.entries], next: page.next_cursor })
      setMoreState({ busy: false, error: null })
    } catch (e) {
      setMoreState({ busy: false, error: e instanceof ApiError ? e : new ApiError(0, 'unknown', String(e)) })
    }
  }

  // Hidden baselines close the ranks up; shown, the API's ranks stand.
  const ranked = useMemo(() => (hide ? all.filter((r) => !r.baseline).map((r, i) => ({ ...r, rank: i + 1 })) : all), [all, hide])
  const mineRows = useMemo(() => (me ? ranked.filter((r) => r.owner === me.handle) : []), [ranked, me])
  const best = mineRows[0]
  const onLadder = board.data ? (hide ? board.data.total - all.filter((r) => r.baseline).length : board.data.total) : null

  // ---- the compared set ----
  const cmp = param('cmp')
  const defaultSet = useMemo(() => new Set([...ranked.slice(0, TOP), ...mineRows].map((r) => r.version_id)), [ranked, mineRows])
  const compared = useMemo(() => {
    if (!cmp) return defaultSet
    if (cmp === '-') return new Set<string>()
    const picked = new Set(cmp.split('.'))
    return new Set(ranked.filter((r) => picked.has(short(r.version_id))).map((r) => r.version_id))
  }, [cmp, defaultSet, ranked])
  const toggleCompare = (id: string) => {
    const nextSet = new Set(compared)
    if (nextSet.has(id)) nextSet.delete(id)
    else nextSet.add(id)
    const same = nextSet.size === defaultSet.size && [...nextSet].every((v) => defaultSet.has(v))
    set({ cmp: same ? '' : nextSet.size ? [...nextSet].map(short).join('.') : '-' }, true)
  }

  // ---- the series: the season's always (the table's sparkline), the window's when a view reads it ----
  const seasonSeries = useApi(`lb-series:${slug}:${wanted}:${ladder}:season`, () =>
    api.leaderboardSeries(slug, { ladder, season: wanted, points: 60 }),
  )
  const w = windowOf(win, season?.submissions_open_at)
  const needsWindow = win !== 'season' && (view === 'trend' || view === 'race' || view === 'movers')
  const windowSeries = useApi(
    `lb-series:${slug}:${wanted}:${ladder}:${w.since}:${w.points}`,
    () => api.leaderboardSeries(slug, { ladder, season: wanted, since: w.since, points: w.points }),
    needsWindow,
  )
  const viewSeries = win === 'season' ? seasonSeries : windowSeries

  // ---- the podium, a closed season alone ----
  const podium = useApi(`lb-podium:${slug}:${season?.slug}`, () => api.podium(slug, season?.slug ?? ''), closed && Boolean(season))
  const heads = useLadderHeads(slug, wanted, classes, closed)

  // ---- the sticky row's height, which the table's head sticks under ----
  const page = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = bar.current
    const host = page.current
    if (!el || !host) return
    const ro = new ResizeObserver(() => host.style.setProperty('--lb-bar-h', `${el.offsetHeight}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The You chip goes to the table, then to the row once it is drawn.
  const [seek, setSeek] = useState(false)
  useEffect(() => {
    if (!seek || view !== 'table') return
    const row = document.getElementById('lb-you')
    if (!row) return
    row.scrollIntoView({ block: 'center', behavior: 'smooth' })
    row.focus({ preventScroll: true })
    // oxlint-disable-next-line react/set-state-in-effect
    setSeek(false)
  }, [seek, view, ranked])

  const loading = board.state === 'loading'
  const empty = board.state === 'ready' && ranked.length === 0
  const emptyText = hide && all.length > 0 ? T.empty.hidden : ladderEmpty(ladder, classes, live)
  const dimFor = mine && mineRows.length ? me?.handle : undefined

  let body
  if (board.state === 'error' && board.error?.status === 404) {
    // An unknown game, an address typed by hand: Soma answers 404 like every other public read.
    body = <NotFound />
  } else if (board.state === 'error') {
    body = (
      <>
        <InlineError error={board.error} what={T.error} />
        <AskForHelp />
      </>
    )
  } else if (empty) {
    body = <EmptyState boxed>{emptyText}</EmptyState>
  } else if (view === 'table') {
    body = (
      <FieldTable
        rows={mine ? mineRows : ranked}
        loading={loading}
        you={me?.handle}
        medals={!closed}
        compared={compared}
        onCompare={toggleCompare}
        season={seasonSeries}
        ladderName={ladderName}
        hrefFor={(id) => href('/matches', { version: id })}
        mineEmpty={mine && board.state === 'ready' && mineRows.length === 0}
      />
    )
  } else if (view === 'trend' || view === 'race') {
    body = (
      <Panel className="lb-panel">
        <SeriesChart
          kind={view}
          series={viewSeries.data?.series ?? null}
          state={loading ? 'loading' : viewSeries.state}
          error={viewSeries.error}
          rows={ranked}
          compared={compared}
          hideBaselines={hide}
          dimFor={dimFor}
          you={me?.handle}
        />
      </Panel>
    )
  } else if (view === 'size') {
    body = (
      <Panel className="lb-panel">
        <PanelBody>
          <SizeRatingPlot entries={ranked} classes={classes} you={me?.handle} dimFor={dimFor} state={board.state} />
        </PanelBody>
        <PanelFoot>{T.sizeNote}</PanelFoot>
      </Panel>
    )
  } else {
    body = (
      <Panel className="lb-panel">
        <Movers
          rows={mine ? mineRows : ranked}
          series={viewSeries.data?.series ?? null}
          state={loading ? 'loading' : viewSeries.state}
          error={viewSeries.error}
          win={win}
          you={me?.handle}
          mineEmpty={mine && board.state === 'ready' && mineRows.length === 0}
        />
      </Panel>
    )
  }

  return (
    <Shell nav="leaderboard" scoped title={ladder === 'open' ? T.title : fill(T.tabClass, { ladder })}>
      <PageHeader
        crumbs={[{ label: season ? `${gameName} · ${season.name}` : gameName, to: href('/') }, { label: T.title, icon: 'i-leaderboard' }]}
        title={
          <>
            {T.title}
            <small className="lb-count">{onLadder === null ? null : fill(T.onLadder, { n: num(onLadder), ladder: ladderName })}</small>
          </>
        }
        icon="i-leaderboard"
        badges={closed ? <Badge tone="off">{T.final}</Badge> : null}
      />
      <div className="wrap page-body stack lb-page" ref={page}>
        {closed && season ? (
          <Podium
            classes={classes}
            places={podium.data?.ladders ?? null}
            state={podium.state}
            error={podium.error}
            totals={heads.byLadder}
            game={slug}
          />
        ) : null}

        <div className="lb-bar" ref={bar} role="region" aria-label={T.bar.label}>
          <Tabs
            label={T.bar.views}
            current={view}
            onPick={(v) => set({ view: v === 'table' ? '' : v })}
            items={VIEWS.map((v) => ({
              key: v,
              label: (
                <>
                  <Icon id={VIEW_ICON[v]} />
                  {T.views[v]}
                </>
              ),
            }))}
          />
          <div className="lb-filters" role="group" aria-label={T.bar.filters}>
            <span className="lb-flabel" aria-hidden="true">
              {T.bar.ladder}
            </span>
            <LadderTabs look="seg" classes={classes} value={ladder} onPick={(l) => set({ ladder: l === 'open' ? '' : l, cmp: '' })} />
            {closed ? null : (
              <Select
                look="pick"
                label={T.window.label}
                prefix={T.window.label}
                value={win === 'season' ? '' : win}
                onChange={(v) => set({ win: v })}
                options={WINS.map((k) => ({ value: k === 'season' ? '' : k, label: T.window[k] }))}
              />
            )}
            <Toggle on={!hide} label={T.baselines} title={T.baselinesTitle} onChange={(on) => set({ baselines: on ? '' : 'hidden', cmp: '' })} />
            {me ? <Toggle on={mine} label={T.mine} title={T.mineTitle} onChange={(on) => set({ mine: on ? '1' : '' })} /> : null}
            <span className="lb-scope" title={T.compare.title}>
              <Icon id="i-swing" />
              {fill(T.compare.chip, { n: compared.size })}
              <button type="button" className="lb-scope-x" onClick={() => set({ cmp: '' }, true)} disabled={!cmp} aria-label={T.compare.reset} title={T.compare.reset}>
                <Icon id="i-x" />
              </button>
            </span>
            {best ? (
              <button
                type="button"
                className="lb-you"
                title={T.youTitle}
                onClick={() => {
                  if (view !== 'table') set({ view: '' })
                  setSeek(true)
                }}
              >
                <Icon id="i-user" />
                {fill(T.you, { rank: best.rank })}
              </button>
            ) : null}
          </div>
        </div>

        <div className="lb-view">{body}</div>

        {view === 'table' && !empty && board.state !== 'error' ? (
          <>
            {next ? (
              <div className="lb-more">
                <button className="btn" type="button" onClick={() => void loadMore()} disabled={moreState.busy}>
                  {fill(T.loadMore, { n: FIELD })}
                </button>
                {moreState.error ? <InlineError error={moreState.error} what={T.error} /> : null}
              </div>
            ) : null}
            <p className="lb-legend">
              <Rich text={T.legend} vars={{ baseline: <Icon id="i-anchor" />, settling: <Icon id="i-settling" /> }} />
            </p>
          </>
        ) : null}
      </div>
    </Shell>
  )
}

// ---- the filter row's switches ----------------------------------------------------------------

/** A switch that names itself beside the knob ("Baselines"), where the kit's `Switch` says On or
 *  Off: in a row of filters the name is what a reader scans for. */
function Toggle({ on, label, title, onChange }: { on: boolean; label: string; title: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" className="switch lb-switch" aria-checked={on} title={title} onClick={() => onChange(!on)}>
      <i aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}

// ---- the podium -------------------------------------------------------------------------------

function Podium({
  classes,
  places,
  state,
  error,
  totals,
  game,
}: {
  classes: SeasonWeightClass[]
  places: Partial<Record<string, PodiumPlace[]>> | null
  state: Busy
  error: ApiError | null
  totals: Map<string, { total: number }>
  game: string
}) {
  const ladders = ['open', ...classes.map((c) => c.class)]
  if (state === 'error' && error) return <InlineError error={error} what={T.podium.error} />
  return (
    <section className="lb-podium" aria-label={T.podium.label}>
      {ladders.map((l) => {
        const top = places?.[l]?.[0] ?? null
        const total = totals.get(l)?.total
        return (
          <div className={cx('lb-pod', l === 'open' && 'open')} style={kStyle(l)} key={l}>
            <div className="lb-pod-head">
              <Icon id="i-trophy" />
              {l === 'open' ? <b>{common.ladder.open}</b> : <b className="klass"><ClassIcon k={l} decorative />{l}</b>}
              {total === undefined ? null : <span>{count(T.podium.versions, total, { n: num(total) })}</span>}
            </div>
            {state === 'loading' ? (
              <>
                <div className="thumb-box skel lb-pod-thumb" />
                <Skel w="60%" />
                <Skel w="100%" />
              </>
            ) : top ? (
              <>
                {top.latest_match ? (
                  <FrameThumb id={top.latest_match.id} game={game} hasFrame={top.latest_match.frame} className="lb-pod-thumb" />
                ) : (
                  <div className="thumb-box lb-pod-thumb" aria-hidden="true" />
                )}
                <div className="lb-pod-who">
                  <span className="who">
                    <ModelLink modelId={top.model_id} name={top.model} version={top.version} />
                    <small>
                      <OwnerLink handle={top.owner} />
                    </small>
                  </span>
                  <span className="lead">{fmtRating(top.rating)}</span>
                </div>
                {top.latest_match ? (
                  <Link className="btn" to={`/matches/${top.latest_match.id}`} state={{ via: 'link' }}>
                    <Icon id="i-play" />
                    {T.podium.watch}
                  </Link>
                ) : (
                  <button className="btn" type="button" disabled>
                    {T.podium.noMatch}
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="thumb-box lb-pod-thumb" aria-hidden="true" />
                <p className="muted lb-pod-none">{T.podium.nobody}</p>
              </>
            )}
          </div>
        )
      })}
    </section>
  )
}

// ---- Table ------------------------------------------------------------------------------------

function FieldTable({
  rows,
  loading,
  you,
  medals,
  compared,
  onCompare,
  season,
  ladderName,
  hrefFor,
  mineEmpty,
}: {
  rows: LeaderboardEntry[]
  loading: boolean
  you?: string
  medals: boolean
  compared: Set<string>
  onCompare: (versionId: string) => void
  season: { state: Busy; data: LeaderboardSeries | null }
  ladderName: string
  hrefFor: (versionId: string) => string
  mineEmpty: boolean
}) {
  const [open, setOpen] = useState<string | null>(null)
  const byVersion = useMemo(() => new Map((season.data?.series.versions ?? []).map((v) => [v.version_id, v])), [season.data])
  const firstYou = you ? rows.find((r) => r.owner === you)?.version_id : undefined
  if (mineEmpty) {
    return (
      <EmptyState boxed>
        <Rich text={T.empty.mine} />
      </EmptyState>
    )
  }
  const L = common.ladder
  const body: (LeaderboardEntry | null)[] = loading ? Array.from({ length: 12 }, () => null) : rows
  return (
    <table className="table lb-table">
      <caption className="vis-hidden">{fill(T.table.caption, { ladder: ladderName })}</caption>
      <thead>
        <tr>
          <th className="rank">{L.rank}</th>
          <th>{L.model}</th>
          <th className="wide-only">{L.class}</th>
          <th className="r wide-only">{L.size}</th>
          <th className="r">{L.rating}</th>
          <th className="r wide-only">
            <Icon id="i-matches" label={L.matches} />
          </th>
          <th className="wide-only">{T.table.lastMove}</th>
          <th className="wide-only">{T.table.season}</th>
          <th className="lb-cmp">
            <Icon id="i-swing" label={T.compare.column} />
          </th>
          <th className="lb-xo">
            <span className="vis-hidden">{T.table.openHead}</span>
          </th>
        </tr>
      </thead>
      <tbody aria-busy={loading || undefined}>
        {body.map((r, i) => {
          if (!r) {
            return (
              <tr key={`skel-${i}`}>
                <td className="rank">
                  <Skel w={18} />
                </td>
                <td>
                  <Skel w={140} />
                </td>
                <td className="wide-only">
                  <Skel w={60} />
                </td>
                <td className="r wide-only">
                  <Skel w={50} />
                </td>
                <td className="r">
                  <Skel w={42} />
                </td>
                <td className="r wide-only">
                  <Skel w={24} />
                </td>
                <td className="wide-only">
                  <Skel w={40} />
                </td>
                <td className="wide-only">
                  <Skel w={88} />
                </td>
                <td className="lb-cmp" />
                <td className="lb-xo" />
              </tr>
            )
          }
          const isOpen = open === r.version_id
          const mineRow = Boolean(you) && r.owner === you
          const toggle = () => setOpen(isOpen ? null : r.version_id)
          const sv = byVersion.get(r.version_id)
          const values = sv ? sv.ratings.filter((v): v is number => v !== null) : []
          return (
            <Fragment key={r.version_id}>
              <tr
                className={cx('lb-row', mineRow && 'you', isOpen && 'open')}
                id={r.version_id === firstYou ? 'lb-you' : undefined}
                tabIndex={r.version_id === firstYou ? -1 : undefined}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a, input, button')) return
                  toggle()
                }}
              >
                <td className="rank">
                  {medals && r.rank <= 3 ? (
                    <span className={`lb-medal m${r.rank}`} title={fill(T.table.medal, { n: r.rank })}>
                      {r.rank}
                    </span>
                  ) : (
                    <span className={r.rank <= 3 ? 'rank top' : undefined}>{r.rank}</span>
                  )}
                </td>
                <td>
                  <span className="who">
                    <span>
                      <ModelLink modelId={r.model_id} name={r.model} version={r.version} />
                      {mineRow ? <span className="you-tag">{common.marks.you}</span> : null}
                    </span>
                    <small>
                      <Owner handle={r.owner} baseline={r.baseline} />
                    </small>
                  </span>
                </td>
                <td className="wide-only">
                  <ClassBadge k={r.class} />
                </td>
                <td className="r mono wide-only">{bytes(r.size_bytes)}</td>
                <td className="r">
                  <span className="lead">
                    <RatingValue value={r.rating} provisional={r.provisional} />
                  </span>
                </td>
                <td className="r wide-only muted">{num(r.matches)}</td>
                <td className="wide-only">{r.trend === null ? <span className="muted">—</span> : <Trend value={r.trend} />}</td>
                <td className="wide-only">
                  {season.state === 'loading' ? (
                    <Skel w={88} />
                  ) : values.length >= 2 ? (
                    <SeasonSpark values={values} k={r.class} />
                  ) : (
                    <RatingSparkline history={r.history} k={r.class} />
                  )}
                </td>
                <td className="lb-cmp">
                  <input
                    type="checkbox"
                    checked={compared.has(r.version_id)}
                    onChange={() => onCompare(r.version_id)}
                    aria-label={fill(T.compare.row, { model: r.model, version: r.version })}
                  />
                </td>
                <td className="lb-xo">
                  <button
                    type="button"
                    className="lb-xo-btn"
                    aria-expanded={isOpen}
                    aria-label={fill(isOpen ? T.table.close : T.table.open, { model: r.model })}
                    onClick={toggle}
                  >
                    <Icon id="i-chevron" />
                  </button>
                </td>
              </tr>
              {isOpen ? (
                <tr className="lb-xrow">
                  <td colSpan={COLUMNS}>
                    <LastMatches entry={r} allHref={hrefFor(r.version_id)} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

/** An opened row: the version's last three match cards and the way to all of them. */
function LastMatches({ entry, allHref }: { entry: LeaderboardEntry; allHref: string }) {
  const last = useApi(`lb-last:${entry.version_id}`, () => api.matches({ version: entry.version_id, limit: 3 }))
  let cards
  if (last.state === 'error') cards = <InlineError error={last.error} what={T.opened.error} />
  else if (last.state === 'loading') cards = <CardSkeletons n={3} />
  else if (last.data.matches.length === 0) cards = <p className="muted">{fill(T.opened.none, { model: entry.model, version: entry.version })}</p>
  else cards = last.data.matches.map((m) => <MatchCard m={m} via="link" key={m.id} />)
  return (
    <div className="lb-xcards">
      {cards}
      <Link className="lb-xmore" to={allHref}>
        {fill(T.opened.all, { model: entry.model })} →
      </Link>
    </div>
  )
}

/** The season-long line: every reading of the season, oldest first, with the class's dot at its
 *  end. The table's own twelve readings (`history`) are the fallback while the series is absent. */
function SeasonSpark({ values, k, w = 88, h = 22 }: { values: number[]; k: string; w?: number; h?: number }) {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const pts = values.map((v, i) => [2 + (i / (values.length - 1)) * (w - 4), 2 + (1 - (v - lo) / span) * (h - 4)])
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg
      className="spark"
      width={w}
      height={h}
      role="img"
      aria-label={fill(T.spark, { n: values.length, first: fmtRating(values[0]), last: fmtRating(values[values.length - 1]) })}
      style={kStyle(k)}
    >
      <polyline points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} />
      <circle cx={lx} cy={ly} r={2.5} />
    </svg>
  )
}

// ---- Trend and Rank race ----------------------------------------------------------------------

type Line = {
  id: string
  name: string
  version: number
  k: string
  you: boolean
  dim: boolean
  values: (number | null)[]
}

/** Every version's rank at each reading, among those standing then: 1 + how many stood higher. */
function ranksOf(series: Series, hideBaselines: boolean): Map<string, (number | null)[]> {
  const pool = series.versions.filter((v) => !(hideBaselines && v.baseline))
  const out = new Map(pool.map((v) => [v.version_id, [] as (number | null)[]]))
  series.edges.forEach((_, i) => {
    const at = pool.map((v) => v.ratings[i]).filter((x): x is number => x !== null)
    for (const v of pool) {
      const mine = v.ratings[i]
      out.get(v.version_id)?.push(mine === null ? null : 1 + at.filter((x) => x > mine).length)
    }
  })
  return out
}

/** Round steps for an axis of about five ticks. */
function niceStep(span: number): number {
  const raw = span / 5
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag
  return 10 * mag
}

const H = 360
const M = { l: 48, t: 16, b: 30 }
/** Rows the hover lists; the rest are counted. */
const TIP_ROWS = 8

function SeriesChart({
  kind,
  series,
  state,
  error,
  rows,
  compared,
  hideBaselines,
  dimFor,
  you,
}: {
  kind: 'trend' | 'race'
  series: Series | null
  state: Busy
  error: ApiError | null
  rows: LeaderboardEntry[]
  compared: Set<string>
  hideBaselines: boolean
  dimFor?: string
  you?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [at, setAt] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const lines: Line[] = useMemo(() => {
    if (!series) return []
    const byId = new Map(series.versions.map((v) => [v.version_id, v]))
    const ranks = kind === 'race' ? ranksOf(series, hideBaselines) : null
    return rows
      .filter((r) => compared.has(r.version_id) && byId.has(r.version_id))
      .map((r) => ({
        id: r.version_id,
        name: r.model,
        version: r.version,
        k: r.class,
        you: Boolean(you) && r.owner === you,
        dim: Boolean(dimFor) && r.owner !== dimFor,
        values: ranks ? (ranks.get(r.version_id) ?? []) : (byId.get(r.version_id)?.ratings ?? []),
      }))
  }, [series, kind, hideBaselines, rows, compared, you, dimFor])

  const caption = kind === 'race' ? T.chart.race : T.chart.trend

  const edges = series?.edges ?? []
  const n = edges.length
  const flat = lines.flatMap((l) => l.values).filter((v): v is number => v !== null)
  const W = Math.max(width, 560)
  const narrow = width < 720
  const mr = narrow ? 128 : 190
  const cut = narrow ? 11 : 18

  let chart
  if (state === 'error' && error) {
    chart = <InlineError error={error} what={T.chart.error} />
  } else if (state === 'loading' || !series) {
    chart = <div className="lb-chart-skel skel" />
  } else if (lines.length === 0) {
    chart = <EmptyState>{T.chart.nothing}</EmptyState>
  } else if (flat.length === 0 || n < 2) {
    chart = <EmptyState>{T.chart.empty}</EmptyState>
  } else {
    const race = kind === 'race'
    let lo: number
    let hi: number
    let ticks: number[]
    if (race) {
      lo = 1
      hi = Math.max(2, ...flat)
      const step = hi <= 12 ? 1 : hi <= 30 ? 5 : 10
      ticks = [1, ...Array.from({ length: Math.floor(hi / step) }, (_, i) => (i + 1) * step).filter((t) => t > 1 && t <= hi)]
    } else {
      const step = niceStep(Math.max(...flat) - Math.min(...flat) || 1)
      lo = Math.floor(Math.min(...flat) / step) * step
      hi = Math.ceil(Math.max(...flat) / step) * step
      if (hi === lo) hi = lo + step
      ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step)
    }
    const plotR = W - mr
    const x = (i: number) => M.l + (i / (n - 1)) * (plotR - M.l)
    const y = (v: number) => (race ? M.t + ((v - 1) / (hi - 1)) * (H - M.t - M.b) : M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b))

    // The time axis: about six labels, days for a span of days and hours for a day.
    const t0 = new Date(edges[0]).getTime()
    const t1 = new Date(edges[n - 1]).getTime()
    const byDay = t1 - t0 > 36 * 3_600_000
    const fmt = new Intl.DateTimeFormat('en-GB', byDay ? { day: 'numeric', month: 'short' } : { hour: '2-digit', minute: '2-digit' })
    const every = Math.max(1, Math.round((n - 1) / 5))
    const xticks = Array.from({ length: n }, (_, i) => i).filter((i) => i % every === 0)

    // End labels in a column at the right, pushed apart where lines converge, each tied back to its
    // line's end by a leader when it had to move.
    const ends = lines
      .map((l, j) => {
        let last = -1
        for (let i = l.values.length - 1; i >= 0; i--) {
          if (l.values[i] !== null) {
            last = i
            break
          }
        }
        return { j, i: last, v: last >= 0 ? (l.values[last] as number) : null }
      })
      .filter((e): e is { j: number; i: number; v: number } => e.v !== null)
      .map((e) => ({ ...e, y: y(e.v), ly: y(e.v) }))
      .sort((a, b) => a.y - b.y)
    for (let k = 1; k < ends.length; k++) if (ends[k].ly - ends[k - 1].ly < 14) ends[k].ly = ends[k - 1].ly + 14
    const overflow = ends.length ? ends[ends.length - 1].ly - (H - M.b) : 0
    if (overflow > 0) for (const e of ends) e.ly -= overflow
    for (let k = ends.length - 2; k >= 0; k--) if (ends[k + 1].ly - ends[k].ly < 14) ends[k].ly = ends[k + 1].ly - 14

    const pathOf = (vals: (number | null)[]) => {
      let d = ''
      let pen = false
      vals.forEach((v, i) => {
        if (v === null) {
          pen = false
          return
        }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
        pen = true
      })
      return d
    }
    const value = (v: number) => (race ? fill(T.chart.rank, { n: v }) : fmtRating(v))

    const pick = (clientX: number) => {
      const box = host.current?.querySelector('svg')?.getBoundingClientRect()
      if (!box) return
      const px = clientX - box.left
      setAt(Math.max(0, Math.min(n - 1, Math.round(((px - M.l) / (plotR - M.l)) * (n - 1)))))
    }
    const onKey = (e: KeyboardEvent) => {
      const cur = at ?? n - 1
      let to: number | null = cur
      if (e.key === 'ArrowLeft') to = Math.max(0, cur - 1)
      else if (e.key === 'ArrowRight') to = Math.min(n - 1, cur + 1)
      else if (e.key === 'Home') to = 0
      else if (e.key === 'End') to = n - 1
      else if (e.key === 'Escape') to = null
      else return
      e.preventDefault()
      setAt(to)
    }
    const standing =
      at === null
        ? []
        : lines
            .map((l) => ({ l, v: l.values[at] }))
            .filter((s): s is { l: Line; v: number } => s.v !== null && s.v !== undefined)
            .sort((a, b) => (race ? a.v - b.v : b.v - a.v))
    const tipLeft = at === null ? 0 : Math.min(x(at) + 14, W - 230)

    chart = (
      <div className="lb-chart-plot">
        <svg
          width={W}
          height={H}
          tabIndex={0}
          aria-label={caption}
          onPointerMove={(e: PointerEvent) => pick(e.clientX)}
          onPointerLeave={() => setAt(null)}
          onKeyDown={onKey}
          onFocus={() => setAt((a) => a ?? n - 1)}
          onBlur={() => setAt(null)}
        >
          <g className="lb-grid">
            {ticks.map((t) => (
              <line key={t} x1={M.l} x2={plotR} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          {ticks.map((t) => (
            <text className="lb-tick" key={`y${t}`} x={M.l - 8} y={y(t) + 4} textAnchor="end">
              {race ? fill(T.chart.rank, { n: t }) : Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          ))}
          {xticks.map((i) => (
            <text className="lb-tick" key={`x${i}`} x={x(i)} y={H - 8} textAnchor="middle">
              {fmt.format(new Date(edges[i]))}
            </text>
          ))}
          {lines.map((l) => (
            <path key={l.id} className={cx('lb-series', l.you && 'you', l.dim && 'dim')} style={kStyle(l.k)} d={pathOf(l.values)} />
          ))}
          {ends.map((e) => {
            const l = lines[e.j]
            const ex = x(e.i)
            const lx = plotR + 12
            const name = l.name.length > cut ? `${l.name.slice(0, cut - 1)}…` : l.name
            return (
              <g key={l.id} className={cx(l.dim && 'dim')}>
                {Math.abs(e.ly - e.y) > 2 || ex < plotR - 1 ? <path className="lb-leader" d={`M${ex + 5},${e.y} L${lx - 4},${e.ly}`} /> : null}
                <circle className="lb-end" style={kStyle(l.k)} cx={ex} cy={e.y} r={4} />
                <text className={cx('lb-endlab', l.you && 'you')} x={lx} y={e.ly + 4}>
                  {name} v{l.version} <tspan className="lb-endval">{value(e.v)}</tspan>
                </text>
              </g>
            )
          })}
          {at === null ? null : (
            <g>
              <line className="lb-cross" x1={x(at)} x2={x(at)} y1={M.t} y2={H - M.b} />
              {standing.map((s) => (
                <circle key={s.l.id} className="lb-end" style={kStyle(s.l.k)} cx={x(at)} cy={y(s.v)} r={4} />
              ))}
            </g>
          )}
          <rect className="lb-hit" x={M.l} y={M.t} width={Math.max(0, plotR - M.l)} height={H - M.t - M.b} />
        </svg>
        {at === null ? null : (
          <div className="plot-tip lb-tip" style={{ left: tipLeft, top: M.t + 8 }} aria-live="polite">
            <b>{dateTime(edges[at])}</b>
            {standing.slice(0, TIP_ROWS).map((s) => (
              <span key={s.l.id}>
                <i className="lb-swatch" style={kStyle(s.l.k)} />
                {s.l.name} v{s.l.version} {value(s.v)}
              </span>
            ))}
            {standing.length > TIP_ROWS ? <span className="muted">{fill(T.chart.more, { n: standing.length - TIP_ROWS })}</span> : null}
          </div>
        )}
      </div>
    )
  }

  const kinds = [...new Set(lines.map((l) => l.k))]
  const pool = series ? series.versions.filter((v) => !(hideBaselines && v.baseline)).length : rows.length
  return (
    <figure className="lb-chart">
      <figcaption className="vis-hidden">{caption}</figcaption>
      <div className="lb-chart-scroll" ref={host}>
        {chart}
      </div>
      <div className="lb-chart-legend">
        {kinds.map((k) => (
          <span key={k}>
            <i className="lb-key" style={{ background: classVar(k) }} />
            {k}
          </span>
        ))}
        {lines.some((l) => l.you) ? (
          <span>
            <i className="lb-key you" />
            {T.chart.you}
          </span>
        ) : null}
        <span className="muted">
          {kind === 'race' ? fill(T.chart.noteRace, { n: pool, drawn: lines.length }) : fill(T.chart.noteTrend, { n: rows.length, drawn: lines.length })} ·{' '}
          {T.chart.hover}
        </span>
      </div>
    </figure>
  )
}

// ---- Movers -----------------------------------------------------------------------------------

function Movers({
  rows,
  series,
  state,
  error,
  win,
  you,
  mineEmpty,
}: {
  rows: LeaderboardEntry[]
  series: Series | null
  state: Busy
  error: ApiError | null
  win: Win
  you?: string
  mineEmpty: boolean
}) {
  if (mineEmpty) {
    return (
      <EmptyState>
        <Rich text={T.empty.mine} />
      </EmptyState>
    )
  }
  if (state === 'error' && error) return <InlineError error={error} what={T.chart.error} />
  const byId = new Map((series?.versions ?? []).map((v) => [v.version_id, v]))
  const moves = rows.flatMap((r) => {
    const vals = (byId.get(r.version_id)?.ratings ?? []).filter((v): v is number => v !== null)
    return vals.length >= 2 ? [{ r, d: vals[vals.length - 1] - vals[0], vals }] : []
  })
  const up = moves.filter((m) => m.d > 0).sort((a, b) => b.d - a.d).slice(0, 5)
  const down = moves.filter((m) => m.d < 0).sort((a, b) => a.d - b.d).slice(0, 5)
  const list = (dir: 'up' | 'down', items: typeof up) => (
    <div className="lb-movers-col">
      <h3>
        <Icon id={dir === 'up' ? 'i-up' : 'i-down'} />
        {T.movers[dir][win]}
      </h3>
      <table className="table">
        <tbody aria-busy={state === 'loading' || undefined}>
          {state === 'loading' || !series ? (
            Array.from({ length: 5 }, (_, i) => (
              <tr key={i}>
                <td className="rank">
                  <Skel w={18} />
                </td>
                <td>
                  <Skel w={140} />
                </td>
                <td className="wide-only">
                  <Skel w={88} />
                </td>
                <td className="r">
                  <Skel w={42} />
                </td>
              </tr>
            ))
          ) : items.length === 0 ? (
            <tr>
              <td className="muted">{T.movers.nobody}</td>
            </tr>
          ) : (
            items.map(({ r, d, vals }) => (
              <tr className={you && r.owner === you ? 'you' : undefined} key={r.version_id}>
                <td className="rank">{r.rank}</td>
                <td>
                  <span className="who">
                    <span>
                      <ModelLink modelId={r.model_id} name={r.model} version={r.version} k={r.class} />
                      {you && r.owner === you ? <span className="you-tag">{common.marks.you}</span> : null}
                    </span>
                    <small>
                      <Owner handle={r.owner} baseline={r.baseline} />
                    </small>
                  </span>
                </td>
                <td className="wide-only">
                  <SeasonSpark values={vals} k={r.class} />
                </td>
                <td className="r">
                  <span className={cx('lb-delta', dir)} title={fill(T.movers.change, { n: (d > 0 ? '+' : '−') + Math.abs(d).toFixed(1) })}>
                    {dir === 'up' ? '▲' : '▼'} {Math.abs(d).toFixed(1)}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
  return (
    <>
      <div className="lb-movers">
        {list('up', up)}
        {list('down', down)}
      </div>
      <PanelFoot>{T.movers.foot}</PanelFoot>
    </>
  )
}
