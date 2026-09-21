// The replay viewer, which is the cartridge's and not this application's.
//
// The viewer is built by the game's own repository (viz/ in its release archive) and vendored into
// public/cartridges/<game>/ by scripts/vendor-viewers.sh. It re-simulates through
// the same component digest that recorded the match, so the viewer and the referee
// cannot disagree. THERE IS NO RULE IN THIS FILE, and there must never be one.
//
// It is loaded rather than bundled: `mount()` is the framework-free entry point,
// and loading it from public/ keeps the transpiled component's own
// `new URL(..., import.meta.url)` fetch of its .wasm pointing at the directory it
// was copied into. NOTHING HERE STYLES IT — the viewer reads this application's
// tokens for its chrome and follows the theme switch on its own.

import { useEffect, useRef, useState } from 'react'
import type { Match, MatchPlayer } from '../api'
import { cx } from '../lib/cx'
import { fill } from '../lib/copy'
import { Rich } from './ui'
import common from '../../copy/common.json'

const R = common.replay

type Viewer = { destroy: () => void }
type VizModule = {
  mount: (target: HTMLElement, replay: unknown, opts?: Record<string, unknown>) => Promise<Viewer>
  /** The map visual: a board on its own, under its name, player count and size, with no controls.
   *  Absent from a viewer built before it, which BoardPreview then stands in for with `mount`. */
  mountMap?: (target: HTMLElement, board: unknown, opts?: Record<string, unknown>) => Promise<Viewer>
}

type Phase =
  | { at: 'idle' }
  | { at: 'loading' }
  | { at: 'ready' }
  | { at: 'unavailable' }
  | { at: 'failed'; why: string }

/** One module instance per game, so a page with two viewers decodes the component
 *  once. The import is by a literal path prefix so a bundler cannot follow it. */
const modules = new Map<string, Promise<VizModule>>()

function loadViz(game: string): Promise<VizModule> {
  let m = modules.get(game)
  if (!m) {
    m = import(/* @vite-ignore */ `/cartridges/${game}/viz.js`) as Promise<VizModule>
    // A REJECTION IS NOT AN ANSWER TO CACHE. Left in the map, one failed fetch makes every
    // later replay on the page report the viewer missing for as long as the tab is open.
    m.catch(() => modules.delete(game))
    modules.set(game, m)
  }
  return m
}

type ReplayMatch = Pick<Match, 'game' | 'status' | 'replay_url' | 'engine_digest' | 'id' | 'players'>

/** What the viewer calls each seat: the model and whose it is, as every other panel names them.
 *  The replay envelope only has the referee's name for a seat, which is a weights hash.
 *
 *  Without the baseline tag the other panels draw beside the handle: a baseline's handle is in the
 *  reserved `baseline.` namespace, so it already says so, and the viewer's title bar is the one
 *  place eleven more characters cost a seat its owner altogether. */
function seatLabels(players: MatchPlayer[] | undefined) {
  return (players ?? []).map((p) => ({
    seat: p.seat,
    name: p.model,
    by: p.owner ? `@${p.owner}` : '',
  }))
}

