// `/matches/:id/replay` — the viewer, full screen.
//
// The same component the match page embeds, with nothing competing with it. A
// replay is evidence and evidence gets cited: the viewer's own hash options
// (#turn=84, #from=40&to=60) point at a moment, and a link that opens the moment
// full-screen is worth having.

import { Link, useParams } from 'react-router-dom'
import { api, type Match } from '../api'
import { useApi } from '../lib/useApi'
import { dateTime, num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Pill } from '../components/ui'
import { ModelLink, Owner } from '../components/Model'
import { Replay } from '../components/Replay'
import { Permalink } from '../components/Permalink'

export default function ReplayPage() {
  const { id = '' } = useParams()
  const match = useApi(`match:${id}`, () => api.match(id))

  return (
    <Permalink result={match} kind="match" label="Loading the replay" rows={4}>
      {(m) => <ReplayView m={m} />}
    </Permalink>
  )
}

function ReplayView({ m }: { m: Match }) {
  return (
    <Shell>
      <section className="wrap replay-page">
        <div className="bar">
          <Link className="back" to={`/matches/${m.id}`}>
            ← The match
          </Link>
          <span className="r-tag">{m.preset}</span>
          {m.status === 'rated' ? <Pill tone="ok">Rated</Pill> : null}
          <span className="muted note-mono">
            {m.game} · season {m.season} · {num(m.turns)} turns · {dateTime(m.played_at)}
          </span>
          <div className="end">
            {m.players.map((s) => (
              <span className="seat-line" key={s.seat}>
                <ModelLink game={m.game} repo={s.repo} name={s.model} k={s.class} version={s.model_version} /> <Owner handle={s.owner} baseline={s.baseline} />
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
