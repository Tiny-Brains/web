// `/matches/:id/replay` — the viewer, full screen.
//
// The same component the match page embeds, with nothing competing with it. This
// route exists because a replay is evidence and evidence gets cited: the viewer's
// own hash options (#turn=84, #from=40&to=60) point at a moment, and a link that
// opens the moment full-screen is worth having.

import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { useApi } from '../lib/useApi'
import { dateTime, num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Loading, Pill } from '../components/ui'
import { ModelLink, Owner } from '../components/model'
import { Replay } from '../components/Replay'
import { FetchFailed, NotFound } from '../components/states'
import { playerSeat } from '../lib/match'

export default function ReplayPage() {
  const { id = '' } = useParams()
  const match = useApi(`match:${id}`, () => api.match(id))

  if (match.state === 'error') {
    return (
      <Shell>
        <FetchFailed error={match.error} kind="match" />
      </Shell>
    )
  }
  if (match.state === 'loading') {
    return (
      <Shell>
        <section className="wrap sec tight">
          <Loading rows={4} label="Loading the replay" />
        </section>
      </Shell>
    )
  }
  // The same 200-with-a-null-body gap the match page documents.
  if (!match.data) {
    return (
      <Shell>
        <NotFound kind="match" />
      </Shell>
    )
  }

  const m = match.data
  const seats = m.players.map(playerSeat)

  return (
    <Shell>
      <section className="wrap replay-page">
        <div className="bar">
          <Link className="back" to={`/matches/${m.id}`}>
            ← The match
          </Link>
          <span className="r-tag">{m.preset}</span>
          {m.status === 'rated' ? <Pill tone="ok">Rated</Pill> : null}
          <span className="muted" style={{ font: '12px var(--font-mono)' }}>
            {m.game} · season {m.season} · {num(m.turns)} turns · {dateTime(m.played_at)}
          </span>
          <div className="end">
            {seats.map((s) => (
              <span key={s.seat} style={{ font: '12px var(--font-mono)' }}>
                <ModelLink id={s.model_id} k={s.class} />{' '}
                <span className="p-by" style={{ display: 'inline' }}>
                  <Owner handle={s.owner} baseline={s.baseline} />
                </span>
              </span>
            ))}
          </div>
        </div>

        <Replay match={m} autoplay />

        <p className="replay-say">
          The viewer re-simulates the match through the same cartridge digest that recorded it, so it and
          the referee cannot disagree about what happened. Space plays and pauses; ← and → step a turn,
          with shift for ten; Home and End jump to the ends; scroll zooms and drag pans. The board keeps
          the whole frame: hover it for the seats, the zoom controls and what is on a cell, and click a
          cell to pin that readout.
        </p>
      </section>
    </Shell>
  )
}
