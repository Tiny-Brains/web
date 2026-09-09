// `/matches/:id` — one played match, and the identity of everything that produced
// the result, so the result can be argued with.
//
// Four states have to read correctly. A rated match shows the rating change. A
// FINISHED one says the result is in and the rating is still being counted --
// which is what the home page shows as "counting the rating change…". A CANCELLED
// one says why and names the successor; a FAILED one says which seat faulted, and
// that a failed match is not a loss.

import { Link, useParams } from 'react-router-dom'
import { api, type Match, type MatchPlayer } from '../api'
import { useApi } from '../lib/useApi'
import { dateTime, ms, num, ordinal, rating as fmtRating, shortHash, signed } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardBody, CardHead, Empty, KeyValues, Loading, Note, Pill, type PillTone } from '../components/ui'
import { ModelLink } from '../components/model'
import { OutcomeMark, Seats } from '../components/Seats'
import { playerSeat } from '../lib/match'
import { Replay } from '../components/Replay'
import { FetchFailed, NotFound } from '../components/states'

export default function MatchPage() {
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
      <Shell ctx="read">
        <section className="wrap sec tight">
          <Loading rows={6} label="Loading the match" />
        </section>
      </Shell>
    )
  }
  /*
   * SOMA GAP: an unknown id answers 200 with a null body.
   *
   * soma-models-get and soma-matches-get have no `unknown` task, unlike
   * soma-profile-get and soma-games-get which answer 404 with {"error": ...}. So a
   * well-formed id that names nothing is not an error here -- it is a success whose
   * body is null, and reading only the status would leave this page loading for
   * ever. Treated as absence, which is what it is; if those workflows grow a 404
   * the `error` branch above catches it and this stays correct either way.
   */
  if (!match.data) {
    return (
      <Shell>
        <NotFound kind="match" />
      </Shell>
    )
  }
  return <MatchDetail m={match.data} />
}

