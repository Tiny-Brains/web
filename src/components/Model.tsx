// A model's identity and state: its class, its links, its rating, its status, its size.

import { Link } from 'react-router-dom'
import type { MatchStatus, ModelStatus, SeasonState, SeasonWeightClass, WeightClass } from '../api'
import { useWeightClasses } from '../providers/platform-context'
import { bytes, cap, rating as fmtRating } from '../lib/format'
import { classStep, kStyle } from '../lib/weight-classes'
import { modelPath, versionPath } from '../lib/paths'
import { cx } from '../lib/cx'
import { Badge, Icon, type BadgeTone } from './ui'

const BAR = 2.5
const GAP = 1.5
const TALL = 12

/** The class as a meter of the season's classes, filled up to this one: a season of three
 *  classes draws three bars. Named for screen readers and in its tooltip. */
export function ClassIcon({
  k,
  decorative = false,
  className,
}: {
  k: WeightClass | null | undefined
  decorative?: boolean
  className?: string
}) {
  const classes = useWeightClasses()
  const { step, of, maxBytes } = classStep(k, classes)
  const name = k ? (maxBytes ? `${k} class, up to ${cap(maxBytes)}` : `${k} class`) : 'no class measured'
  const width = of * BAR + (of - 1) * GAP
  return (
    <svg
      className={cx('kmeter', className)}
      viewBox={`0 0 ${width} ${TALL}`}
      width={width}
      height={TALL}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      style={kStyle(k)}
    >
      <title>{name}</title>
      {Array.from({ length: of }, (_, i) => {
        const h = of === 1 ? TALL : 4 + ((TALL - 4) * i) / (of - 1)
        return <rect className={i < step ? 'on' : undefined} x={i * (BAR + GAP)} y={TALL - h} width={BAR} height={h} rx={0.8} key={i} />
      })}
    </svg>
  )
}

/** The meter and the class's name. */
export function ClassBadge({ k }: { k: WeightClass | null | undefined }) {
  if (!k) return <span className="muted">unmeasured</span>
  return (
    <span className="klass">
      <ClassIcon k={k} decorative />
      {k}
    </span>
  )
}

export function BaselineMark() {
  return <Icon id="i-anchor" className="mark-icon" label="Platform baseline" />
}

export function ProvisionalMark() {
  return <Icon id="i-settling" className="mark-icon prov" label="Provisional: this rating is still settling" />
}

export function ModelLink({
  modelId,
  name,
  version,
  k,
}: {
  modelId: string
  name: string
  version?: number | null
  k?: WeightClass | null
}) {
  return (
    <Link className="model" to={version == null ? modelPath(modelId) : versionPath(modelId, version)}>
      {k !== undefined ? <ClassIcon k={k} /> : null}
      {name}
      {version == null ? null : <span className="v">v{version}</span>}
    </Link>
  )
}

export function OwnerLink({ handle }: { handle: string }) {
  return (
    <Link className="owner" to={`/profile/${handle}`}>
      @{handle}
    </Link>
  )
}

/** "@handle", or the baseline mark for a platform baseline. */
export function Owner({ handle, baseline }: { handle?: string | null; baseline?: boolean | null }) {
  if (baseline) {
    return (
      <span className="mark">
        <Icon id="i-anchor" />
        baseline
      </span>
    )
  }
  return handle ? <OwnerLink handle={handle} /> : null
}

/** The change beside a rating: an arrow shape and a number, never colour alone. */
export function Trend({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return null
  const d = Math.round(value * 10) / 10
  if (d === 0) return <span className="trend flat" aria-label="unchanged">–</span>
  return d > 0 ? (
    <span className="trend up" aria-label={`up ${d.toFixed(1)}`}>
      ▲ {d.toFixed(1)}
    </span>
  ) : (
    <span className="trend down" aria-label={`down ${Math.abs(d).toFixed(1)}`}>
      ▼ {Math.abs(d).toFixed(1)}
    </span>
  )
}

export function RatingSparkline({ history, k }: { history?: number[]; k?: WeightClass | null }) {
  if (!history || history.length < 2) return null
  const w = 56
  const h = 16
  const lo = Math.min(...history)
  const hi = Math.max(...history)
  const span = hi - lo || 1
  const pts = history.map((v, i) => [2 + (i / (history.length - 1)) * (w - 4), 2 + (1 - (v - lo) / span) * (h - 4)])
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg
      className="spark"
      width={w}
      height={h}
      role="img"
      aria-label={`rating over the last ${history.length} counts: ${history[0]} to ${history[history.length - 1]}`}
      style={kStyle(k)}
    >
      <polyline points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} />
      <circle cx={lx} cy={ly} r={2} />
    </svg>
  )
}

