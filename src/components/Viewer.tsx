// The viewer's small tiers and its graph, beside Replay.tsx's Stage and Player.
//
//   MatchTile   a card's picture: the Tile tier, resting on the match's last frame (or the board at
//               turn zero when Soma holds none), playing its last forty turns on a 600ms hover
//   FrameThumb  a row's picture: the Thumb tier, one still frame, drawn synchronously
//   MatchGraph  the ants graph under a mounted Stage or Player, the same width as it
//
// THE OVERLAY IS THE VIEWER'S. Names, scores and the turn laid over a Tile are drawn by the viewer
// from `labels` and the frame; nothing here styles or positions them, and no class here starts tb-.
// A list decodes no replay at rest: a frame is JSON the viewer draws without calling the component,
// and only a hover fetches a replay. A Tile lives while its card is near the window (useNear), so
// a long grid holds only the boards around the reader.

import { useEffect, useRef, useState } from 'react'
import { loadViz, replayOf, restOf, type SeatLabel, type VizViewer } from '../lib/viz'
import { cx } from '../lib/cx'
import { usePlatform } from '../providers/platform-context'

/** Whether the element is near the window: true once it comes within `enter` of it, false again
 *  once it is more than `leave` away. TWO THRESHOLDS, so a card at the edge does not mount and
 *  unmount on every scroll step. What scrolls far off is destroyed, and redrawn from the frame the
 *  page still holds (lib/viz.ts) when it comes back. Without IntersectionObserver everything is near. */
function useNear(el: React.RefObject<HTMLElement | null>, enter = '300px', leave = '1500px'): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const node = el.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const coming = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true)
      },
      { rootMargin: enter },
    )
    const gone = new IntersectionObserver(
      (entries) => {
        if (entries.every((e) => !e.isIntersecting)) setNear(false)
      },
      { rootMargin: leave },
    )
    coming.observe(node)
    gone.observe(node)
    return () => {
      coming.disconnect()
      gone.disconnect()
    }
  }, [el, enter, leave])
  return near
}

// ---- the Tile -----------------------------------------------------------------------------

/** ONE PREVIEW PLAYS AT A TIME, across every tile on the page. */
let previewing: VizViewer | null = null
const HOVER_MS = 600

export function MatchTile({
  id,
  game,
  season,
  map,
  hasFrame,
  labels,
  preview = true,
  className,
}: {
  id: string
  game: string
  /** The season's slug and the board's id: turn zero is drawn from the season's own board. */
  season?: string | null
  map?: string | null
  /** The card row's `frame`: whether Soma holds a last frame for it. */
  hasFrame: boolean
  /** What the tile calls each seat when it rests on a board, or on a frame from before names. */
  labels: SeatLabel[]
  /** Hover plays the last forty turns. Off for a queued match, which has none. */
  preview?: boolean
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const near = useNear(host)
  // The member's route for a match of a private season; a card that names none is read as by id.
  const priv = usePlatform().priv(season ?? undefined)
  const viewer = useRef<VizViewer | null>(null)
  const [drawn, setDrawn] = useState(false)
  const labelKey = JSON.stringify(labels)

  useEffect(() => {
    const el = host.current
    if (!el || !near) return
    let live = true
    void (async () => {
      try {
        const [viz, rest] = await Promise.all([loadViz(game), restOf({ id, game, season, map, hasFrame, priv })])
        if (!live || !rest) return
        const opts = 'frame' in rest ? { tier: 'tile', frame: rest.frame, labels: rest.labels } : { tier: 'tile', board: rest.board, labels: JSON.parse(labelKey) as SeatLabel[] }
        const v = await viz.mount(el, null, opts)
        if (!live) {
          v.destroy()
          return
        }
        viewer.current = v
        setDrawn(true)
      } catch {
        // A tile that cannot draw stays the empty box it was: the card's words still name the match.
      }
    })()
    return () => {
      live = false
      if (previewing === viewer.current) previewing = null
      viewer.current?.destroy()
      viewer.current = null
      el.replaceChildren()
      // Back to the box it was, so a card that scrolled far off is a placeholder again until it
      // is redrawn.
      setDrawn(false)
    }
  }, [near, id, game, season, map, hasFrame, labelKey, priv])

  // The host owns the delay; the viewer owns the playing.
  const timer = useRef<number | null>(null)
  const enter = () => {
    if (!preview || !hasFrame) return
    if (!window.matchMedia('(hover: hover)').matches) return
    timer.current = window.setTimeout(() => {
      void replayOf(id, priv).then((url) => {
        const v = viewer.current
        if (!url || !v?.preview || timer.current === null) return
        if (previewing && previewing !== v) previewing.stop?.()
        previewing = v
        void v.preview(url)
      })
    }, HOVER_MS)
  }
  const leave = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    const v = viewer.current
    if (v && previewing === v) {
      v.stop?.()
      previewing = null
    }
  }

  // The viewer takes the element it mounts into as its root and puts its own classes on it, so that
  // element is one React never re-renders a className onto: the box around it carries ours.
  return (
    <div className={cx('tile-box', drawn && 'drawn', className)} onPointerEnter={enter} onPointerLeave={leave} aria-hidden="true">
      <div className="viz-host" ref={host} />
    </div>
  )
}

