// The contest's thesis in one picture: strongest play per byte. Every row of a ladder is a dot,
// bytes across on a log scale and rating up, over bands that are the season's weight classes.
//
// IDENTITY IS NEVER COLOUR ALONE. The five class hues are the site's tokens, and read as a
// categorical palette two adjacent pairs cannot be told apart under deuteranopia. So a dot's
// class is carried by where it sits -- inside its class's band, which is labelled -- and by the
// name beside it; the hue agrees and is not relied on. The rating and the size are the table's
// numbers under the plot, so a reader who wants the values has them without the picture.
//
// NO RULE HERE. The caps are the season's, the ratings and sizes the API's; this only places them.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LeaderboardEntry, SeasonWeightClass } from '../api'
import { bytes, cap, rating as fmtRating } from '../lib/format'
import { classVar } from '../lib/weight-classes'
import { versionPath } from '../lib/paths'

const HEIGHT = 300
const PAD = { l: 46, r: 18, t: 26, b: 30 }
/** Every dot is labelled up to this many; past it, the top of the ladder and the reader's own. */
const LABEL_ALL = 14
const LABEL_TOP = 8

export function SizeRatingPlot({
  entries,
  classes,
  game,
  you,
  state,
}: {
  entries: LeaderboardEntry[]
  classes: SeasonWeightClass[]
  game: string
  you?: string
  state: 'loading' | 'ready' | 'error'
}) {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<LeaderboardEntry | null>(null)
  const navigate = useNavigate()

  // Drawn in pixels, not a stretched viewBox, so the type stays the type at every width.
  useEffect(() => {
    const el = host.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rows = entries.filter((r) => r.size_bytes !== null)
  const largest = classes.at(-1)?.max_bytes ?? 64 * 1024 * 1024
  const smallestSize = Math.min(...rows.map((r) => r.size_bytes ?? Infinity))
  // The x domain: from one class below the smallest class's cap (so nano has room) to the
  // largest cap, on log2. A size under the floor pulls the floor down.
  const xMin = Math.min(Number.isFinite(smallestSize) ? smallestSize / 1.5 : Infinity, (classes[0]?.max_bytes ?? 8192) / 8)
  const xMax = largest * 1.15
  const ratings = rows.map((r) => r.rating)
  const yLo = ratings.length ? Math.floor(Math.min(...ratings) - 2) : 0
  const yHi = ratings.length ? Math.ceil(Math.max(...ratings) + 2) : 30

  const inner = Math.max(0, width - PAD.l - PAD.r)
  const lx = (b: number) => PAD.l + ((Math.log2(b) - Math.log2(xMin)) / (Math.log2(xMax) - Math.log2(xMin))) * inner
  const ly = (v: number) => PAD.t + (1 - (v - yLo) / (yHi - yLo)) * (HEIGHT - PAD.t - PAD.b)

  const ticks = yTicks(yLo, yHi)
  // On a narrow plot the cap labels run into each other; every other one is enough to read
  // the scale, and the band names above still name every class.
  const everyCap = inner / Math.max(1, classes.length) >= 64
  const byRating = [...rows].sort((a, b) => b.rating - a.rating)
  const labelled = new Set(
    (rows.length <= LABEL_ALL ? byRating : byRating.filter((r, i) => i < LABEL_TOP || r.owner === you)).map((r) => r.version_id),
  )

  const open = (r: LeaderboardEntry) => navigate(versionPath(game, r.repo, r.version))
  const onKey = (e: KeyboardEvent, r: LeaderboardEntry) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open(r)
    }
  }

  return (
    <div className="plot" ref={host} style={{ height: HEIGHT }}>
      {width > 0 ? (
        <svg width={width} height={HEIGHT} role="img" aria-label="Each version's measured size against its rating">
          {/* The bands: one per class, from the previous cap to its own. */}
          {classes.map((c, i) => {
            const from = i === 0 ? xMin : classes[i - 1].max_bytes
            const x0 = lx(Math.max(from, xMin))
            const x1 = lx(Math.min(c.max_bytes, xMax))
            if (x1 <= x0) return null
            return (
              <g key={c.class} style={{ '--k': classVar(c.class) } as React.CSSProperties}>
                <rect className="band" x={x0} y={PAD.t - 14} width={x1 - x0} height={HEIGHT - PAD.t - PAD.b + 14} />
                <text className="band-name" x={(x0 + x1) / 2} y={PAD.t - 4} textAnchor="middle">
                  {c.class}
                </text>
                {everyCap || i % 2 === 1 ? (
                  <text className="tick" x={x1} y={HEIGHT - PAD.b + 16} textAnchor="middle">
                    {cap(c.max_bytes)}
                  </text>
                ) : null}
              </g>
            )
          })}

          {/* The rating grid, recessive. */}
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.l} x2={width - PAD.r} y1={ly(t)} y2={ly(t)} />
              <text className="tick" x={PAD.l - 8} y={ly(t) + 4} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {state === 'ready' && rows.length === 0 ? (
            <text className="plot-empty" x={PAD.l + inner / 2} y={ly((yLo + yHi) / 2)} textAnchor="middle">
              nothing rated on this ladder yet
            </text>
          ) : null}

          {/* The dots, lowest-rated first so the top of the ladder is drawn on top. */}
          {[...byRating].reverse().map((r) => {
            const x = lx(r.size_bytes ?? xMin)
            const y = ly(r.rating)
            const mine = you !== undefined && r.owner === you
            return (
              <g
                key={r.version_id}
                className={mine ? 'dot you' : 'dot'}
                style={{ '--k': classVar(r.class) } as React.CSSProperties}
                role="link"
                tabIndex={0}
                aria-label={`${r.model} v${r.version}, ${bytes(r.size_bytes)}, rated ${fmtRating(r.rating)}`}
                onMouseEnter={() => setHover(r)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(r)}
                onBlur={() => setHover(null)}
                onClick={() => open(r)}
                onKeyDown={(e) => onKey(e, r)}
              >
                {/* The hit area is bigger than the mark. */}
                <circle className="hit" cx={x} cy={y} r={14} />
                <circle className="mark" cx={x} cy={y} r={mine ? 6 : 5} />
                {labelled.has(r.version_id) ? (
                  <text className="label" x={x + 9} y={y + 4}>
                    {r.model}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      ) : null}

      {hover && width > 0 ? (
        <div
          className="plot-tip"
          style={{
            left: Math.min(lx(hover.size_bytes ?? xMin) + 12, width - 190),
            top: Math.max(ly(hover.rating) - 58, 0),
          }}
        >
          <b>
            {hover.model} <span className="muted">v{hover.version}</span>
          </b>
          <span>
            {bytes(hover.size_bytes)} · {hover.class} · rated {fmtRating(hover.rating)}
            {hover.provisional ? ' prov' : ''}
          </span>
          <span className="muted">by @{hover.owner} · #{hover.rank}</span>
        </div>
      ) : null}
    </div>
  )
}

/** Four-ish round ticks across the rating range. */
function yTicks(lo: number, hi: number): number[] {
  const span = hi - lo
  const step = span <= 8 ? 2 : span <= 20 ? 5 : span <= 50 ? 10 : 20
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v)
  return out
}
