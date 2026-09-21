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
import { DataTable, Icon, KeyValueList, Notice, PageHeader, Panel, PanelBody, PanelHead, Rich, type Column } from '../components/ui'
import { ClassBadge, MatchBadge, ModelLink, Owner } from '../components/Model'
import { Replay } from '../components/Replay'
import { Permalink } from '../components/Permalink'
import { fill, lookup } from '../lib/copy'
import T from '../../copy/match.json'
import common from '../../copy/common.json'

export default function MatchPage() {
  const { id = '' } = useParams()
  const match = useApi(`match:${id}`, () => api.match(id))
  return (
    <Permalink result={match} kind="match" label={T.loading}>
      {(m) => <MatchDetail m={m} />}
    </Permalink>
  )
}

/** The board is three quarters of the viewport's SHORTER side (75vmin): it used to take the whole
 *  height, which left nothing of the page in view. The viewer adds its bars on top -- one row of
 *  seats or several, as the width decides -- so the board is this size on a phone as on a desktop.
 *  PLAYER_HEIGHT is only the fallback for a viewer without `stageHeight`: the board plus one row of
 *  seats and the transport (88px). */
const BOARD_HEIGHT = 'max(232px, 75vmin)'
const PLAYER_HEIGHT = 'max(320px, calc(75vmin + 88px))'

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
  const title = pair ? fill(T.title.pair, { a: pair[0].model, b: pair[1].model }) : fill(T.title.many, { n })
  const outcome = !played
    ? m.status === 'cancelled'
      ? T.outcome.cancelled
      : live
        ? T.outcome.live
        : T.outcome.queued
    : winners.length > 1
      ? fill(T.outcome.shared, { models: winners.map((p) => p.model).join(T.outcome.sharedJoin) })
      : winners[0]
        ? fill(T.outcome.won, { model: winners[0].model, version: String(winners[0].model_version) })
        : T.outcome.none
  const season = `/?season=${m.season}`
  const board = `/maps?season=${m.season}#${m.map}`

  const columns: Column<MatchPlayer>[] = [
    { key: 'place', head: T.columns.place, cell: (p) => <b>{played ? placeWord(p, seats) : '—'}</b> },
    { key: 'seat', head: T.columns.seat, className: 'seatno', cell: (p) => fill(T.columns.seatNo, { n: p.seat + 1 }) },
    {
      key: 'model',
      head: T.columns.model,
      cell: (p) => (
        <span className="who">
          <span>
            <ModelLink modelId={p.model_id} name={p.model} version={p.model_version} />
            {me && p.owner === me.handle ? <span className="you-tag">{common.marks.you}</span> : null}
          </span>
          <small className="row" style={{ gap: 8 }}>
            <Owner handle={p.owner} baseline={p.baseline} />
            <ClassBadge k={p.class} />
          </small>
        </span>
      ),
    },
    { key: 'score', head: T.columns.score, align: 'right', cell: (p) => <span className="lead">{p.score ?? '—'}</span> },
    { key: 'strikes', head: T.columns.strikes, wideOnly: true, cell: (p) => <Strikes count={p.strikes ?? 0} limit={m.strike_limit} /> },
    ...m.ladders.map(
      (ladder): Column<MatchPlayer> => ({
        key: `l-${ladder}`,
        head: ladder === 'open' ? T.columns.open : ladder,
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
          { label: T.crumb, to: `/matches?season=${m.season}`, icon: 'i-matches' },
          { label: title },
        ]}
        title={
          pair ? (
            <>
              {pair[0].model} <span className="v">v{pair[0].model_version}</span> <span className="v">{T.vs}</span> {pair[1].model}{' '}
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
                {T.trial}
              </span>
            ) : null}
          </>
        }
        actions={<ShareLink id={m.id} turn={turn} />}
        sub={
          <Rich
            text={m.played_at ? T.subPlayed : T.sub}
            vars={{
              outcome,
              map: (
                <Link to={board}>
                  <b>{m.map}</b>
                </Link>
              ),
              n,
              seed: <span className="mono">{m.seed}</span>,
              when: dateTime(m.played_at),
            }}
          />
        }
      />
      <div className="wrap page-body stack">
        <StateNotice m={m} />
        {played ? (
          <div>
            <Replay match={m} stageHeight={BOARD_HEIGHT} height={PLAYER_HEIGHT} autoplay={shared === null} turn={shared ?? undefined} onTurn={setTurn} />
            <p className="keys">{T.keys}</p>
          </div>
        ) : null}
        <div className="split">
          <Panel>
            <PanelHead title={n === 2 ? T.places.title : T.places.titleMany} end={fill(T.places.end, { n })} />
            <DataTable
              columns={columns}
              rows={seats}
              rowKey={(p) => String(p.seat)}
              rowClass={(p) => (me && p.owner === me.handle ? 'you' : undefined)}
            />
          </Panel>
          <Panel>
            <PanelHead title={T.details.title} />
            <PanelBody>
              <KeyValueList
                items={[
                  {
                    key: T.details.countsOn,
                    value: m.ladders.length ? m.ladders.join(' · ') : T.details.noLadder,
                    hint: m.is_trial ? T.details.trialHint : undefined,
                  },
                  { key: T.details.seats, value: fill(T.details.seatsValue, { n }) },
                  { key: T.details.turns, value: m.turns === null ? '—' : num(m.turns) },
                  { key: T.details.playedIn, value: ms(m.played_ms) },
                  { key: T.details.engine, value: <span className="hash">{m.engine_digest ?? '—'}</span> },
                  ...(m.orion_version ? [{ key: T.details.runtime, value: fill(T.details.runtimeValue, { version: m.orion_version }) }] : []),
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
        {T.change.counting}
      </span>
    )
  }
  const c = p.rating_change?.[ladder]
  if (status !== 'rated' || !c) return <span className="muted">—</span>
  const move = ratingMove(c)
  const now = c.mu_after - 3 * c.sigma_after
  if (move === null) return <span title={fill(T.change.newTitle, { rating: fmtRating(now) })}>{T.change.new}</span>
  return (
    <span className={move > 0 ? 'trend up' : move < 0 ? 'trend down' : 'trend flat'} title={fill(T.change.title, { rating: fmtRating(now) })}>
      {move > 0 ? '▲' : move < 0 ? '▼' : ''} {signed(move).replace('+', '').replace('-', '')}
    </span>
  )
}

