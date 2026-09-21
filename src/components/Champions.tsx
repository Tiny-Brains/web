// The top of each class ladder in a season that has closed.

import { Link } from 'react-router-dom'
import type { SeasonWeightClass } from '../api'
import type { LadderHead } from '../lib/useLadderHeads'
import { cap, rating as fmtRating } from '../lib/format'
import { kStyle } from '../lib/weight-classes'
import { Skel } from './ui'
import { ClassBadge } from './Model'
import common from '../../copy/common.json'

const L = common.ladder

export function Champions({
  classes,
  heads,
  state,
  hrefFor,
}: {
  classes: SeasonWeightClass[]
  heads: Map<string, LadderHead>
  state: 'loading' | 'ready' | 'error'
  hrefFor: (ladder: string) => string
}) {
  return (
    <div className="champs" role="list" aria-label={L.champions}>
      {classes.map((c) => {
        const top = heads.get(c.class)?.top ?? null
        return (
          <Link className="champ" style={kStyle(c.class)} role="listitem" to={hrefFor(c.class)} key={c.class}>
            <span className="row" style={{ gap: 6 }}>
              <ClassBadge k={c.class} />
              <small>· {cap(c.max_bytes)}</small>
            </span>
            {state === 'loading' ? (
              <>
                <Skel w="70%" />
                <Skel w="45%" />
              </>
            ) : top ? (
              <>
                <b>
                  {top.model} <span className="muted">v{top.version}</span>
                </b>
                <small>
                  {top.baseline ? common.marks.baselineWord : `@${top.owner}`} · {fmtRating(top.rating)}
                </small>
              </>
            ) : (
              <small>{state === 'error' ? L.championsUnread : L.championsEmpty}</small>
            )}
          </Link>
        )
      })}
    </div>
  )
}
