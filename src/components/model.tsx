// A model, wherever one appears.
//
// [class box] model-id by @owner. The coloured square carries the weight class,
// which is why the class needs a text column only where it is being ranked or
// filtered. Every page that names a version uses these, so the square, the link
// target and the words "a platform baseline" are decided once.

import { Link } from 'react-router-dom'
import type { Rating, WeightClass } from '../api'
import { rating as fmtRating, cap as fmtCap } from '../lib/format'
import { kStyle } from '../lib/classes'
import { Icon } from './Icon'

export function ClassBox({ k, className }: { k: WeightClass | null | undefined; className?: string }) {
  return <i className={className ? `kbox ${className}` : 'kbox'} style={kStyle(k)} title={k ?? undefined} />
}

/** The class named as well as coloured -- for a column, a filter, or a title. */
export function ClassChip({ k }: { k: WeightClass | null | undefined }) {
  if (!k) return <span className="muted">—</span>
  return (
    <span className="klass" style={kStyle(k)}>
      {k}
    </span>
  )
}

/** A model id is a uuid and no layout wants all of it, so the link shows the
 *  first eight characters -- enough to recognise, and the same eight everywhere.
 *  `full` is for the one place the whole id is the point. */
export function ModelLink({ id, k, full }: { id: string; k?: WeightClass | null; full?: boolean }) {
  return (
    <Link className="model" to={`/models/${id}`}>
      <ClassBox k={k} />
      {full ? id : id.slice(0, 8)}
    </Link>
  )
}

/** `by @owner`, or the words a baseline gets instead. A baseline has no owner and
 *  no release, and every page that prints an owner has to read correctly without
 *  them. */
export function Owner({ handle, baseline }: { handle?: string | null; baseline?: boolean | null }) {
  if (baseline || !handle) return <>a platform baseline</>
  return (
    <>
      by{' '}
      <Link className="owner" to={`/profile/${handle}`}>
        @{handle}
      </Link>
    </>
  )
}

/** The same, as the inline `by @x` span a table row carries. */
export function ByOwner({ handle, baseline, you }: { handle?: string | null; baseline?: boolean | null; you?: boolean }) {
  if (baseline || !handle) return <span className="r-tag">baseline</span>
  return (
    <>
      <span className="by">
        by{' '}
        <Link className="owner" to={`/profile/${handle}`}>
          @{handle}
        </Link>
      </span>
      {you ? <span className="r-tag">you</span> : null}
    </>
  )
}

/** Which way the last counted match moved this rating. Null before the first one,
 *  which is not the same as flat and is drawn as nothing rather than as a dash. */
export function Trend({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || value === 0) return null
  return value > 0 ? (
    <Icon id="i-up" className="trend up" label="rating rising" />
  ) : (
    <Icon id="i-down" className="trend down" label="rating falling" />
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

/** "rank 6 of 47" -- model_ratings() decides both numbers so every page agrees. */
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

/** The season's weight-class scale, wherever the classes are named at once.
 *  THE CAPS ARE THE SEASON'S: a class result is comparable within its season and
 *  not across seasons, so nothing here may fall back to a platform-wide table. */
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