function MatchDetail({ m }: { m: Match }) {
  const rated = m.status === 'rated'
  const counting = m.status === 'finished'
  const cancelled = m.status === 'cancelled'
  const failed = m.status === 'failed'
  const played = rated || counting || failed

  const badge: { tone: PillTone; word: string } = rated
    ? { tone: 'ok', word: 'Rated' }
    : counting
      ? { tone: 'wait', word: 'Counting' }
      : cancelled
        ? { tone: 'closed', word: 'Cancelled' }
        : failed
          ? { tone: 'bad', word: 'Failed' }
          : { tone: 'scheduled', word: m.status }

  const seats = m.players.map(playerSeat)

  return (
    <Shell ctx="read">
      <div className="match-page">
        <section className="wrap page-head">
          <Link className="back" to="/matches">
            ← Matches
          </Link>
          <div className="page-title">
            <div className="title-id">
              <h1>{m.id.slice(0, 8)}</h1>
            </div>
            <span className="r-tag">{m.preset}</span>
            {m.is_trial ? <span className="r-tag">trial</span> : null}
            <Pill tone={badge.tone}>{badge.word}</Pill>
            <div className="end">
              {played && m.replay_url ? (
                <Link className="btn sm" to={`/matches/${m.id}/replay`}>
                  Open the replay ↗
                </Link>
              ) : null}
            </div>
          </div>
          <p className="page-sub">{subtitle(m)}</p>
        </section>

        <section className="wrap sec tight">
          <StateNote m={m} />

          <Card className="result" >
            {cancelled ? (
              <Empty>
                No match was played, so there is no result. The versions that were paired are{' '}
                {seats.map((s, i) => (
                  <span key={s.seat}>
                    {i > 0 ? ' and ' : ''}
                    <ModelLink id={s.model_id} k={s.class} />
                  </span>
                ))}
                .
              </Empty>
            ) : (
              <Seats seats={seats} />
            )}
          </Card>

          <div className="split" style={{ marginTop: 20 }}>
            <div className="stack">
              {played ? (
                <div>
                  <Replay match={m} height={420} />
                  <p className="replay-say">
                    {failed
                      ? `The replay stops where the match did, at turn ${num(m.turns)}. Space plays and pauses; ← and → step a turn; scroll zooms.`
                      : `Space plays and pauses; ← and → step a turn, with shift for ten; scroll zooms and drag pans. Hover the board for the seats and what is on a cell. The same viewer fills the screen at /matches/${m.id.slice(0, 8)}/replay.`}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="stack">
              <Card>
                <CardHead
                  title="How the rating moved"
                  end={rated ? m.ladders.join(' · ') || 'no ladder' : counting ? 'counting' : 'nothing moved'}
                />
                {rated ? (
                  <div>
                    {m.players.map((p) => (
                      <Delta p={p} seats={m.players.length} strikeLimit={m.strike_limit} key={p.seat} />
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

              <Card>
                <CardHead title="The record" />
                <CardBody>
                  <KeyValues items={recordRows(m)} />
                </CardBody>
              </Card>
            </div>
          </div>
        </section>
      </div>
    </Shell>
  )
}

function subtitle(m: Match): string {
  const where = `${m.game}, season ${m.season}`
  if (m.status === 'cancelled') return `${where} · scheduled ${dateTime(m.created_at)}. It never started.`
  if (m.status === 'pending') return `${where} · queued ${dateTime(m.created_at)}. It has not been played yet.`
  if (m.status === 'failed')
    return `${where} · started ${dateTime(m.played_at)} · stopped after ${num(m.turns)} turns.`
  const counted = m.ladders.length ? ` · counted on ${m.ladders.join(' and ')}` : ''
  return `${where} · played ${dateTime(m.played_at)} · ${num(m.turns)} turns${m.status === 'rated' ? counted : ''}.`
}

/** Each state says what happened in a sentence, not a code. */
function StateNote({ m }: { m: Match }) {
  if (m.status === 'finished') {
    return (
      <div style={{ marginBottom: 20 }}>
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
      <div style={{ marginBottom: 20 }}>
        <Note tone="info" title="Cancelled before it started.">
          <p>
            {m.withdrawn_reason ??
              'The version it was scheduled for stopped being the active one before it could be played.'}{' '}
            Nothing was played and no rating moved.
            {m.successor ? (
              <>
                {' '}
                It was replaced by <Link to={`/matches/${m.successor_id}`}>{m.successor_id?.slice(0, 8)}</Link>.
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
      <div style={{ marginBottom: 20 }}>
        <Note tone="bad" title={`Seat ${(m.fault_seat ?? 0) + 1} faulted and the match was stopped.`}>
          <p>
            {seat ? <ModelLink id={seat.model_id} k={seat.class} /> : 'A seat'}{' '}
            {m.fault_reason ?? 'stopped answering'}. A failed match is not a loss — no rating moved for any
            seat, and the pairing will be scheduled again.
          </p>
        </Note>
      </div>
    )
  }
  return null
}

function Delta({ p, seats, strikeLimit }: { p: MatchPlayer; seats: number; strikeLimit: number | null }) {
  const changes = Object.entries(p.rating_change ?? {})
  return (
    <div className="delta">
      <div className="who">
        <ModelLink id={p.model_id} k={p.class} />
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
          // from mu alone -- a seat can gain mu and still lose rating.
          const was = c.mu_before === null || c.sigma_before === null ? null : c.mu_before - 3 * c.sigma_before
          const now = c.mu_after - 3 * c.sigma_after
          const diff = was === null ? null : now - was
          const tone = diff === null ? 'flat' : diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'
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

function recordRows(m: Match) {
  const played = m.status === 'rated' || m.status === 'finished' || m.status === 'failed'
  return [
    { key: 'Preset', value: m.preset },
    { key: 'Seed', value: <span className="mono">{m.seed}</span> },
    {
      key: 'Turns',
      value: played ? (m.status === 'failed' ? `${num(m.turns)} — stopped` : num(m.turns)) : 'none played',
    },
    {
      key: 'Counted on',
      value: m.status === 'rated' && m.ladders.length ? m.ladders.join(', ') : '—',
      hint:
        m.status === 'rated' && m.ladders.length === 1 && m.ladders[0] === 'open'
          ? 'The seats are not all one class, so no class ladder counts this match.'
          : undefined,
    },
    { key: 'Played', value: m.played_at ? dateTime(m.played_at) : '—' },
    { key: 'Took', value: ms(m.played_ms) },
    { key: 'Engine', value: <span className="mono">{shortHash(m.engine_digest)}</span> },
    { key: 'Evaluator', value: <span className="mono">{shortHash(m.evaluator_digest)}</span> },
    { key: 'Match id', value: <span className="mono">{m.id}</span> },
  ]
}
