// The replay viewer, which is the cartridge's and not this application's.
//
// ants/viz/dist is built by the game's own repository and vendored into
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

type Viewer = { destroy: () => void }
type VizModule = {
  mount: (target: HTMLElement, replay: unknown, opts?: Record<string, unknown>) => Promise<Viewer>
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
  autoplay,
  turn,
  onTurn,
  className,
}: {
  /** Null while the match is still being fetched. The frame is drawn either way,
   *  at the height it will keep, so the page below does not move. */
  match: ReplayMatch | null
  height?: number
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
        if (!res.ok) throw new Error(`the replay store answered ${res.status}`)
        const envelope: unknown = await res.json()
        if (!live) return
        // `height` is the viewer's own option: its root is a flex column and would
        // otherwise collapse to its bar.
        viewer = await viz.mount(el, envelope, {
          autoplay: autoplay ?? false,
          height,
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
  }, [url, game, autoplay, height, labels])

  return (
    <div className={cx('replay', className)} style={height ? { minHeight: height } : undefined}>
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
      <State live title="Loading a match">
        <p>The board appears here.</p>
      </State>
    )
  }
  if (!hasUrl) {
    // There is nothing to replay, and which nothing it is depends on the match.
    return (
      <State title="No replay">
        <p>
          {match.status === 'cancelled'
            ? 'This match was cancelled before it started, so nothing was played.'
            : match.status === 'pending'
              ? 'This match has not been played yet.'
              : 'The replay has not been stored for this match.'}
        </p>
      </State>
    )
  }
  if (phase.at === 'loading' || phase.at === 'idle') {
    return (
      <State live title="Loading the replay">
        <p>The cartridge re-simulates the match from the recorded actions.</p>
      </State>
    )
  }
  if (phase.at === 'unavailable') {
    return (
      <State title="The viewer is not available">
        <p>
          This deployment is not serving the game's viewer bundle. Run <code>npm run vendor:viewers</code> and
          rebuild; the match itself, its seats and its scores are all still shown above.
        </p>
      </State>
    )
  }
  return (
    <State title="The replay could not be shown">
      <p>{phase.at === 'failed' ? phase.why : 'The viewer stopped before it could draw.'}</p>
      {match.engine_digest ? <p className="digest">played on {match.engine_digest.slice(0, 19)}…</p> : null}
    </State>
  )
}
