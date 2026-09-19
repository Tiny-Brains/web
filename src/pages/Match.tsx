// The match page is the replay screen: the board, then one row a seat in finishing order.
// There is no /matches/:id/replay. A seat count is the map's, from 2 to 8, and nothing here
// assumes two.

import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { api, type Match, type MatchPlayer } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { usePlatform } from '../providers/platform-context'
import { dateTime, ms, num, rating as fmtRating, signed } from '../lib/format'
import { byPlace, placeWord, ratingMove, isLive } from '../lib/match'
import { Shell } from '../components/Shell'
import { DataTable, Icon, KeyValueList, Notice, PageHeader, Panel, PanelBody, PanelHead, type Column } from '../components/ui'
import { ClassBadge, MatchBadge, ModelLink, Owner } from '../components/Model'
import { Replay } from '../components/Replay'
import { Permalink } from '../components/Permalink'

export default function MatchPage() {
  const { id = '' } = useParams()
  const match = useApi(`match:${id}`, () => api.match(id))
  return (
    <Permalink result={match} kind="match" label="Loading the match">
      {(m) => <MatchDetail m={m} />}
    </Permalink>
  )
}

const STAGE_HEIGHT = 'max(360px, min(100vh, calc(100vw + 40px)))'

function MatchDetail({ m }: { m: Match }) {
  const { me } = useSession()
  const { gameName, seasonName } = usePlatform()
  const [search] = useSearchParams()
  const asked = Number.parseInt(search.get('turn') ?? '', 10)
  const shared = Number.isFinite(asked) && asked >= 0 ? asked : null
  const [turn, setTurn] = useState<number | null>(shared)

  const live = isLive(m.status)
  const played = m.status === 'rated' || m.status === 'finished' || m.status === 'failed'
  const seats = live || !played ? [...m.players].sort((a, b) => a.seat - b.seat) : byPlace(m.players)
  const n = seats.length
  const winners = seats.filter((p) => p.rank === 1 && p.outcome !== 'dq')
  const pair = n === 2 ? seats.slice().sort((a, b) => a.seat - b.seat) : null
  const title = pair ? `${pair[0].model} vs ${pair[1].model}` : `${n}-player match`
  const outcome = !played
    ? m.status === 'cancelled'
      ? 'Cancelled before it started'
      : live
        ? 'Playing now'
        : 'Queued'
    : winners.length > 1
      ? `Shared first: ${winners.map((p) => p.model).join(' and ')}`
      : winners[0]
        ? `Won by ${winners[0].model} v${winners[0].model_version}`
        : 'No seat finished first'
  const season = `/?season=${m.season}`
  const board = `/maps?season=${m.season}#${m.map}`

  const columns: Column<MatchPlayer>[] = [
    { key: 'place', head: 'Place', cell: (p) => <b>{played ? placeWord(p, seats) : '—'}</b> },
    { key: 'seat', head: 'Seat', className: 'seatno', cell: (p) => `seat ${p.seat + 1}` },
    {
      key: 'model',
      head: 'Model',
      cell: (p) => (
        <span className="who">
          <span>
            <ModelLink modelId={p.model_id} name={p.model} version={p.model_version} />
            {me && p.owner === me.handle ? <span className="you-tag">YOU</span> : null}
          </span>
          <small className="row" style={{ gap: 8 }}>
            <Owner handle={p.owner} baseline={p.baseline} />
            <ClassBadge k={p.class} />
          </small>
        </span>
      ),
    },
    { key: 'score', head: 'Score', align: 'right', cell: (p) => <span className="lead">{p.score ?? '—'}</span> },
    { key: 'strikes', head: 'Strikes', wideOnly: true, cell: (p) => <Strikes count={p.strikes ?? 0} limit={m.strike_limit} /> },
    ...m.ladders.map(
      (ladder): Column<MatchPlayer> => ({
        key: `l-${ladder}`,
        head: ladder === 'open' ? 'Open' : ladder,
        align: 'right',
        cell: (p) => <Change p={p} ladder={ladder} status={m.status} />,
      }),
    ),
  ]

  return (
    <Shell title={title} season={m.season}>
      <PageHeader
        crumbs={[
          { label: `${gameName} · ${seasonName(m.season)}`, to: season },
          { label: 'Matches', to: `/matches?season=${m.season}`, icon: 'i-matches' },
          { label: title },
        ]}
        title={
          pair ? (
            <>
              {pair[0].model} <span className="v">v{pair[0].model_version}</span> <span className="v">vs</span> {pair[1].model}{' '}
              <span className="v">v{pair[1].model_version}</span>
            </>
          ) : (
            title
          )
        }
        badges={
          <>
            <MatchBadge status={m.status} quiet={false} />
            {m.is_trial ? (
              <span className="mark">
                <Icon id="i-flask" />
                trial
              </span>
            ) : null}
          </>
        }
        actions={<ShareLink id={m.id} turn={turn} />}
        sub={
          <>
            {outcome} · map{' '}
            <Link to={board}>
              <b>{m.map}</b>
            </Link>{' '}
            ({n} seats) · seed <span className="mono">{m.seed}</span>
            {m.played_at ? ` · played ${dateTime(m.played_at)}` : ''}
          </>
        }
      />
      <div className="wrap page-body stack">
        <StateNotice m={m} />
        {played ? (
          <div>
            <Replay match={m} height={STAGE_HEIGHT} autoplay={shared === null} turn={shared ?? undefined} onTurn={setTurn} />
            <p className="keys">Space plays and pauses · ← → step a turn, shift for ten · scroll zooms, drag pans</p>
          </div>
        ) : null}
        <div className="split">
          <Panel>
            <PanelHead title={n === 2 ? 'Result' : 'Places'} end={`${n} seats · rating change`} />
            <DataTable
              columns={columns}
              rows={seats}
              rowKey={(p) => String(p.seat)}
              rowClass={(p) => (me && p.owner === me.handle ? 'you' : undefined)}
            />
          </Panel>
          <Panel>
            <PanelHead title="Details" />
            <PanelBody>
              <KeyValueList
                items={[
                  { key: 'Counts on', value: m.ladders.length ? m.ladders.join(' · ') : 'no ladder', hint: m.is_trial ? 'a trial feeds no ladder' : undefined },
                  { key: 'Seats', value: `${n}, set by the map` },
                  { key: 'Turns', value: m.turns === null ? '—' : num(m.turns) },
                  { key: 'Played in', value: ms(m.played_ms) },
                  { key: 'Engine', value: <span className="hash">{m.engine_digest ?? '—'}</span> },
                  ...(m.orion_version ? [{ key: 'Runtime', value: `Orion ${m.orion_version}` }] : []),
                ]}
              />
            </PanelBody>
          </Panel>
        </div>
      </div>
    </Shell>
  )
}