export function RatingValue({ value, provisional }: { value: number | null | undefined; provisional?: boolean }) {
  return (
    <>
      {fmtRating(value)}
      {provisional ? <ProvisionalMark /> : null}
    </>
  )
}

// ---- state words: one table per kind of thing, one component draws them all ----

const VERSION: Record<ModelStatus, [BadgeTone, string]> = {
  active: ['ok', 'Active'],
  verified: ['wait', 'Awaiting trial'],
  testing: ['wait', 'In admission'],
  rejected: ['bad', 'Rejected'],
  superseded: ['off', 'Superseded'],
}
const SEASON: Record<SeasonState, [BadgeTone, string]> = {
  open: ['ok', 'Open'],
  scheduled: ['info', 'Scheduled'],
  settling: ['wait', 'Settling'],
  closed: ['off', 'Final'],
}
const MATCH: Partial<Record<MatchStatus, [BadgeTone, string]>> = {
  pending: ['info', 'Queued'],
  claimed: ['info', 'Live'],
  running: ['info', 'Live'],
  finished: ['wait', 'Counting'],
  rated: ['ok', 'Rated'],
  cancelled: ['off', 'Cancelled'],
  failed: ['bad', 'Failed'],
}

export function VersionBadge({ status }: { status: ModelStatus }) {
  const [tone, word] = VERSION[status] ?? ['off', status]
  return <Badge tone={tone}>{word}</Badge>
}

export function SeasonBadge({ state }: { state: SeasonState }) {
  const [tone, word] = SEASON[state] ?? ['off', state]
  return <Badge tone={tone}>{word}</Badge>
}

/** A rated match says nothing: only a state worth reading gets a badge. */
export function MatchBadge({ status, quiet = true }: { status: MatchStatus; quiet?: boolean }) {
  if (quiet && status === 'rated') return null
  const [tone, word] = MATCH[status] ?? ['off', status]
  return <Badge tone={tone}>{word}</Badge>
}

/** The season's classes, smallest first. The caps are the season's, never a table here. */
export function ClassScale({ classes }: { classes: SeasonWeightClass[] }) {
  return (
    <div className="scale">
      {classes.map((c) => (
        <div style={kStyle(c.class)} key={c.class}>
          <ClassBadge k={c.class} />
          <small>up to {cap(c.max_bytes)}</small>
        </div>
      ))}
    </div>
  )
}

/** A measured size against its class's cap. */
export function CapMeter({ size, limit, k }: { size: number | null; limit: number | null; k: WeightClass | null }) {
  if (size === null || limit === null) {
    return (
      <p className="muted">
        {size === null
          ? 'It has not been measured yet — admission does that, and it decides the class.'
          : 'This version has no class cap recorded, so there is nothing to measure it against.'}
      </p>
    )
  }
  const over = size > limit
  const pct = Math.min(100, Math.round((size / limit) * 100))
  return (
    <div className="capbar" style={over ? ({ '--k': 'var(--danger)' } as React.CSSProperties) : kStyle(k)}>
      <div className="rail">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="ends">
        <span>{bytes(size)} measured</span>
        <span>
          {k} cap {cap(limit)}
        </span>
      </div>
      <p>{over ? `Over the cap by ${bytes(size - limit)}, which is why it was refused.` : `${bytes(limit - size)} of headroom left in ${k} (${pct}% used).`}</p>
    </div>
  )
}
