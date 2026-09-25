// The watch page, /matches/:id: where a match is watched to its last turn and the next one picked.
//
// Two columns from 1100px: the match on the left (the Stage player, the title row, the ants graph,
// the result strip, the comments, the details folded), Watch next on the right. One column below,
// in the order a phone reads it: player (stuck under the bar), title, graph, result, Watch next,
// comments, details. The guide is its rail here, to give the board the width.
//
// Rules the code does not say on its own:
//
// - THE BOARD IS SIZED TO THE VIEWPORT so the seat bar, the board and the transport fit under the
//   bar. The bars' height depends on how many rows the seat cards take, which the viewer decides from
//   the seat count and the width (seatColumns in ants' shell.js); it is estimated once, when the
//   match opens, and never again: a new stageHeight remounts the viewer and loses the reader's turn.
// - It plays on open unless the link carried `?turn=`, which opens paused there. A match that
//   finishes while it is open takes the slot paused at turn zero, since nobody asked it to play.
// - While a match is queued or live the page re-reads it, and the rail, every thirty seconds with
//   the tab visible (the comments poll themselves). A re-read keeps the first replay URL: the URL is
//   signed per read, and a new one would decode the match again under the reader.
// - A private match (a trial in progress, a rejected candidate's) is readable by the person seated
//   in it through /v1/me/matches/{id}: the public route's 404 is tried there before it is a 404. It
//   has no rail, no thread and no watch counter, since each of those is public.
// - A seat's colour is the viewer's (its SEATS export), so a swatch here is the colour of the
//   colony on the board; the seat number is its name, never the colour alone.

import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ApiError, api, type Match, type MatchPlayer, type MatchSummary, type WatchVia } from '../api'
import type { Async } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { usePlatform } from '../providers/platform-context'
import { useSelection } from '../lib/selection'
import { ago, dateTime, ms, num, rating as fmtRating } from '../lib/format'
import { byPlace, isLive, placeWord, ratingMove } from '../lib/match'
import { labelsOf, loadViz, type VizViewer } from '../lib/viz'
import { cx } from '../lib/cx'
import { count, fill, lookup } from '../lib/copy'
import { Shell } from '../components/Shell'
import { Breadcrumbs, Icon, KeyValueList, Notice, Rich, Skel } from '../components/ui'
import { ClassBadge, MatchBadge, ModelLink, Owner } from '../components/Model'
import { AskForHelp } from '../components/Help'
import { Replay } from '../components/Replay'
import { MatchGraph, MatchTile } from '../components/Viewer'
import { MatchCard } from '../components/MatchCard'
import { Comments } from '../components/Comments'
import { Permalink } from '../components/Permalink'
import T from '../../copy/match.json'
import common from '../../copy/common.json'

const POLL_MS = 30_000
const VIAS: WatchVia[] = ['tv', 'shelf', 'grid', 'next', 'rail', 'link']

/** Keyed by the id, so following a Watch next card starts the page over: its player, its turn, its
 *  counters and its polls all belong to one match. */
export default function MatchPage() {
  const { id = '' } = useParams()
  return <WatchRoute id={id} key={id} />
}

type Watched = { m: Match; mine: boolean }

function WatchRoute({ id }: { id: string }) {
  const result = useWatched(id)
  if (result.state === 'loading') return <WatchSkeleton />
  return (
    <Permalink result={result} kind="match" label={T.loading}>
      {(w) => <Watch initial={w.m} mine={w.mine} />}
    </Permalink>
  )
}