function Change({ p, ladder, status }: { p: MatchPlayer; ladder: string; status: Match['status'] }) {
  if (status === 'finished') {
    return (
      <span className="mark">
        <Icon id="i-clock" />
        counting
      </span>
    )
  }
  const c = p.rating_change?.[ladder]
  if (status !== 'rated' || !c) return <span className="muted">—</span>
  const move = ratingMove(c)
  const now = c.mu_after - 3 * c.sigma_after
  if (move === null) return <span title={`first rating, now ${fmtRating(now)}`}>new</span>
  return (
    <span className={move > 0 ? 'trend up' : move < 0 ? 'trend down' : 'trend flat'} title={`now ${fmtRating(now)}`}>
      {move > 0 ? '▲' : move < 0 ? '▼' : ''} {signed(move).replace('+', '').replace('-', '')}
    </span>
  )
}

function Strikes({ count, limit }: { count: number; limit: number | null }) {
  if (limit === null) return <>{count}</>
  return (
    <span aria-label={`${count} of ${limit} strikes`}>
      <span className="strikes" aria-hidden="true">
        {Array.from({ length: limit }, (_, i) => (
          <i className={i < count ? (count >= limit ? 'over' : 'on') : undefined} key={i} />
        ))}
      </span>
      {count} / {limit}
    </span>
  )
}

function ShareLink({ id, turn }: { id: string; turn: number | null }) {
  const [copied, setCopied] = useState(false)
  const path = `/matches/${id}${turn !== null ? `?turn=${turn}` : ''}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // No clipboard on an insecure origin; the link beside it still works.
    }
  }
  return (
    <button className="btn sm" type="button" onClick={() => void copy()}>
      <Icon id="i-link" />
      {copied ? 'Copied' : turn !== null ? `Copy link to turn ${turn}` : 'Copy link'}
    </button>
  )
}

function StateNotice({ m }: { m: Match }) {
  if (m.status === 'cancelled') {
    return (
      <Notice tone="info" title="Cancelled before it started. No rating moved.">
        {m.withdrawn_reason || m.successor ? (
          <p>
            {m.withdrawn_reason}
            {m.successor ? (
              <>
                {m.withdrawn_reason ? ' ' : null}The seat is held now by{' '}
                <Link to={`/versions/${m.successor.version_id}`}>
                  {m.successor.model} v{m.successor.version}
                </Link>
                .
              </>
            ) : null}
          </p>
        ) : null}
      </Notice>
    )
  }
  if (m.status === 'failed') {
    const seat = m.players.find((p) => p.seat === m.fault_seat)
    return (
      <Notice tone="bad" title={`Seat ${m.fault_seat === null ? '?' : m.fault_seat + 1} faulted. No rating moved.`}>
        <p>
          {seat ? `${seat.model} v${seat.model_version}` : 'A seat'} {m.fault_reason ?? 'stopped answering'}.
        </p>
      </Notice>
    )
  }
  if (isLive(m.status)) {
    return (
      <Notice tone="info" title="Playing now.">
        <p>The replay and the places appear when it finishes.</p>
      </Notice>
    )
  }
  if (m.status === 'pending') {
    return (
      <Notice tone="info" title="Queued.">
        <p>It will be played as soon as a runner claims it.</p>
      </Notice>
    )
  }
  return null
}
