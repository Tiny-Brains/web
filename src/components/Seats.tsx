// The seats of one played match.
//
// One column per seat, so a two-player match has two and an n-player match has n.
// Score on top, then the model, then who owns it. The outcome is a mark beside the
// name -- won, drawn, or disqualified -- never colour alone. Three or more seats
// step the type down a notch.

import type { Outcome } from '../api'
import type { Seat } from '../lib/match'
import { Icon } from './Icon'
import { ModelLink, Owner } from './model'

export function OutcomeMark({ outcome }: { outcome: Outcome }) {
  if (outcome === 'win') return <Icon id="i-medal" className="mark win" label="won" />
  if (outcome === 'draw') return <Icon id="i-draw" className="mark draw" label="drawn" />
  if (outcome === 'dq')
    return <Icon id="i-dq" className="mark dq" label="disqualified — an answer the referee could not use" />
  return null
}

export function Seats({ seats, className }: { seats: Seat[]; className?: string }) {
  const dense = seats.length > 2
  const cls = ['players', dense ? 'dense' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <div className={cls} style={{ '--n': seats.length } as React.CSSProperties}>
      {seats.map((p) => (
        <div
          className={[
            'player',
            p.outcome === 'win' || p.outcome === 'draw' ? 'is-win' : '',
            p.outcome === 'dq' ? 'is-dq' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          key={p.seat}
        >
          {/* A seat with no score has not played -- queued, or cancelled before it
              started -- and an em dash says that where a zero would claim it was
              beaten. */}
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
