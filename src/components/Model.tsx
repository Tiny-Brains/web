// A model, wherever one appears: [class box] model-id by @owner. The coloured
// square carries the weight class, which is why the class needs a text column only
// where it is being ranked or filtered.

import { Link } from 'react-router-dom'
import type { ModelStatus, Rating, WeightClass } from '../api'
import { bytes, rating as fmtRating, cap as fmtCap } from '../lib/format'
import { classVar, kStyle } from '../lib/weight-classes'
import { modelPath, versionPath } from '../lib/paths'
import { cx } from '../lib/cx'
import { Icon, Pill, type PillTone } from './ui'

export function ClassBox({ k, className }: { k: WeightClass | null | undefined; className?: string }) {
  return <i className={cx('kbox', className)} style={kStyle(k)} title={k ?? undefined} />
}

/** The class named as well as coloured — for a column, a filter, or a title. */
export function ClassChip({ k }: { k: WeightClass | null | undefined }) {
  if (!k) return <span className="muted">—</span>
  return (
    <span className="klass" style={kStyle(k)}>
      {k}
    </span>
  )
}

/** A model, wherever one is named: its own name, with the class it is playing in.
 *
 *  It used to print eight characters of a uuid, because there was nothing else to print -- a
 *  version had no name and the entry it belonged to had no row. Now it prints what the competitor
 *  called it, which is what every seat, ladder row and replay panel goes through. */
export function ModelLink({
  game,
  repo,
  name,
  k,
  version,
}: {
  game: string
  repo: string
  name: string
  k?: WeightClass | null
  /** When given, links the VERSION under the model rather than the model itself. */
  version?: number | null
}) {
  const to = version == null ? modelPath(game, repo) : versionPath(game, repo, version)
  return (
    <Link className="model" to={to}>
      <ClassBox k={k} />
      {name}
      {version == null ? null : <span className="muted"> v{version}</span>}
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

/** The one thing that marks a platform baseline. A baseline is an entry like any
 *  other — owned, versioned, paired and rated — so the tag goes beside what every
 *  entry shows, never in place of it. */
export function BaselineTag() {
  return <span className="r-tag">baseline</span>
}

/** `by @owner`, tagged when the owner is a platform baseline. */
export function Owner({ handle, baseline }: { handle?: string | null; baseline?: boolean | null }) {
  if (!handle) return null
  return (
    <>
      by <OwnerLink handle={handle} />
      {baseline ? (
        <>
          {' '}
          <BaselineTag />
        </>
      ) : null}
    </>
  )
}

/** The same, as the inline `by @x` span a table row carries. */
export function ByOwner({ handle, baseline, you }: { handle?: string | null; baseline?: boolean | null; you?: boolean }) {
  if (!handle) return null
  return (
    <>
      <span className="by">
        by <OwnerLink handle={handle} />
      </span>
      {baseline ? <BaselineTag /> : null}
      {you ? <span className="r-tag">you</span> : null}
    </>
  )
}

/** Which way the last counted match moved this rating. Null before the first one,
 *  which is not the same as flat and is drawn as nothing rather than as a dash. */
function Trend({ value }: { value: number | null | undefined }) {
  if (!value) return null
  return value > 0 ? (
    <Icon id="i-up" className="trend up" label="rating rising" />
  ) : (
    <Icon id="i-down" className="trend down" label="rating falling" />
  )
}

/** The last dozen ratings as a line, beside the number. It is the difference between a table and
 *  a race. Drawn only once there are two points; a single seed is a dot that says nothing. The
 *  line is ink and the last point is the class hue, so identity stays with the row's other
 *  marks. Fixed pixels, not a stretched viewBox, so the stroke stays 1.5px. */
export function RatingSparkline({ history, k }: { history?: number[]; k?: WeightClass | null }) {
  if (!history || history.length < 2) return null
  const w = 56
  const h = 16
  const lo = Math.min(...history)
  const hi = Math.max(...history)
  const span = hi - lo || 1
  const pts = history.map((v, i) => [
    2 + (i / (history.length - 1)) * (w - 4),
    2 + (1 - (v - lo) / span) * (h - 4),
  ])
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

/** A rating, one decimal, with `prov` shown rather than hidden. */
export function RatingValue({
  value,
  provisional,
  trend,
}: {
  value: number | null | undefined
  provisional?: boolean
  trend?: number | null
}) {
  return (
    <>
      {fmtRating(value)}
      {provisional ? <span className="prov"> prov</span> : null}
      <Trend value={trend} />
    </>
  )
}

/** The measured size and, under it, how much of the class cap it spends: 5.9 KiB says less than
 *  5.9 of 8 KiB does. The cap is the season's, handed in; a class the season does not list gets
 *  the number alone. */
export function SizeCell({ size, k, limit }: { size: number | null; k: WeightClass | null; limit?: number }) {
  if (size === null) return <>—</>
  if (!limit) return <>{bytes(size)}</>
  const fill = Math.min(100, (size / limit) * 100)
  return (
    <span className="r-size" title={`${bytes(size)} of the ${k} cap, ${fmtCap(limit)}`}>
      {bytes(size)}
      <i className="headroom" style={{ '--fill': `${fill}%`, '--k': classVar(k) } as React.CSSProperties} />
    </span>
  )
}

/** "rank 6 of 47" — model_ratings() decides both numbers so every page agrees. */
export function RankLine({ r }: { r: Rating }) {
  return (
    <>
      rank {r.rank} of {r.field}
      {r.provisional ? (
        <>
          {' · '}
          <span className="prov">provisional</span>
        </>
      ) : null}
    </>
  )
}

/** One wording per version status, so the profile and the version page agree. */
const STATUS_PILL: Record<ModelStatus, [PillTone, string]> = {
  active: ['ok', 'Active'],
  verified: ['wait', 'Awaiting trial'],
  testing: ['wait', 'In admission'],
  rejected: ['bad', 'Rejected'],
  superseded: ['closed', 'Superseded'],
}

export function StatusPill({ status }: { status: ModelStatus }) {
  const [tone, word] = STATUS_PILL[status] ?? ['closed' as PillTone, status]
  return <Pill tone={tone}>{word}</Pill>
}

/** The season's weight-class scale. THE CAPS ARE THE SEASON'S: a class result is
 *  comparable within its season and not across seasons, so nothing here may fall
 *  back to a platform-wide table. */
export function WeightScale({ classes }: { classes: { class: WeightClass; max_bytes: number }[] }) {
  return (
    <div className="eb-scale">
      {classes.map((c) => (
        <span className="eb-step" style={kStyle(c.class)} key={c.class}>
          {c.class}
          <b>{fmtCap(c.max_bytes)}</b>
        </span>
      ))}
    </div>
  )
}