function Strikes({ count, limit }: { count: number; limit: number | null }) {
  if (limit === null) return <>{count}</>
  return (
    <span aria-label={fill(T.strikes, { count, limit })}>
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
      {copied ? T.share.copied : turn !== null ? fill(T.share.turn, { turn }) : T.share.link}
    </button>
  )
}

function StateNotice({ m }: { m: Match }) {
  if (m.status === 'cancelled') {
    return (
      <Notice tone="info" title={T.notice.cancelled}>
        {m.withdrawn_reason || m.successor ? (
          <p>
            {m.withdrawn_reason}
            {m.successor ? (
              <>
                {m.withdrawn_reason ? ' ' : null}
                <Rich
                  text={T.notice.successor}
                  vars={{
                    version: (
                      <Link to={`/versions/${m.successor.version_id}`}>
                        {m.successor.model} v{m.successor.version}
                      </Link>
                    ),
                  }}
                />
              </>
            ) : null}
          </p>
        ) : null}
      </Notice>
    )
  }
  if (m.status === 'failed') {
    // A failure is the fleet's, never a seat's: a model's own mistakes are strikes.
    const why = m.fault_reason ? (lookup(T.notice.failedReasons, m.fault_reason) ?? m.fault_reason) : null
    return (
      <Notice tone="bad" title={T.notice.failed}>
        {why ? <p>{why}</p> : null}
      </Notice>
    )
  }
  if (isLive(m.status)) {
    return (
      <Notice tone="info" title={T.notice.live}>
        <p>{T.notice.liveBody}</p>
      </Notice>
    )
  }
  if (m.status === 'pending') {
    return (
      <Notice tone="info" title={T.notice.queued}>
        <p>{T.notice.queuedBody}</p>
      </Notice>
    )
  }
  return null
}
