// The seats of one played match: one column per seat, score on top, then the
// model, then who owns it. The outcome is a mark beside the name, never colour
// alone. Three or more seats step the type down a notch.

import type { Outcome } from '../api'
import type { Seat } from '../lib/match'
import { cx } from '../lib/cx'
import { Icon } from './ui'
import { ModelLink, Owner } from './Model'

export function OutcomeMark({ outcome }: { outcome: Outcome }) {
  if (outcome === 'win') return <Icon id="i-medal" className="mark win" label="won" />
  if (outcome === 'draw') return <Icon id="i-draw" className="mark draw" label="drawn" />
  if (outcome === 'dq')
    return <Icon id="i-dq" className="mark dq" label="disqualified — an answer the referee could not use" />
  return null
}

export function Seats({ seats, className }: { seats: Seat[]; className?: string }) {
  return (
    <div className={cx('players', seats.length > 2 && 'dense', className)} style={{ '--n': seats.length } as React.CSSProperties}>
      {seats.map((p) => (
        <div
          className={cx(
            'player',
            (p.outcome === 'win' || p.outcome === 'draw') && 'is-win',
            p.outcome === 'dq' && 'is-dq',
          )}
          key={p.seat}
        >
          {/* A seat with no score has not played — queued, or cancelled before it
              started — and an em dash says that where a zero would claim it was beaten. */}
          <span className="p-score">{p.score ?? '—'}</span>
          <span className="p-name">
            <ModelLink id={p.model_id} k={p.class} />
            <OutcomeMark outcome={p.outcome} />
          </span>
          <span className="p-by">
            <Owner handle={p.owner} baseline={p.baseline} />
          </span>
        </div>
      ))}
    </div>
  )
}
