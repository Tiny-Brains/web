// `/matches/:id` — the replay screen. The board takes the page's full width and as
// much of the window as it can; what came of the match is under it. There is no
// separate replay route: this is the one place a match is watched.
//
// The head names the match by its seats — each model and whose it is — and not by
// its id. A uuid is the API's handle for a match; nobody recognises one by it.
//
// Four states have to read correctly. A rated match shows the rating change. A
// FINISHED one says the result is in and the rating is still being counted. A
// CANCELLED one says why and names the successor; a FAILED one says which seat
// faulted, and that a failed match is not a loss. Only a played match has a board.

import { Fragment, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type Match, type MatchPlayer } from '../api'
import { useApi } from '../lib/useApi'
import { num, ordinal, rating as fmtRating, signed } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardHead, Empty, Note, Pill, type PillTone } from '../components/ui'
import { ModelLink, Owner } from '../components/Model'
import { OutcomeMark, Seats } from '../components/Seats'
import { Replay } from '../components/Replay'
import { Permalink } from '../components/Permalink'

export default function MatchPage() {
  const { id = '' } = useParams()
  const match = useApi(`match:${id}`, () => api.match(id))

  return (
    <Permalink result={match} kind="match" label="Loading the match" ctx="read">
      {(m) => <MatchDetail m={m} />}
    </Permalink>
  )
}

const BADGE: Partial<Record<Match['status'], [PillTone, string]>> = {
  rated: ['ok', 'Rated'],
  finished: ['wait', 'Counting'],
  cancelled: ['closed', 'Cancelled'],
  failed: ['bad', 'Failed'],
}

/** What the window has left for the board once the bar, the strip and this page's
 *  one-line head have theirs. Read once: the viewer takes its height at mount, and
 *  re-mounting on a resize would decode the match again. On a narrow screen the
 *  board is as wide as the screen and no taller, so the frame is held near that
 *  rather than drawing black above and below it. */
function stageHeight(): number {
  const room = Math.min(window.innerHeight - 220, window.innerWidth + 40)
  return Math.round(Math.min(Math.max(room, 360), 980))
}

function MatchDetail({ m }: { m: Match }) {
  const rated = m.status === 'rated'
  const counting = m.status === 'finished'
  const cancelled = m.status === 'cancelled'
  const failed = m.status === 'failed'
  const played = rated || counting || failed

  const [tone, word] = BADGE[m.status] ?? ['scheduled' as PillTone, m.status]
  const [height] = useState(stageHeight)

  return (
    <Shell ctx="read">
      <section className="wrap match-head">
        <Link className="back" to="/matches">
          ← Matches
        </Link>
        <h1 className="match-title">
          {m.players.map((p, i) => (
            <Fragment key={p.seat}>
              {i > 0 ? <span className="vs">vs</span> : null}
              <span className="side">
                <ModelLink game={m.game} repo={p.repo} name={p.model} k={p.class} />
                <span className="by">
                  <Owner handle={p.owner} baseline={p.baseline} />
                </span>
              </span>
            </Fragment>
          ))}
        </h1>
        <Pill tone={tone}>{word}</Pill>
      </section>

      {played ? (
        <section className="wrap">
          <Replay match={m} height={height} autoplay />
          <p className="replay-say">
            {failed ? `The replay stops where the match did, at turn ${num(m.turns)}. ` : null}
            Space plays and pauses; ← and → step a turn, with shift for ten; scroll zooms and drag pans.
            Hover the board for the seats and what is on a cell.
          </p>
        </section>
      ) : null}

      <section className="wrap sec tight">
        <StateNote m={m} />

        <div className="results">
          <Card>
            <CardHead title="Result" />
            {cancelled ? (
              <Empty>
                No match was played, so there is no result. The versions that were paired are{' '}
                {m.players.map((s, i) => (
                  <span key={s.seat}>
                    {i > 0 ? ' and ' : ''}
                    <ModelLink game={m.game} repo={s.repo} name={s.model} k={s.class} version={s.model_version} />
                  </span>
                ))}
                .
              </Empty>
            ) : (
              <div className="result">
                <Seats game={m.game} seats={m.players} />
              </div>
            )}
          </Card>

          <Card>
            <CardHead
              title="How the rating moved"
              end={rated ? m.ladders.join(' · ') || 'no ladder' : counting ? 'counting' : 'nothing moved'}
            />
            {rated ? (
              <div>
                {m.players.map((p) => (
                  <Delta game={m.game} p={p} seats={m.players.length} strikeLimit={m.strike_limit} key={p.seat} />
                ))}
              </div>
            ) : (
              <Empty>
                {counting
                  ? 'Counting the rating change…'
                  : cancelled
                    ? 'The match was cancelled before it started, so no rating moved.'
                    : failed
                      ? 'The match failed, so no rating moved for either seat.'
                      : 'This match has not been played yet.'}
              </Empty>
            )}
          </Card>
        </div>
      </section>
    </Shell>
  )
}