/** The public match, else, for a signed-in reader, the same id among their own matches. */
function useWatched(id: string): Async<Watched> & { reload: () => void } {
  const { session } = useSession()
  const [pub, setPub] = useState<Async<Match>>({ state: 'loading', data: null, error: null })
  const [own, setOwn] = useState<Async<Match> | null>(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => {
    setPub({ state: 'loading', data: null, error: null })
    setOwn(null)
    setNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    let live = true
    api.match(id).then(
      (m) => live && setPub({ state: 'ready', data: m, error: null }),
      (err: unknown) => live && setPub({ state: 'error', data: null, error: asApiError(err) }),
    )
    return () => {
      live = false
    }
  }, [id, nonce])

  const missing = pub.state === 'error' && pub.error.status === 404
  const signedIn = session.state === 'signed-in'
  useEffect(() => {
    if (!missing || !signedIn) return
    let live = true
    api.myMatch(id).then(
      (m) => live && setOwn({ state: 'ready', data: m, error: null }),
      (err: unknown) => live && setOwn({ state: 'error', data: null, error: asApiError(err) }),
    )
    return () => {
      live = false
    }
  }, [missing, signedIn, id, nonce])

  const loading = { state: 'loading', data: null, error: null, reload } as const
  if (pub.state === 'loading') return loading
  if (pub.state === 'ready') return { state: 'ready', data: { m: pub.data, mine: false }, error: null, reload }
  // Not public. Whether it is the reader's own waits on knowing who the reader is.
  if (missing && session.state === 'loading') return loading
  if (missing && signedIn) {
    if (!own || own.state === 'loading') return loading
    if (own.state === 'ready') return { state: 'ready', data: { m: own.data, mine: true }, error: null, reload }
    // Their route's refusal is not more telling than the public 404, unless it is not a 404.
    if (own.error.status !== 404) return { ...own, reload }
  }
  return { ...pub, reload }
}

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, 'unknown', err instanceof Error ? err.message : String(err))
}

// ---- sizing -------------------------------------------------------------------------------

const PHONE = '(max-width: 760px)'

/** How tall the board is, and the whole slot (board plus the viewer's bars), as CSS lengths. Read
 *  once per match: see the header. The numbers mirror the viewer's own layout (a seat card is 46px,
 *  its bar 16px of padding and 6px between rows; the transport is one 53px row, two on a phone). */
function sizeFor(seats: number): { board: string; slot: string } {
  const w = typeof window === 'undefined' ? 1440 : window.innerWidth
  const phone = typeof window !== 'undefined' && window.matchMedia(PHONE).matches
  const rail = w > 1000 ? 72 : 0
  const gutter = w <= 640 ? 16 : 24
  const column = w > 1100 ? w - rail - 2 * gutter - 400 - 24 : w - rail - 2 * gutter
  const rows = Math.ceil(seats / seatColumns(seats, column - 22))
  const bars = 17 + rows * 46 + (rows - 1) * 6 + (phone ? 90 : 53) + 2
  // The announcements sit between the bar and the player on first view, so the player's first
  // screen leaves room for them too: their height is a variable the stack keeps current.
  const board = phone ? 'clamp(160px, 32svh, 360px)' : `clamp(300px, calc(100dvh - var(--site-bar-h) - var(--site-anns-h, 0px) - ${bars + 32}px), 1200px)`
  return { board, slot: `calc(${board} + ${bars}px)` }
}

/** The viewer's rule for its seat cards' columns, which this page cannot ask it before it mounts. */
function seatColumns(n: number, width: number): number {
  if (width < 640) return Math.min(n, 2)
  for (let rows = 1; rows < n; rows++) {
    const cols = Math.ceil(n / rows)
    if (cols <= 4 && cols * 160 <= width) return cols
  }
  return 1
}

