// The top of each class, one cell per class: who leads it, or that nobody has entered it yet and
// what would. On a live season's Open ladder it is five people with something to be proud of
// instead of one; on a closed season it is the podium, kept for ever. The class name in each
// cell is the link to that ladder. Five reads of one row each, held at their height while out.

import { api, type LeaderboardEntry, type SeasonWeightClass } from '../api'
import { useApi } from '../lib/useApi'
import { cap, rating as fmtRating } from '../lib/format'
import { kStyle } from '../lib/weight-classes'
import { Skel } from './ui'
import { ModelLink } from './Model'

export function Champions({
  game,
  season,
  classes,
  onPick,
}: {
  game: string
  /** The selection's season: absent for the live one, a number for any other. */
  season: number | string | null
  classes: SeasonWeightClass[]
  onPick: (ladder: string) => void
}) {
  const champs = useApi(
    `champs:${game}:${season ?? ''}:${classes.map((c) => c.class).join(',')}`,
    () =>
      Promise.all(
        classes.map(async (c) => {
          const b = await api.leaderboard(game, { ladder: c.class, season, limit: 1 })
          return [c.class, b.entries[0] ?? null] as const
        }),
      ),
    classes.length > 0,
  )
  const byClass = new Map<string, LeaderboardEntry | null>(champs.data ?? [])

  return (
    <div className="champs" role="list" aria-label="Class champions">
      {classes.map((c) => {
        const top = byClass.get(c.class) ?? null
        return (
          <div className="champ" style={kStyle(c.class)} role="listitem" key={c.class}>
            <button type="button" className="k" onClick={() => onPick(c.class)}>
              {c.class} <span className="cap">· {cap(c.max_bytes)}</span>
            </button>
            {champs.state === 'loading' ? (
              <>
                <Skel w="70%" />
                <Skel w="45%" />
              </>
            ) : champs.state === 'error' ? (
              <span className="who">could not be read</span>
            ) : top ? (
              <>
                <span className="lead">
                  <ModelLink game={game} repo={top.repo} name={top.model} k={top.class} version={top.version} />
                </span>
                <span className="who">
                  {fmtRating(top.rating)}
                  {top.provisional ? ' prov' : ''} · @{top.owner}
                  {top.baseline ? ' · baseline' : ''}
                </span>
              </>
            ) : (
              <>
                <span className="lead muted">nobody yet</span>
                <span className="who">under {cap(c.max_bytes)} takes it</span>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
