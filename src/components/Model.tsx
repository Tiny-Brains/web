// A model, wherever one appears: [class box] model-id by @owner. The coloured
// square carries the weight class, which is why the class needs a text column only
// where it is being ranked or filtered.

import { Link } from 'react-router-dom'
import type { ModelStatus, Rating, WeightClass } from '../api'
import { rating as fmtRating, cap as fmtCap } from '../lib/format'
import { kStyle } from '../lib/weight-classes'
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