// ---- the Thumb ----------------------------------------------------------------------------

/** One still frame in whatever box the row gives it: a match's last frame, or its board at turn
 *  zero. `drawFrame` is synchronous and never calls the component. */
export function FrameThumb({
  id,
  game,
  season,
  map,
  hasFrame,
  className,
}: {
  id: string
  game: string
  season?: string | null
  map?: string | null
  hasFrame: boolean
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const near = useNear(host)
  const priv = usePlatform().priv(season ?? undefined)
  useEffect(() => {
    const el = host.current
    if (!el || !near) return
    let live = true
    let v: VizViewer | null = null
    void (async () => {
      try {
        const [viz, rest] = await Promise.all([loadViz(game), restOf({ id, game, season, map, hasFrame, priv })])
        if (!live || !rest) return
        if ('frame' in rest && viz.drawFrame) v = viz.drawFrame(el, rest.frame, {})
        else if ('board' in rest) v = await viz.mount(el, null, { tier: 'thumb', board: rest.board })
        if (!live) v?.destroy()
      } catch {
        // An empty box: the row's words still name the match.
      }
    })()
    return () => {
      live = false
      v?.destroy()
      el.replaceChildren()
    }
  }, [near, id, game, season, map, hasFrame, priv])
  return (
    <div className={cx('thumb-box', className)} aria-hidden="true">
      <div className="viz-host" ref={host} />
    </div>
  )
}

/** A board's last frame as a Thumb, when the frame is already in hand (the maps page's hover). */
export function StillFrame({ game, frame, className }: { game: string; frame: unknown; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return
    let live = true
    let v: VizViewer | null = null
    void loadViz(game)
      .then((viz) => {
        if (live && viz.drawFrame) v = viz.drawFrame(el, frame, {})
      })
      .catch(() => undefined)
    return () => {
      live = false
      v?.destroy()
      el.replaceChildren()
    }
  }, [game, frame])
  return (
    <div className={cx('thumb-box', className)} aria-hidden="true">
      <div className="viz-host" ref={host} />
    </div>
  )
}

// ---- the graph ----------------------------------------------------------------------------

/** Each seat's ants, hills or score over the match, under the viewer it follows and the same width.
 *  Its switch, playhead, ticks and legend are the viewer's; hovering it scrubs the viewer. */
export function MatchGraph({ game, viewer, className }: { game: string; viewer: VizViewer | null; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el || !viewer) return
    let live = true
    let g: { destroy: () => void } | null = null
    void loadViz(game)
      .then(async (viz) => {
        if (!live || !viz.mountGraph) return
        g = await viz.mountGraph(el, viewer, { kind: 'ants' })
        if (!live) g.destroy()
      })
      .catch(() => undefined)
    return () => {
      live = false
      g?.destroy()
      el.replaceChildren()
    }
  }, [game, viewer])
  return (
    <div className={cx('graph-box', className)}>
      <div ref={host} />
    </div>
  )
}