/** Each state says what happened in a sentence, not a code. */
function StateNote({ m }: { m: Match }) {
  if (m.status === 'finished') {
    return (
      <div className="state-note">
        <Note tone="warn" title="The result is in. The rating is still being counted.">
          <p>
            Every seat finished and the scores below are final. The ladders they count on are being
            recalculated now; this page will show the change when it lands, and nothing else about the
            match will move.
          </p>
        </Note>
      </div>
    )
  }
  if (m.status === 'cancelled') {
    return (
      <div className="state-note">
        <Note tone="info" title="Cancelled before it started.">
          <p>
            {m.withdrawn_reason ??
              'The version it was scheduled for stopped being the active one before it could be played.'}{' '}
            Nothing was played and no rating moved.
            {m.successor ? (
              <>
                {' '}
                The seat is held now by{' '}
                <Link to={`/versions/${m.successor.version_id}`}>
                  {m.successor.model ?? 'its successor'} v{m.successor.version}
                </Link>
                .
              </>
            ) : null}
          </p>
        </Note>
      </div>
    )
  }
  if (m.status === 'failed') {
    const seat = m.players.find((p) => p.seat === m.fault_seat)
    return (
      <div className="state-note">
        <Note tone="bad" title={`Seat ${(m.fault_seat ?? 0) + 1} faulted and the match was stopped.`}>
          <p>
            {seat ? <ModelLink game={m.game} repo={seat.repo} name={seat.model} k={seat.class} version={seat.model_version} /> : 'A seat'}{' '}
            {m.fault_reason ?? 'stopped answering'}. A failed match is not a loss — no rating moved for any
            seat, and the pairing will be scheduled again.
          </p>
        </Note>
      </div>
    )
  }
  return null
}

function Delta({
  game,
  p,
  seats,
  strikeLimit,
}: {
  game: string
  p: MatchPlayer
  seats: number
  strikeLimit: number | null
}) {
  const changes = Object.entries(p.rating_change ?? {})
  return (
    <div className="delta">
      <div className="who">
        <ModelLink game={game} repo={p.repo} name={p.model} k={p.class} version={p.model_version} />
        <OutcomeMark outcome={p.outcome} />
        <span className="rank">{p.rank ? `${ordinal(p.rank)} of ${seats}` : 'no rank'}</span>
      </div>
      {changes.length === 0 ? (
        <div className="dl-row">
          <span className="lad">no ladder counted this seat</span>
        </div>
      ) : (
        changes.map(([ladder, c]) => {
          // The rating is mu − 3σ, so the move has to be computed from both, not
          // from mu alone: a seat can gain mu and still lose rating.
          const was = c.mu_before === null || c.sigma_before === null ? null : c.mu_before - 3 * c.sigma_before
          const now = c.mu_after - 3 * c.sigma_after
          const diff = was === null ? null : now - was
          const tone = diff === null || diff === 0 ? 'flat' : diff > 0 ? 'up' : 'down'
          return (
            <div className="dl-row" key={ladder}>
              <span className="lad">{ladder}</span>
              <span className="was">{was === null ? 'new' : fmtRating(was)}</span>
              <span className="now">{fmtRating(now)}</span>
              <span className={`d ${tone}`}>{diff === null ? '—' : signed(diff)}</span>
            </div>
          )
        })
      )}
      <div className="dl-row">
        <span className="lad">strikes</span>
        <Strikes count={p.strikes ?? 0} limit={strikeLimit} />
      </div>
    </div>
  )
}

function Strikes({ count, limit }: { count: number; limit: number | null }) {
  if (limit === null) return <span className="d flat">{count}</span>
  return (
    <>
      <span className="strikes">
        {Array.from({ length: limit }, (_, i) => (
          <i className={i < count ? (count >= limit ? 'over' : 'on') : undefined} key={i} />
        ))}
      </span>
      <span className="d flat">
        {count} / {limit}
      </span>
    </>
  )
}