/** The viewer's seat colours, once its module has loaded; empty until then. */
function useSeatColours(game: string): readonly string[] {
  const [colours, setColours] = useState<readonly string[]>([])
  useEffect(() => {
    let live = true
    loadViz(game)
      .then((viz) => {
        const seats: unknown = viz.SEATS
        if (live && Array.isArray(seats)) setColours(seats.filter((c): c is string => typeof c === 'string'))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [game])
  return colours
}

// ---- the page -----------------------------------------------------------------------------

function Watch({ initial, mine }: { initial: Match; mine: boolean }) {
  const [m, setM] = useState(initial)
  const id = m.id
  const { me } = useSession()
  const location = useLocation()
  const [search] = useSearchParams()
  const asked = Number.parseInt(search.get('turn') ?? '', 10)
  const shared = Number.isFinite(asked) && asked >= 0 ? asked : null

  const played = m.status === 'rated' || m.status === 'finished'
  const queuedOrLive = m.status === 'pending' || isLive(m.status)
  // Decided when the page opens: a match that finishes later rests paused at turn zero.
  const [openedPlayed] = useState(played)
  const [size] = useState(() => sizeFor(m.seats.length))
  const [viewer, setViewer] = useState<VizViewer | null>(null)
  const viewerRef = useRef<VizViewer | null>(null)
  const [turn, setTurn] = useState<number | null>(shared)
  const player = useRef<HTMLDivElement>(null)
  const colours = useSeatColours(m.game)

  const onViewer = useCallback((v: VizViewer | null) => {
    viewerRef.current = v
    setViewer(v)
  }, [])

  // ---- the watch counter: one open per page, one finish per page, public matches only.
  const via = viaOf(location.state)
  const opened = useRef(false)
  useEffect(() => {
    if (mine || opened.current) return
    opened.current = true
    api.recordEvent({ event: 'opened', match: id, via }).catch(() => undefined)
  }, [id, mine, via])
  const finished = useRef(false)
  const onTurn = (t: number) => {
    setTurn(t)
    const last = viewerRef.current?.range?.hi ?? m.turns
    if (mine || finished.current || last === null || last === undefined || t < last) return
    finished.current = true
    api.recordEvent({ event: 'finished', match: id }).catch(() => undefined)
  }

  // Comments' `#126` links move the player and pause it, and bring it back into view.
  const seek = (t: number) => {
    viewerRef.current?.seek?.(t)
    viewerRef.current?.pause?.()
    player.current?.scrollIntoView({ block: 'nearest' })
  }

  // ---- Watch next, and the re-reads while the match is queued, live or being counted.
  const [rail, setRail] = useState<Async<MatchSummary[]>>({ state: 'loading', data: null, error: null })
  const readRail = useCallback(
    (quiet: boolean) => {
      api.relatedMatches(id).then(
        (r) => setRail({ state: 'ready', data: r.matches, error: null }),
        (err: unknown) => {
          // A failed re-read keeps the rail on show; only a first read says it failed.
          if (!quiet) setRail({ state: 'error', data: null, error: asApiError(err) })
        },
      )
    },
    [id],
  )
  useEffect(() => {
    if (!mine) readRail(false)
  }, [mine, readRail])

  // A counted match's rating change arrives with the count clock, so a match being counted is
  // re-read too, though its rail is not.
  const polling = queuedOrLive || m.status === 'finished'
  useEffect(() => {
    if (!polling) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      ;(mine ? api.myMatch(id) : api.match(id)).then(
        (next) => setM((prev) => (prev.replay_url ? { ...next, replay_url: prev.replay_url } : next)),
        () => undefined,
      )
      if (queuedOrLive && !mine) readRail(true)
    }
    const t = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [polling, queuedOrLive, mine, id, readRail])

  const n = m.seats.length
  const bySeat = [...m.seats].sort((a, b) => a.seat - b.seat)
  const pair = n === 2 ? bySeat : null
  const tab = pair ? fill(T.tab.pair, { a: pair[0].model, b: pair[1].model }) : fill(T.tab.many, { n })

  return (
    <Shell title={tab} season={m.season} rail>
      <div className={cx('wrap', 'watch', mine && 'solo')}>
        <div className="watch-main">
          <div className="watch-player" ref={player}>
            {played ? (
              <Replay
                match={m}
                tier="stage"
                stageHeight={size.board}
                height={size.slot}
                autoplay={openedPlayed && shared === null}
                turn={shared ?? undefined}
                onTurn={onTurn}
                onViewer={onViewer}
              />
            ) : (
              <div className="watch-slot" style={{ height: size.slot }}>
                <StateNotice m={m} />
                <MatchTile
                  id={m.id}
                  game={m.game}
                  season={m.season}
                  map={m.map}
                  hasFrame={false}
                  labels={labelsOf(m.seats)}
                  preview={false}
                  className="watch-board"
                />
              </div>
            )}
          </div>

          <TitleRow m={m} pair={pair} mine={mine} turn={played ? turn : null} />

          {played ? <MatchGraph game={m.game} viewer={viewer} className="watch-graph" /> : null}

          {played ? <ResultStrip m={m} colours={colours} you={me?.handle ?? null} /> : null}

          {mine ? null : (
            <Comments host={{ match: m.id }} lastTurn={played ? m.turns : null} turn={turn} onSeek={seek} className="watch-comments" />
          )}

          <Details m={m} />
        </div>

        {mine ? null : (
          <WatchNext
            m={m}
            rail={rail}
            onRetry={() => {
              setRail({ state: 'loading', data: null, error: null })
              readRail(false)
            }}
          />
        )}
      </div>
    </Shell>
  )
}

function viaOf(state: unknown): WatchVia {
  const via = state && typeof state === 'object' && 'via' in state ? (state as { via: unknown }).via : null
  return VIAS.find((v) => v === via) ?? 'link'
}

// ---- the title row ------------------------------------------------------------------------

function TitleRow({ m, pair, mine, turn }: { m: Match; pair: MatchPlayer[] | null; mine: boolean; turn: number | null }) {
  const { seasonName } = usePlatform()
  const { href } = useSelection()
  const played = m.status === 'rated' || m.status === 'finished'
  const board = (
    <Link to={`${href('/maps', { season: m.season })}#${m.map}`}>
      <b>{m.map}</b>
    </Link>
  )

  const parts: ReactNode[] = [<Outcome m={m} key="outcome" />]
  if (pair) parts.push(<Rich text={T.line.board} vars={{ map: board }} key="board" />)
  if (played && m.turns !== null) parts.push(<span key="turns">{count(T.line.turns, m.turns, { n: num(m.turns) })}</span>)
  const at = m.played_at ?? m.created_at
  parts.push(
    <time dateTime={at} title={dateTime(at)} key="when">
      {ago(at)}
    </time>,
  )
  parts.push(
    <Link to={href('/', { season: m.season })} key="season">
      {seasonName(m.season)}
    </Link>,
  )

  return (
    <section className="watch-title">
      <div className="watch-title-main">
        <Breadcrumbs
          items={[
            { label: T.crumb, to: href('/matches', { season: m.season }), icon: 'i-matches' },
            { label: fill(T.crumbHere, { id: m.id.slice(0, 8) }) },
          ]}
        />
        <div className="watch-h">
          <h1>
            {pair ? (
              <>
                {pair[0].model} <span className="v">v{pair[0].version}</span> <span className="v">{T.title.vs}</span> {pair[1].model}{' '}
                <span className="v">v{pair[1].version}</span>
              </>
            ) : (
              <>
                {fill(T.title.many, { n: m.seats.length })} <span className="v">{fill(T.title.onMap, { map: m.map })}</span>
              </>
            )}
          </h1>
          <MatchBadge status={m.status} quiet={false} />
          {m.is_trial ? (
            <span className="mark">
              <Icon id="i-flask" />
              {T.trial}
            </span>
          ) : null}
          {mine ? (
            <span className="mark">
              <Icon id="i-lock" />
              {T.private}
            </span>
          ) : null}
        </div>
        <p className="watch-line">
          {parts.map((p, i) => (
            <span key={i}>
              {i ? <span aria-hidden="true">{' · '}</span> : null}
              {p}
            </span>
          ))}
        </p>
      </div>
      <div className="watch-actions">
        <ShareButton id={m.id} turn={turn} />
      </div>
    </section>
  )
}

function Outcome({ m }: { m: Match }) {
  switch (m.status) {
    case 'pending':
      return <>{T.line.queued}</>
    case 'claimed':
    case 'running':
      return <>{T.line.live}</>
    case 'cancelled':
      return <>{T.line.cancelled}</>
    case 'failed':
      return <>{T.line.failed}</>
    default:
      break
  }
  const winners = byPlace(m.seats).filter((p) => p.rank === 1 && p.outcome !== 'dq')
  if (winners.length > 1) return <Rich text={T.line.shared} vars={{ models: winners.map((p) => p.model).join(T.line.sharedJoin) }} />
  if (winners[0]) return <Rich text={T.line.won} vars={{ model: winners[0].model, version: String(winners[0].version ?? '') }} />
  return <>{T.line.none}</>
}

function ShareButton({ id, turn }: { id: string; turn: number | null }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const url = `${window.location.origin}/matches/${id}${turn !== null ? `?turn=${turn}` : ''}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // No clipboard on an insecure origin; the address bar still holds the match.
    }
  }
  return (
    <button className="btn sm" type="button" onClick={() => void copy()} title={T.share.title}>
      <Icon id="i-link" />
      <span aria-live="polite">{copied ? T.share.copied : turn !== null ? fill(T.share.turn, { turn }) : T.share.link}</span>
    </button>
  )
}

// ---- the state notice, over the board at turn zero ----------------------------------------

function StateNotice({ m }: { m: Match }) {
  if (m.status === 'cancelled') {
    return (
      <Notice tone="info" title={T.notice.cancelled}>
        {m.withdrawn_reason || m.successor ? (
          <p>
            {m.withdrawn_reason}
            {m.successor ? (
              <>
                {m.withdrawn_reason ? ' ' : null}
                <Rich
                  text={T.notice.successor}
                  vars={{
                    version: (
                      <Link to={`/versions/${m.successor.version_id}`}>
                        {m.successor.model} v{m.successor.version}
                      </Link>
                    ),
                  }}
                />
              </>
            ) : null}
          </p>
        ) : null}
      </Notice>
    )
  }
  if (m.status === 'failed') {
    // A failure is the fleet's, never a seat's: a model's own mistakes are strikes.
    const why = m.fault_reason ? (lookup(T.notice.failedReasons, m.fault_reason) ?? m.fault_reason) : null
    return (
      <Notice tone="bad" title={T.notice.failed}>
        {why ? <p>{why}</p> : null}
        <AskForHelp />
      </Notice>
    )
  }
  if (isLive(m.status)) {
    return (
      <Notice tone="info" title={T.notice.live}>
        <p>{T.notice.liveBody}</p>
      </Notice>
    )
  }
  return (
    <Notice tone="warn" title={T.notice.queued}>
      <p>{T.notice.queuedBody}</p>
    </Notice>
  )
}

// ---- the result strip ---------------------------------------------------------------------

/** Seats in finishing order, one row each; two players are one scoreline. The Stage's seat bar
 *  already shows the scores, so this adds the order, the rating moves and the strikes. */
function ResultStrip({ m, colours, you }: { m: Match; colours: readonly string[]; you: string | null }) {
  const seats = byPlace(m.seats)
  const swatch = (p: MatchPlayer): CSSProperties | undefined =>
    colours.length ? ({ '--seat': colours[p.seat % colours.length] } as CSSProperties) : undefined

  if (seats.length === 2) {
    const [a, b] = seats
    return (
      <section className="panel watch-result" aria-labelledby="result-h">
        <h2 className="vis-hidden" id="result-h">
          {T.result.title}
        </h2>
        <div className="watch-scoreline">
          <ScoreSide p={a} m={m} seats={seats} style={swatch(a)} you={you} />
          <span className="watch-scores">
            <b>{a.score ?? '—'}</b>
            <span aria-hidden="true">–</span>
            <b>{b.score ?? '—'}</b>
          </span>
          <ScoreSide p={b} m={m} seats={seats} style={swatch(b)} you={you} end />
        </div>
      </section>
    )
  }

  return (
    <section className="panel watch-result" aria-labelledby="result-h">
      <h2 className="vis-hidden" id="result-h">
        {T.result.title}
      </h2>
      {seats.map((p, i) => (
        <div className={cx('watch-seat', i === 0 && 'first', you !== null && p.owner === you && 'you')} style={swatch(p)} key={p.seat}>
          <span className="watch-place">{placeWord(p, seats)}</span>
          <Swatch seat={p.seat} />
          <Who p={p} you={you} />
          <Changes p={p} m={m} />
          <Strikes count={p.strikes ?? 0} limit={m.strike_limit} />
          <span className="watch-score">{p.score ?? '—'}</span>
        </div>
      ))}
    </section>
  )
}

function ScoreSide({
  p,
  m,
  seats,
  style,
  you,
  end = false,
}: {
  p: MatchPlayer
  m: Match
  seats: MatchPlayer[]
  style: CSSProperties | undefined
  you: string | null
  end?: boolean
}) {
  return (
    <div className={cx('watch-side', end && 'end', you !== null && p.owner === you && 'you')} style={style}>
      <div className="watch-side-top">
        <Swatch seat={p.seat} />
        <span className="watch-place">{placeWord(p, seats)}</span>
      </div>
      <Who p={p} you={you} />
      <div className="watch-side-foot">
        <Changes p={p} m={m} />
        <Strikes count={p.strikes ?? 0} limit={m.strike_limit} />
      </div>
    </div>
  )
}

function Swatch({ seat }: { seat: number }) {
  const name = fill(T.result.seat, { n: seat + 1 })
  return <i className="watch-swatch" role="img" aria-label={name} title={name} />
}

function Who({ p, you }: { p: MatchPlayer; you: string | null }) {
  return (
    <span className="watch-who">
      <b>
        <ModelLink modelId={p.model_id} name={p.model} version={p.version} />
        {you !== null && p.owner === you ? <span className="you-tag">{common.marks.you}</span> : null}
      </b>
      <small>
        <Owner handle={p.owner} baseline={p.baseline} />
        <ClassBadge k={p.class} />
      </small>
    </span>
  )
}

/** The rating change on each ladder the match counted on: an arrow's shape and a number. */
function Changes({ p, m }: { p: MatchPlayer; m: Match }) {
  if (m.status === 'finished' && m.ladders.length) {
    return (
      <span className="watch-changes">
        <span className="mark" title={T.result.countingTitle}>
          <Icon id="i-clock" />
          {T.result.counting}
        </span>
      </span>
    )
  }
  const change = p.rating_change
  if (m.status !== 'rated' || !change) return <span className="watch-changes" />
  return (
    <span className="watch-changes">
      {m.ladders
        .filter((l) => change[l])
        .map((ladder) => {
          const c = change[ladder]
          const label = ladder === 'open' ? T.result.open : ladder
          const move = ratingMove(c)
          const now = fmtRating(c.mu_after - 3 * c.sigma_after)
          if (move === null) {
            return (
              <span title={fill(T.result.newTitle, { ladder: label, rating: now })} key={ladder}>
                <span className="lad">{label}</span>
                {T.result.new}
              </span>
            )
          }
          const dir = move > 0.05 ? 'up' : move < -0.05 ? 'down' : 'flat'
          return (
            <span title={fill(T.result.changeTitle, { ladder: label, rating: now })} key={ladder}>
              <span className="lad">{label}</span>
              <span className={`trend ${dir}`}>
                {dir === 'up' ? '▲' : dir === 'down' ? '▼' : null} {Math.abs(move).toFixed(1)}
              </span>
            </span>
          )
        })}
    </span>
  )
}

function Strikes({ count: n, limit }: { count: number; limit: number | null }) {
  if (limit === null) {
    return <span className="watch-strikes">{n ? count(T.result.strikesNoLimit, n) : null}</span>
  }
  const label = fill(T.result.strikes, { count: n, limit })
  return (
    <span className="watch-strikes" role="img" aria-label={label} title={label}>
      <span className="strikes" aria-hidden="true">
        {Array.from({ length: limit }, (_, i) => (
          <i className={i < n ? (n >= limit ? 'over' : 'on') : undefined} key={i} />
        ))}
      </span>
    </span>
  )
}

// ---- details ------------------------------------------------------------------------------

function Details({ m }: { m: Match }) {
  const n = m.seats.length
  return (
    <details className="panel watch-details">
      <summary>
        <Icon id="i-chevron" />
        {T.details.title}
      </summary>
      <div className="panel-body">
        <KeyValueList
          items={[
            {
              key: T.details.countsOn,
              value: m.ladders.length ? m.ladders.map((l) => (l === 'open' ? T.result.open : l)).join(' · ') : T.details.noLadder,
              hint: m.is_trial ? T.details.trialHint : undefined,
            },
            { key: T.details.seats, value: fill(T.details.seatsValue, { n }) },
            { key: T.details.turns, value: num(m.turns) },
            { key: T.details.playedIn, value: ms(m.played_ms) },
            { key: T.details.seed, value: <span className="mono">{m.seed}</span> },
            { key: T.details.engine, value: <span className="hash">{m.engine_digest ?? '—'}</span> },
            ...(m.orion_version ? [{ key: T.details.runtime, value: fill(T.details.runtimeValue, { version: m.orion_version }) }] : []),
          ]}
        />
      </div>
    </details>
  )
}

// ---- Watch next ---------------------------------------------------------------------------

type Groups = { theirs: MatchSummary[]; board: MatchSummary[]; latest: MatchSummary[] }

/** The route sends its twelve in group order (these models', then this board's, then the season's
 *  latest) but does not mark the groups, so they are read back in that order: a card sharing a
 *  model with this match while the first group is still open, then one on this board, then the
 *  rest. The first card that fits neither closes the group before it. */
function groupsOf(m: Match, list: MatchSummary[]): Groups {
  const models = new Set(m.seats.map((s) => s.model_id))
  const out: Groups = { theirs: [], board: [], latest: [] }
  let at = 0
  for (const c of list) {
    if (at === 0 && out.theirs.length < 6 && c.seats.some((s) => models.has(s.model_id))) {
      out.theirs.push(c)
      continue
    }
    if (at === 0) at = 1
    if (at === 1 && out.board.length < 3 && c.map === m.map) {
      out.board.push(c)
      continue
    }
    at = 2
    out.latest.push(c)
  }
  return out
}

function theirsTitle(m: Match): string {
  const names = [...new Set(byPlace(m.seats).map((s) => s.model))]
  if (names.length === 1) return fill(T.next.theirsOne, { a: names[0] })
  if (names.length === 2) return fill(T.next.theirsTwo, { a: names[0], b: names[1] })
  return T.next.theirsMany
}

function WatchNext({ m, rail, onRetry }: { m: Match; rail: Async<MatchSummary[]>; onRetry: () => void }) {
  let body: ReactNode
  if (rail.state === 'loading') {
    body = (
      <div className="watch-next-list" role="status" aria-label={T.next.loading}>
        {Array.from({ length: 6 }, (_, i) => (
          <div className="mcard row" aria-hidden="true" key={i}>
            <div className="tile-box skel" />
            <div className="watch-next-skel">
              <Skel w="90%" />
              <Skel w="60%" />
            </div>
          </div>
        ))}
      </div>
    )
  } else if (rail.state === 'error') {
    body = (
      <p className="watch-next-note">
        {T.next.failed}{' '}
        <button className="btn sm ghost" type="button" onClick={onRetry}>
          {T.next.retry}
        </button>
      </p>
    )
  } else if (rail.data.length === 0) {
    body = <p className="watch-next-note">{T.next.empty}</p>
  } else {
    const g = groupsOf(m, rail.data)
    body = (
      <>
        <RailGroup title={theirsTitle(m)} list={g.theirs} />
        <RailGroup title={T.next.board} list={g.board} />
        <RailGroup title={T.next.latest} list={g.latest} />
      </>
    )
  }
  return (
    <aside className="watch-next" aria-labelledby="next-h">
      <h2 id="next-h">{T.next.title}</h2>
      {body}
    </aside>
  )
}

function RailGroup({ title, list }: { title: string; list: MatchSummary[] }) {
  if (!list.length) return null
  return (
    <section className="watch-next-group">
      <h3>{title}</h3>
      <div className="watch-next-list">
        {list.map((c) => (
          <MatchCard m={c} layout="row" via="next" key={c.id} />
        ))}
      </div>
    </section>
  )
}

// ---- loading ------------------------------------------------------------------------------

/** The page's own shape while the match is read: the player's slot at its final height, the title
 *  row's lines and the rail's rows. */
function WatchSkeleton() {
  const [size] = useState(() => sizeFor(2))
  return (
    <Shell title={T.loading} rail>
      <div className="wrap watch" role="status" aria-label={T.loading}>
        <div className="watch-main" aria-hidden="true">
          <div className="watch-player">
            <div className="watch-slot skel" style={{ height: size.slot }} />
          </div>
          <section className="watch-title">
            <div className="watch-title-main">
              <Skel w={120} />
              <div className="watch-h">
                <h1>
                  <Skel w="min(420px, 80%)" />
                </h1>
              </div>
              <p className="watch-line">
                <Skel w="min(360px, 70%)" />
              </p>
            </div>
          </section>
        </div>
        <aside className="watch-next" aria-hidden="true">
          <h2>
            <Skel w={120} />
          </h2>
          <div className="watch-next-list">
            {Array.from({ length: 6 }, (_, i) => (
              <div className="mcard row" key={i}>
                <div className="tile-box skel" />
                <div className="watch-next-skel">
                  <Skel w="90%" />
                  <Skel w="60%" />
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Shell>
  )
}
