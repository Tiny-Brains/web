// The replay viewer, which is the cartridge's and not this application's.
//
// ants/viz/dist is built by the game's own repository and vendored into
// public/cartridges/<game>/ by scripts/vendor-viewers.sh. It re-simulates through
// the same component digest that recorded the match -- replay-decode, transpiled
// by jco and running in the browser -- so the viewer and the referee cannot
// disagree about what happened. THERE IS NO RULE IN THIS FILE, and there must
// never be one: a JavaScript re-implementation of a rule in the viewer would be
// a second engine.
//
// It is loaded rather than bundled. `mount()` is the framework-free entry point;
// the bundle also ships a React wrapper, but that one imports React as a peer
// through a bare specifier, which a file served from public/ cannot resolve.
// Loading the plain entry keeps the transpiled component's own `new URL(...,
// import.meta.url)` fetch of its .wasm pointing at the directory it was copied
// into, which is the whole reason the copy is a directory and not a rollup.

import { useEffect, useRef, useState } from 'react'
import type { Match } from '../api'

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

/** One module instance per game, so a page with two viewers on it decodes the
 *  component once. The import is by a literal path prefix so a bundler cannot
 *  try to follow it into the graph. */
const modules = new Map<string, Promise<VizModule>>()

function loadViz(game: string): Promise<VizModule> {
  let m = modules.get(game)
  if (!m) {
    m = import(/* @vite-ignore */ `/cartridges/${game}/viz.js`) as Promise<VizModule>
    modules.set(game, m)
  }
  return m
}

export function Replay({
  match,
  height,
  autoplay,
  className,
}: {
  /** Null while the match is still being fetched. The frame is drawn either way,
   *  at the height it will keep, so the page below it does not move when the
   *  replay arrives. */
  match: Pick<Match, 'game' | 'status' | 'replay_url' | 'engine_digest' | 'id'> | null
  height?: number
  autoplay?: boolean
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>({ at: 'idle' })
  const url = match?.replay_url ?? null
  const game = match?.game ?? null

  useEffect(() => {
    const el = host.current
    if (!el || !url) {
      setPhase({ at: 'idle' })
      return
    }

    let live = true
    let viewer: Viewer | null = null
    setPhase({ at: 'loading' })

    void (async () => {
      if (!game) return
      let viz: VizModule
      try {
        viz = await loadViz(game)
      } catch {
        // The bundle is not being served. That is a deployment fact, not a fault
        // in this match, and the page says so rather than blaming the replay.
        if (live) setPhase({ at: 'unavailable' })
        return
      }

      try {
        // The signed URL is fetched here rather than handed to mount() as a
        // string, so a storage failure is told apart from a decode failure.
        const res = await fetch(url)
        if (!res.ok) throw new Error(`the replay store answered ${res.status}`)
        const envelope: unknown = await res.json()
        if (!live) return
        viewer = await viz.mount(el, envelope, { autoplay: autoplay ?? false, height })
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
      // mount() appends into the host; destroy() is the viewer's own teardown and
      // anything it leaves behind would otherwise be drawn twice under StrictMode.
      el.replaceChildren()
    }
  }, [url, game, autoplay, height])

  return (
    <div className={className ? `replay ${className}` : 'replay'} style={height ? { minHeight: height } : undefined}>
      <div className="replay-host" ref={host} hidden={phase.at !== 'ready'} />
      {phase.at === 'ready' ? null : <ReplayState phase={phase} hasUrl={Boolean(url)} match={match} />}
    </div>
  )
}

function ReplayState({
  phase,
  hasUrl,
  match,
}: {
  phase: Phase
  hasUrl: boolean
  match: Pick<Match, 'status' | 'engine_digest'> | null
}) {
  if (!match) {
    return (
      <div className="replay-state" role="status" aria-live="polite">
        <b>Loading a match</b>
        <p>The board appears here.</p>
      </div>
    )
  }
  if (!hasUrl) {
    // There is nothing to replay, and which nothing it is depends on the match.
    const said =
      match.status === 'cancelled'
        ? 'This match was cancelled before it started, so nothing was played.'
        : match.status === 'pending'
          ? 'This match has not been played yet.'
          : 'The replay has not been stored for this match.'
    return (
      <div className="replay-state">
        <b>No replay</b>
        <p>{said}</p>
      </div>
    )
  }
  if (phase.at === 'loading' || phase.at === 'idle') {
    return (
      <div className="replay-state" role="status" aria-live="polite">
        <b>Loading the replay</b>
        <p>The cartridge re-simulates the match from the recorded actions.</p>
      </div>
    )
  }
  if (phase.at === 'unavailable') {
    return (
      <div className="replay-state">
        <b>The viewer is not available</b>
        <p>
          This deployment is not serving the game's viewer bundle. Run{' '}
          <code>npm run vendor:viewers</code> and rebuild; the match itself, its seats and its scores are
          all still shown above.
        </p>
      </div>
    )
  }
  return (
    <div className="replay-state">
      <b>The replay could not be shown</b>
      <p>{phase.at === 'failed' ? phase.why : 'The viewer stopped before it could draw.'}</p>
      {match.engine_digest ? (
        <p className="mono" style={{ fontSize: 11 }}>
          played on {match.engine_digest.slice(0, 19)}…
        </p>
      ) : null}
    </div>
  )
}