export function Replay({
  match,
  height,
  stageHeight,
  autoplay,
  turn,
  onTurn,
  className,
}: {
  /** Null while the match is still being fetched. The frame is drawn either way,
   *  at the height it will keep, so the page below does not move. */
  match: ReplayMatch | null
  /** Pixels, or any CSS length: the viewer sets it on its root, and a length the browser
   *  resolves (`100vh`) follows the window without the match being decoded again. */
  height?: number | string
  /** How tall the BOARD is, as a CSS length; the player is that plus its bars, however many rows the
   *  seats take at this width. Wins over `height` in a viewer that knows it, and `height` is then
   *  the fallback for one that does not. */
  stageHeight?: number | string
  autoplay?: boolean
  /** The turn to open on. Read once, when the viewer mounts: a later change does not seek. */
  turn?: number
  /** Called with the turn on show, as the viewer plays or is stepped. */
  onTurn?: (turn: number) => void
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>({ at: 'idle' })
  const url = match?.replay_url ?? null
  const game = match?.game ?? null
  // A string, so a refetch that brings the same names back does not decode the match again.
  const labels = JSON.stringify(seatLabels(match?.players))
  // Neither is a reason to decode the match again: the opening turn is read at mount, and the
  // callback is reached through a ref so a page may pass a fresh closure on every render.
  const openAt = useRef(turn)
  const tell = useRef(onTurn)
  useEffect(() => {
    tell.current = onTurn
  }, [onTurn])

  useEffect(() => {
    const el = host.current
    if (!el || !url || !game) {
      setPhase({ at: 'idle' })
      return
    }

    let live = true
    let viewer: Viewer | null = null
    setPhase({ at: 'loading' })

    void (async () => {
      let viz: VizModule
      try {
        viz = await loadViz(game)
      } catch {
        // The bundle is not being served: a deployment fact, not a fault in this
        // match, and the page says so rather than blaming the replay.
        if (live) setPhase({ at: 'unavailable' })
        return
      }

      try {
        // Fetched here rather than handed to mount() as a string, so a storage
        // failure is told apart from a decode failure.
        const res = await fetch(url)
        if (!res.ok) throw new Error(fill(R.failedStore, { status: res.status }))
        const envelope: unknown = await res.json()
        if (!live) return
        // `height` is the viewer's own option: its root is a flex column and would
        // otherwise collapse to its bar.
        viewer = await viz.mount(el, envelope, {
          autoplay: autoplay ?? false,
          height,
          stageHeight,
          labels: JSON.parse(labels) as ReturnType<typeof seatLabels>,
          turn: openAt.current,
          onTurn: (f: { turn: number }) => tell.current?.(f.turn),
        })
        if (!live) {
          viewer.destroy()
          return
        }
        setPhase({ at: 'ready' })
      } catch (err) {
        if (live) setPhase({ at: 'failed', why: err instanceof Error ? err.message : String(err) })
      }
    })()

    return () => {
      live = false
      viewer?.destroy()
      // destroy() is the viewer's own teardown; anything it leaves behind would
      // otherwise be drawn twice under StrictMode.
      el.replaceChildren()
    }
  }, [url, game, autoplay, height, stageHeight, labels])

  return (
    // The height is held while the viewer loads, so the page below does not move; once it has drawn,
    // a viewer sizing its own board (stageHeight) is exactly as tall as it needs, and a held height
    // a few pixels taller would leave a band under it.
    <div className={cx('replay', className)} style={height && !(stageHeight && phase.at === 'ready') ? { minHeight: height } : undefined}>
      <div className="replay-host" ref={host} hidden={phase.at !== 'ready'} />
      {phase.at === 'ready' ? null : <ReplayState phase={phase} hasUrl={Boolean(url)} match={match} />}
    </div>
  )
}

function State({ live, title, children }: { live?: boolean; title: string; children: React.ReactNode }) {
  return (
    <div className="replay-state" role={live ? 'status' : undefined} aria-live={live ? 'polite' : undefined}>
      <b>{title}</b>
      {children}
    </div>
  )
}

function ReplayState({ phase, hasUrl, match }: { phase: Phase; hasUrl: boolean; match: ReplayMatch | null }) {
  if (!match) {
    return (
      <State live title={R.loadingMatch}>
        <p>{R.loadingMatchBody}</p>
      </State>
    )
  }
  if (!hasUrl) {
    // There is nothing to replay, and which nothing it is depends on the match.
    return (
      <State title={R.none}>
        <p>{match.status === 'cancelled' ? R.noneCancelled : match.status === 'pending' ? R.nonePending : R.noneMissing}</p>
      </State>
    )
  }
  if (phase.at === 'loading' || phase.at === 'idle') {
    return (
      <State live title={R.loading}>
        <p>{R.loadingBody}</p>
      </State>
    )
  }
  if (phase.at === 'unavailable') {
    return (
      <State title={R.unavailable}>
        <p>
          <Rich text={R.unavailableBody} />
        </p>
      </State>
    )
  }
  return (
    <State title={R.failed}>
      <p>{phase.at === 'failed' ? phase.why : R.failedBody}</p>
      {match.engine_digest ? <p className="digest">{fill(R.failedDigest, { digest: match.engine_digest.slice(0, 19) })}</p> : null}
    </State>
  )
}

/**
 * A board at turn zero, drawn by the cartridge's own viewer: a season map as a competitor will
 * meet it.
 *
 * THE MAP VISUAL (`mountMap`): the board under its name, its player count and its size in cells,
 * with no seats, no transport and no tray -- a board is read, not played. The board is handed over
 * whole and the viewer takes its opening position from the cartridge, so this draws what the
 * engine says the board is and nothing this application decided. Mounted only once
 * it scrolls near the window: a season of thirty boards is thirty decodes, and most of them are
 * below the fold.
 */
export function BoardPreview({
  game,
  board,
  height = 280,
  maxHeight = 520,
  className,
}: {
  game: string
  /** The map file as uploaded. Only the viewer reads inside it. */
  board: unknown
  /** What the slot holds while the viewer loads -- and the whole height, for a viewer without
   *  `mountMap`, which draws a board inside the replay player instead. */
  height?: number
  /** The tallest a tall board is drawn by the map visual, which otherwise takes its own shape. */
  maxHeight?: number
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const [phase, setPhase] = useState<Phase>({ at: 'idle' })

  useEffect(() => {
    const el = host.current
    if (!el || near) return
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true)
          seen.disconnect()
        }
      },
      { rootMargin: '400px' },
    )
    seen.observe(el)
    return () => seen.disconnect()
  }, [near])

  useEffect(() => {
    const el = host.current
    if (!el || !near || !board) return
    let live = true
    let viewer: Viewer | null = null
    setPhase({ at: 'loading' })
    void (async () => {
      let viz: VizModule
      try {
        viz = await loadViz(game)
      } catch {
        if (live) setPhase({ at: 'unavailable' })
        return
      }
      try {
        if (viz.mountMap) {
          // The map visual: the board, its name, its player count and its size, and nothing
          // to operate -- no seats, no transport, no tray.
          viewer = await viz.mountMap(el, board, { maxHeight })
        } else {
          // A viewer from before the map visual: the board as a replay of no moves.
          const { id, players } = board as { id?: unknown; players?: unknown }
          const envelope = { seed: 1, max_turns: 1, turns: 0, map_id: typeof id === 'string' ? id : 'map', map: board, deltas: [] }
          const labels = Array.from({ length: typeof players === 'number' ? players : 0 }, (_, seat) => ({ seat, name: fill(R.boardSeat, { n: seat + 1 }), by: '' }))
          viewer = await viz.mount(el, envelope, { height, autoplay: false, labels })
        }
        if (!live) {
          viewer.destroy()
          return
        }
        setPhase({ at: 'ready' })
      } catch (err) {
        if (live) setPhase({ at: 'failed', why: err instanceof Error ? err.message : String(err) })
      }
    })()
    return () => {
      live = false
      viewer?.destroy()
      el.replaceChildren()
    }
  }, [near, board, game, height, maxHeight])

  return (
    <div className={cx('replay', 'board-preview', className)} style={phase.at === 'ready' ? undefined : { minHeight: height }}>
      <div className="replay-host" ref={host} />
      {phase.at === 'ready' ? null : (
        <div className="replay-state">
          <b>{phase.at === 'unavailable' ? R.unavailable : phase.at === 'failed' ? R.boardFailed : R.boardDrawing}</b>
          {phase.at === 'failed' ? <p>{phase.why}</p> : null}
        </div>
      )}
    </div>
  )
}

