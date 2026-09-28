// A MODEL'S CHANNEL: one name, its owner, the version that plays and the ones before it, its latest
// match in a Player, its season, its matches as cards, the story its owner wrote, and comments.
// The version page folded into it: a version is a row of the Versions block that opens inline.
//
// Three addresses, one page. `/models/:id` is the model; `/models/:id/v3` is the model with v3's row
// open, and opening or closing a row rewrites the address in place (no history entry), so a link
// to a row is the address bar. `/versions/:id`, the uuid form every API body carries, is resolved to
// its model and number and replaced by the `/models/:id/vN` address.
//
// WHAT IS THE OWNER'S DRAWS FOR THE OWNER ALONE. `/v1/models/{id}` lists only public versions;
// the rejected and in-flight ones come from the owner's own routes (`/v1/models`, then
// `/v1/me/versions/{id}` for each, since the list row is narrower than a version), and so do the
// in-flight notice and the story's held edit. `owner` on the model body is a uuid and
// `owner_handle` the handle: ownership is read off the uuid, never the handle.
//
// A baseline's story and notes are the team's, so an admin writes them (Soma's model_writable_by);
// the owner's desk (Submit, the in-flight notice, private versions) stays the real owner's.

import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { ApiError, api, type MatchSummary, type ModelDetail, type ModelSeason, type MyModelStory, type Outcome, type VersionDetail } from '../api'
import { useApi, type AsyncResult } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { usePlatform } from '../providers/platform-context'
import { useQueryState, useSelection } from '../lib/selection'
import { ago, bytes, date, dateTime, duration, micros, num, rating as fmtRating } from '../lib/format'
import { modelPath, versionPath } from '../lib/paths'
import { versionSteps } from '../lib/steps'
import { byPlace, matchWhen } from '../lib/match'
import { kStyle } from '../lib/weight-classes'
import { cx } from '../lib/cx'
import type { VizViewer } from '../lib/viz'
import { count, fill, lookup } from '../lib/copy'
import { Shell } from '../components/Shell'
import { Badge, Breadcrumbs, EmptyState, Field, Icon, KeyValueList, Notice, Section, Segmented, Skel, StepTracker, type Crumb } from '../components/ui'
import { CapMeter, ClassBadge, ClassIcon, MatchBadge, Owner, OwnerLink, ProvisionalMark, VersionBadge } from '../components/Model'
import { Avatar } from '../components/Avatar'
import { AskForHelp } from '../components/Help'
import { CardGrid, CardSkeletons, MatchCard } from '../components/MatchCard'
import { Replay } from '../components/Replay'
import { Comments } from '../components/Comments'
import { Prose } from '../components/Prose'
import { InlineError } from '../components/ErrorStates'
import { Permalink } from '../components/Permalink'
import T from '../../copy/model.json'
import common from '../../copy/common.json'

const B = T.banner
const F = T.inflight
const S = T.season
const V = T.versions
const R = T.record
const RE = T.reenter
const C = common.card

/** The board's height in the Player, and the whole Player's while it loads (the board plus its
 *  seat bar and transport), so nothing below moves when it draws. */
const STAGE = 'clamp(220px, 40vw, 520px)'
const PLAYER = 'clamp(308px, calc(40vw + 88px), 608px)'

const SEGMENT = /^v([1-9]\d*)$/

export default function ModelPage() {
  const { id = '', version, versionId } = useParams<{ id?: string; version?: string; versionId?: string }>()
  if (versionId) return <VersionAddress versionId={versionId} />
  return <ModelAddress id={id} segment={version ?? null} />
}

/** `/versions/:id`: find the version's model and number, then stand on `/models/:id/vN` instead.
 *  A version that is not public is the owner's to read, through their own route. */
function VersionAddress({ versionId }: { versionId: string }) {
  const { search } = useLocation()
  // A member of a private season reads by id through the member's route, once the seasons say so.
  const { priv: privFor, seasonsLoading } = usePlatform()
  const priv = privFor()
  const found = useApi(`version-at:${versionId}:${priv}`, async () => {
    try {
      return await api.version(versionId, priv)
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e
      try {
        return await api.myVersion(versionId)
      } catch {
        // A visitor's 401, or another person's version: either way it is the public 404.
        throw e
      }
    }
  }, !seasonsLoading)
  return (
    <Permalink result={found} kind="version" label={T.loadingVersion}>
      {(v) => <Navigate replace to={`${versionPath(v.model_id, v.version)}${search}`} />}
    </Permalink>
  )
}

function ModelAddress({ id, segment }: { id: string; segment: string | null }) {
  const { priv: privFor, seasonsLoading } = usePlatform()
  const priv = privFor()
  const model = useApi(`model:${id}:${priv}`, () => api.model(id, priv), !seasonsLoading)
  return (
    <Permalink result={model} kind="model" label={T.loading}>
      {(m) => <Channel m={m} segment={segment} />}
    </Permalink>
  )
}

function Channel({ m, segment }: { m: ModelDetail; segment: string | null }) {
  const { me, session } = useSession()
  const navigate = useNavigate()
  const { search } = useLocation()
  const owner = me !== null && me.id === m.owner
  const canWrite = owner || (m.baseline && me?.role === 'admin')

  // The owner's versions nobody else sees, each read whole so its row can open like any other.
  const own = useApi(
    `model-own:${m.model_id}:${me?.id ?? ''}`,
    async () => {
      const mine = await api.myModels(m.game)
      const entry = mine.find((x) => x.id === m.model_id)
      const shown = new Set(m.versions.map((v) => v.version_id))
      const hidden = (entry?.versions ?? []).filter((v) => !shown.has(v.version_id))
      return Promise.all(hidden.map((v) => api.myVersion(v.version_id)))
    },
    owner,
  )
  // A saved note answers with the whole version, which replaces the row.
  const [edited, setEdited] = useState<Record<string, VersionDetail>>({})
  const rows = useMemo(
    () => [...m.versions, ...(own.data ?? [])].map((v) => edited[v.version_id] ?? v).sort((a, b) => b.version - a.version),
    [m.versions, own.data, edited],
  )
  // Until the session and the owner's rows are known, a version not in the list may yet be theirs.
  const ownSettled = session.state !== 'loading' && (!owner || own.state !== 'loading')

  const playing = rows.find((v) => v.status === 'active') ?? null
  // The numbers are the playing version's; a baseline switched out of play keeps its own.
  const head = playing ?? rows.find((v) => v.ratings?.open) ?? null

  const matched = segment ? SEGMENT.exec(segment) : null
  const openN = matched ? Number(matched[1]) : null
  const openRow = openN !== null ? (rows.find((v) => v.version === openN) ?? null) : null
  const setOpen = (n: number | null) =>
    navigate(`${n === null ? modelPath(m.model_id) : versionPath(m.model_id, n)}${search}`, { replace: true })

  // Landing on a row's address, or following the notice to one, brings the row into view once.
  const scrollTo = useRef(openN !== null)
  useEffect(() => {
    if (!scrollTo.current || openN === null) return
    const el = document.getElementById(`version-${openN}`)
    if (!el) return
    scrollTo.current = false
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [openN, rows])
  const openFromNotice = (n: number) => {
    scrollTo.current = true
    setOpen(n)
  }

  const priv = usePlatform().priv()
  const season = useApi(`model-season:${m.model_id}`, () => api.modelSeason(m.model_id))
  const latestList = useApi(`model-latest:${m.model_id}:${priv}`, () => api.matches({ model: m.model_id, limit: 1 }, priv))
  const latest = latestList.data?.matches[0] ?? null
  const unplayed = latestList.state === 'ready' && latest === null

  const viewer = useRef<VizViewer | null>(null)
  const player = useRef<HTMLDivElement>(null)
  const watch = () => {
    player.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const v = viewer.current
    if (!v) return
    v.seek?.(v.range?.lo ?? 0)
    v.play?.()
  }

  return (
    <Shell title={openN !== null ? `${m.model} v${openN}` : m.model} season={segment ? openRow?.season : undefined}>
      <div className="wrap page-body stack model-page">
        <Banner m={m} head={head} versions={rows.length} season={season.data} owner={owner} onWatch={latest ? watch : null} />
        {owner ? <InFlight rows={rows} onOpen={openFromNotice} /> : null}
        {owner && !m.retired && ownSettled ? (
          <Reenter
            m={m}
            rows={rows}
            onEntered={(n) => {
              own.reload()
              openFromNotice(n)
            }}
          />
        ) : null}
        {unplayed ? null : (
          <div className="mp-play">
            <div ref={player} className="mp-player">
              {latestList.state === 'error' ? (
                <InlineError error={latestList.error} what={T.player.label} />
              ) : (
                <LatestPlayer
                  summary={latest}
                  loading={latestList.state === 'loading'}
                  onViewer={(v) => {
                    viewer.current = v
                  }}
                />
              )}
            </div>
            <SeasonCard result={season} modelId={m.model_id} />
          </div>
        )}
        <Story m={m} canWrite={canWrite} />
        <Matches m={m} rows={rows} unplayed={unplayed} />
        <Versions
          m={m}
          rows={rows}
          owner={owner}
          canWrite={canWrite}
          own={own}
          open={openN}
          missing={segment !== null && ownSettled && openRow === null ? segment : null}
          onToggle={(n) => setOpen(openN === n ? null : n)}
          onEdited={(v) => setEdited((e) => ({ ...e, [v.version_id]: v }))}
        />
        <Comments host={{ model: m.model_id }} />
      </div>
    </Shell>
  )
}

// ---- 1. the banner ------------------------------------------------------------------------

function Banner({
  m,
  head,
  versions,
  season,
  owner,
  onWatch,
}: {
  m: ModelDetail
  head: VersionDetail | null
  versions: number
  season: ModelSeason | null
  owner: boolean
  onWatch: (() => void) | null
}) {
  const sel = useSelection()
  const crumbs: Crumb[] = [
    m.baseline ? { label: T.crumbBaselines } : { label: `@${m.owner_handle}`, to: `/profile/${m.owner_handle}` },
    { label: m.model },
  ]
  const open = head?.ratings.open
  const klass = head?.class ? head.ratings[head.class] : undefined
  return (
    <section className="mp-banner">
      <Breadcrumbs items={crumbs} />
      <div className="mp-ident">
        <h1>
          <ClassIcon k={head?.class} className="mp-kmeter" />
          {m.model}
          {m.baseline ? <Badge tone="info">{T.badges.baseline}</Badge> : null}
          {m.retired ? <Badge tone="off">{T.badges.retired}</Badge> : null}
        </h1>
        <div className="mp-owner">
          {m.baseline ? (
            <>
              <Owner baseline />
              <span>{B.team}</span>
            </>
          ) : (
            <>
              <Avatar handle={m.owner_handle} />
              <OwnerLink handle={m.owner_handle} />
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{count(B.since, versions, { date: date(m.created_at) })}</span>
        </div>
        <dl className="mp-nums">
          <div>
            <dt>{B.open}</dt>
            <dd>
              {open ? (
                <>
                  {fmtRating(open.rating)}
                  {open.provisional ? <ProvisionalMark /> : null}
                  <small>{fill(B.rankOf, { rank: open.rank, field: open.field })}</small>
                </>
              ) : (
                <small>{B.notRated}</small>
              )}
            </dd>
          </div>
          <div>
            {/* One rated ladder: the rating lives in the Open card above. A weight class is a view
                of Open, so this card is the version's rank AMONG same-size versions, not a second
                rating -- the two can never disagree about order. */}
            <dt>{head?.class ? fill(B.class, { class: head.class }) : B.classNone}</dt>
            <dd>
              {klass ? (
                <>
                  {fill(B.rankOf, { rank: klass.rank, field: klass.field })}
                  {klass.provisional ? <ProvisionalMark /> : null}
                </>
              ) : (
                <small>{B.notRated}</small>
              )}
            </dd>
          </div>
          <div>
            <dt>
              <Icon id="i-matches" />
              {B.matches}
            </dt>
            <dd>{season ? num(season.record.played) : <Skel w={40} />}</dd>
          </div>
          <div>
            <dt>{B.versions}</dt>
            <dd>{num(versions)}</dd>
          </div>
          {season?.season ? <SeasonLine game={m.game} season={season.season} modelId={m.model_id} k={head?.class ?? null} /> : null}
        </dl>
      </div>
      <div className="mp-actions">
        {onWatch ? (
          <button type="button" className="btn primary" onClick={onWatch}>
            <Icon id="i-play" />
            {B.watch}
          </button>
        ) : null}
        {owner && !m.retired ? (
          <Link className="btn" to={sel.href('/submit', { model: m.model_id })}>
            <Icon id="i-plus" />
            {B.submit}
          </Link>
        ) : null}
      </div>
    </section>
  )
}

/** The model's Open rating across the season: at each edge of the hourly series, the best of its
 *  versions that stood on the ladder then. One series, so no legend; the class hue is its colour
 *  and the words beside it name it. Hovering reads a point off. */
function SeasonLine({ game, season, modelId, k }: { game: string; season: string; modelId: string; k: string | null }) {
  const priv = usePlatform().priv(season)
  const series = useApi(`model-line:${game}:${season}:${priv}`, () => api.leaderboardSeries(game, { ladder: 'open', season, points: 48, priv }))
  const [at, setAt] = useState<number | null>(null)
  const W = 200
  const H = 40
  const pts = useMemo(() => {
    const s = series.data?.series
    if (!s) return []
    const mine = s.versions.filter((v) => v.model_id === modelId)
    const out: { i: number; edge: string; r: number }[] = []
    s.edges.forEach((edge, i) => {
      let best: number | null = null
      for (const v of mine) {
        const r = v.ratings[i]
        if (r !== null && r !== undefined && (best === null || r > best)) best = r
      }
      if (best !== null) out.push({ i, edge, r: best })
    })
    return out
  }, [series.data, modelId])

  if (series.state !== 'ready' || pts.length < 2) {
    // The box keeps its size while the series loads; a model with one reading or none has no line.
    return series.state === 'loading' ? <div className="mp-line" aria-hidden="true" /> : null
  }
  const lo = Math.min(...pts.map((p) => p.r))
  const hi = Math.max(...pts.map((p) => p.r))
  const span = hi - lo || 1
  const n = series.data?.series.edges.length ?? pts.length
  const x = (i: number) => 3 + (i / Math.max(1, n - 1)) * (W - 6)
  const y = (r: number) => 3 + (1 - (r - lo) / span) * (H - 6)
  const last = pts[pts.length - 1]
  const shown = at === null ? null : pts[at]
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const fx = ((e.clientX - box.left) / box.width) * W
    let near = 0
    pts.forEach((p, j) => {
      if (Math.abs(x(p.i) - fx) < Math.abs(x(pts[near].i) - fx)) near = j
    })
    setAt(near)
  }
  return (
    <div className="mp-line" style={kStyle(k)}>
      <dt>{B.line}</dt>
      <dd>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          role="img"
          aria-label={fill(B.lineLabel, { first: fmtRating(pts[0].r), last: fmtRating(last.r) })}
          onPointerMove={move}
          onPointerLeave={() => setAt(null)}
        >
          <polyline points={pts.map((p) => `${x(p.i).toFixed(1)},${y(p.r).toFixed(1)}`).join(' ')} />
          <circle className="end" cx={x(last.i)} cy={y(last.r)} r={3} />
          {shown ? (
            <>
              <line className="hair" x1={x(shown.i)} x2={x(shown.i)} y1={0} y2={H} />
              <circle className="at" cx={x(shown.i)} cy={y(shown.r)} r={4} />
            </>
          ) : null}
        </svg>
        {shown ? (
          <span className="mp-line-tip" style={{ left: `${(x(shown.i) / W) * 100}%` }}>
            {fill(B.linePoint, { date: dateTime(shown.edge), rating: fmtRating(shown.r) })}
          </span>
        ) : null}
      </dd>
    
    </div>
  )
}

// ---- 2. in flight -------------------------------------------------------------------------

/** What a version is doing, as a sentence: the notice's body and the open row's lifecycle line. */
function stateSay(v: VersionDetail): string {
  if (v.status === 'testing') {
    return v.admit_attempt && v.admit_attempt > 1 ? fill(F.testing.bodyAttempt, { attempt: v.admit_attempt }) : F.testing.body
  }
  if (v.status === 'verified') {
    const t = v.trial
    if (t && (t.status === 'claimed' || t.status === 'running')) return fill(F.trial.body, { map: t.map })
    // Only a queued trial has waited: with no trial, `waiting_s` is not there either.
    const say = !t ? F.waiting.admitted : t.waiting_s === null ? F.waiting.queued : F.waiting.waited
    return fill(say, { date: dateTime(v.created_at), map: t?.map ?? '', waited: duration(t?.waiting_s) })
  }
  if (v.status === 'rejected') return v.reject_reason ?? F.rejected.noReason
  return lookup(R.phases, v.status) ?? ''
}

/**
 * THE ONE-CLICK RE-ENTRY, for the owner: the selected season is open, this model has nothing in it
 * (a refused version does not count), and it stands with a version in another season of the game.
 * Drawn only once the owner's rows have settled: a version still in admission is not on the public
 * list, so before then "nothing in it" cannot be told from "not read yet".
 * One button enters that version as it is -- the same files, over bytes already in the bucket -- and
 * from there it is an ordinary submission: admitted and tried again under this season's rules, drawn
 * by the in-flight notice above once the owner's rows are read again.
 */
function Reenter({ m, rows, onEntered }: { m: ModelDetail; rows: VersionDetail[]; onEntered: (n: number) => void }) {
  const { season, slug, seasonName } = usePlatform()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!season || season.state !== 'open' || m.game !== slug || done) return null
  if (rows.some((v) => v.season === season.slug && v.status !== 'rejected')) return null
  // What it stands with elsewhere: a version in play first, else the newest that played.
  const source = rows
    .filter((v) => v.season !== season.slug && (v.status === 'active' || v.status === 'superseded' || v.status === 'disabled'))
    .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.version - a.version)[0]
  if (!source) return null
  const vars = { model: m.model, season: season.name, from: seasonName(source.season), v: source.version }

  const enter = async () => {
    setBusy(true)
    setError(null)
    try {
      const made = await api.reenter({ game: m.game, model: m.model_id, season: season.slug, from: source.season })
      setDone(true)
      onEntered(made.version)
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'unsent'
      setError(fill(lookup(RE.said, code) ?? RE.fallback, { ...vars, code }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Notice tone="info" title={fill(RE.title, vars)}>
      <p>{fill(RE.body, vars)}</p>
      <p>
        <button type="button" className="btn primary sm" disabled={busy} onClick={() => void enter()}>
          <Icon id="i-plus" />
          {busy ? RE.entering : fill(RE.action, vars)}
        </button>
      </p>
      {error ? (
        <>
          <p className="form-error">
            <b>{RE.refused}</b> {error}
          </p>
          <AskForHelp />
        </>
      ) : null}
    </Notice>
  )
}

/** A version's memory in a line: what it carries on the largest board, against its class's cap there
 *  when the game says how large that board is. */
function memorySay(v: VersionDetail, cellsMax: number | null): string {
  const mem = bytes(v.memory_bytes)
  const flat = v.class_memory_flat_bytes ?? 0
  const cell = v.class_memory_cell_bytes ?? 0
  if (!v.class || (flat === 0 && cell === 0)) return fill(R.memoryLine, { bytes: mem })
  const vars = { bytes: mem, class: v.class, flat: bytes(flat), cell: bytes(cell) }
  return cellsMax === null ? fill(R.memoryCapNoBoard, vars) : fill(R.memoryCap, { ...vars, cap: bytes(flat + cell * cellsMax) })
}

function InFlight({ rows, onOpen }: { rows: VersionDetail[]; onOpen: (n: number) => void }) {
  // A version on its way, else the newest one if admission refused it; an older refusal is history,
  // and the row still has it.
  const v = rows.find((x) => x.status === 'testing' || x.status === 'verified') ?? (rows[0]?.status === 'rejected' ? rows[0] : null)
  if (!v) return null
  const inTrial = v.status === 'verified' && (v.trial?.status === 'claimed' || v.trial?.status === 'running')
  const title =
    v.status === 'testing' ? F.testing.title : v.status === 'rejected' ? F.rejected.title : inTrial ? F.trial.title : F.waiting.title
  return (
    <Notice tone={v.status === 'rejected' ? 'bad' : 'warn'} title={fill(title, { v: v.version })}>
      <p>
        {stateSay(v)}{' '}
        <button type="button" className="mp-link" onClick={() => onOpen(v.version)}>
          {fill(F.open, { v: v.version })}
        </button>
      </p>
      {v.status === 'rejected' ? <AskForHelp /> : null}
    </Notice>
  )
}

// ---- 3. the Player and This season --------------------------------------------------------

function LatestPlayer({
  summary,
  loading,
  onViewer,
}: {
  summary: MatchSummary | null
  loading: boolean
  onViewer: (v: VizViewer | null) => void
}) {
  const sel = useSelection()
  const priv = usePlatform().priv(summary?.season ?? undefined)
  const detail = useApi(`model-latest-match:${summary?.id ?? ''}:${priv}`, () => api.match(summary?.id ?? '', priv), Boolean(summary))
  const placed = summary ? byPlace(summary.seats) : []
  return (
    <figure className="mp-figure" aria-label={T.player.label}>
      {/* The Player rests on the last frame until it is played: the watch page and the home TV are
          the two that play on open. `turn` past the end is clamped by the viewer. */}
      {detail.state === 'error' ? <InlineError error={detail.error} what={T.player.label} /> : null}
      <Replay
        match={detail.data}
        tier="player"
        stageHeight={STAGE}
        height={PLAYER}
        turn={summary?.turns ?? undefined}
        onViewer={onViewer}
      />
      <figcaption className="mp-cap">
        {summary ? (
          <>
            <span>{T.player.latest}</span>
            <span aria-hidden="true">·</span>
            {placed.length ? (
              <b>
                {placed[0].model} <span className="v">{fill(C.version, { v: placed[0].version })}</span>
              </b>
            ) : null}
            {placed.length === 2 ? (
              <>
                <span>{C.vs}</span>
                <b>
                  {placed[1].model} <span className="v">{fill(C.version, { v: placed[1].version })}</span>
                </b>
              </>
            ) : placed.length > 2 ? (
              <span>{count(C.andMore, placed.length - 1)}</span>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>{summary.map}</span>
            <span aria-hidden="true">·</span>
            <span>{matchWhen(summary).text}</span>
            <MatchBadge status={summary.status} quiet={false} />
            <Link to={sel.href(`/matches/${summary.id}`)}>{T.player.open}</Link>
          </>
        ) : loading ? (
          <Skel w="60%" />
        ) : null}
      </figcaption>
    </figure>
  )
}

function outcomeOf(m: MatchSummary, modelId: string): Exclude<Outcome, null> | null {
  const seat = m.seats.find((s) => s.model_id === modelId)
  return seat?.outcome ?? null
}

/** A rating move to two places, the sign always said, minus as a minus sign. */
function delta2(d: number): string {
  return `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(2)}`
}

function SeasonCard({ result, modelId }: { result: AsyncResult<ModelSeason>; modelId: string }) {
  const sel = useSelection()
  if (result.state === 'error') {
    return (
      <aside className="mp-season">
        <InlineError error={result.error} what={S.failed} />
      </aside>
    )
  }
  const s = result.data
  const rank = s?.rank
  const other = (m: MatchSummary) => byPlace(m.seats).find((x) => x.model_id !== modelId)
  const moved = (label: string, pick: { delta: number; match: MatchSummary } | null | undefined) => (
    <>
      <dt>{label}</dt>
      <dd>
        {!s ? (
          <Skel w="70%" />
        ) : pick ? (
          <>
            <Link to={sel.href(`/matches/${pick.match.id}`)}>{fill(S.vs, { model: other(pick.match)?.model ?? '' })}</Link>
            <span className="muted"> · {pick.match.map}</span>
            <span className={cx('mp-delta', pick.delta > 0 ? 'up' : 'down')}>{delta2(pick.delta)}</span>
          </>
        ) : (
          <span className="muted">{S.noneYet}</span>
        )}
      </dd>
    </>
  )
  return (
    <aside className="mp-season" aria-labelledby="mp-season-h">
      <h2 id="mp-season-h">{S.title}</h2>
      <div className="mp-record">
        <b>{s ? fill(S.record, { won: s.record.won, lost: s.record.lost, drawn: s.record.drawn }) : <Skel w={90} />}</b>
        <small>{S.recordSay}</small>
        {s && s.last_five.length ? (
          <span className="mp-results" role="list" aria-label={S.lastFive}>
            {s.last_five.map((m) => {
              const o = outcomeOf(m, modelId)
              const key = o ?? 'draw'
              return (
                <Link
                  role="listitem"
                  className={cx('mp-result', o)}
                  to={sel.href(`/matches/${m.id}`)}
                  title={fill(lookup(S.resultTitle, key) ?? '', { map: m.map, when: ago(m.played_at) })}
                  key={m.id}
                >
                  {lookup(S.result, key) ?? '—'}
                </Link>
              )
            })}
          </span>
        ) : null}
      </div>
      <dl className="mp-rows">
        <dt>{S.rank}</dt>
        <dd>
          {!rank ? (
            <Skel w="60%" />
          ) : rank.now === null ? (
            <span className="muted">{S.rankNone}</span>
          ) : rank.week_ago !== null ? (
            <>
              {fill(S.rankWas, { rank: rank.now, was: rank.week_ago })}
              {rank.week_ago !== rank.now ? (
                <span className={cx('mp-delta', rank.week_ago > rank.now ? 'up' : 'down')}>
                  {rank.week_ago > rank.now ? <Icon id="i-up" /> : <Icon id="i-down" />}
                  {Math.abs(rank.week_ago - rank.now)}
                </span>
              ) : null}
            </>
          ) : (
            fill(S.rankNow, { rank: rank.now })
          )}
        </dd>
        {moved(S.bestWin, s?.best_win)}
        {moved(S.worstLoss, s?.worst_loss)}
      </dl>
    </aside>
  )
}

// ---- 4. the story -------------------------------------------------------------------------

/** The public reads the approved text; a writer reads their own view (approved and held side by
 *  side) and edits it in place. No story is no block, except for a writer, who gets the prompt. */
function Story({ m, canWrite }: { m: ModelDetail; canWrite: boolean }) {
  const { me } = useSession()
  const pub = useApi(
    `story:${m.model_id}`,
    () =>
      api.modelStory(m.model_id).catch((e: unknown) => {
        // 404 `no_story` is the ordinary answer for most models, not an error.
        if (e instanceof ApiError && e.status === 404) return null
        throw e
      }),
    !canWrite,
  )
  const mine = useApi(`story-mine:${m.model_id}:${me?.id ?? ''}`, () => api.myModelStory(m.model_id), canWrite)
  const [saved, setSaved] = useState<MyModelStory | null>(null)
  const [editing, setEditing] = useState(false)

  if (!canWrite) {
    if (pub.state === 'error') return <InlineError error={pub.error} what={T.story.label} />
    const s = pub.data
    if (!s) return null
    return (
      <StoryText
        m={m}
        title={s.title}
        body={s.body}
        featured={s.featured}
        updated={s.updated_at}
      />
    )
  }

  if (mine.state === 'error') return <InlineError error={mine.error} what={T.story.label} />
  const w = saved ?? mine.data
  if (!w) return null
  const approved = w.title !== null && w.body !== null ? { title: w.title, body: w.body } : null
  const shown = approved ?? (w.pending ? { title: w.pending.title, body: w.pending.body } : null)

  if (editing) {
    return (
      <StoryEditor
        m={m}
        start={w.pending ?? approved ?? { title: '', body: '' }}
        onCancel={() => setEditing(false)}
        onSaved={(s) => {
          setSaved(s)
          setEditing(false)
        }}
      />
    )
  }
  if (!shown) {
    return (
      <section className="mp-story-empty">
        <h2>{fill(T.story.emptyTitle, { model: m.model })}</h2>
        <p>{T.story.emptyBody}</p>
        <button type="button" className="btn primary sm" onClick={() => setEditing(true)}>
          <Icon id="i-post" />
          {T.story.write}
        </button>
      </section>
    )
  }
  const word = w.pending ? (w.pending.hold_tag === 'link' ? T.story.held.link : `“${w.pending.hold_tag}”`) : ''
  return (
    <StoryText
      m={m}
      title={shown.title}
      body={shown.body}
      featured={w.featured_at !== null}
      updated={w.updated_at}
      waiting={!approved}
      onEdit={() => setEditing(true)}
    >
      {w.removed ? (
        <Notice tone="bad" title={T.story.removed.title}>
          <p>{T.story.removed.body}</p>
          <AskForHelp />
        </Notice>
      ) : w.pending ? (
        <Notice tone="warn" title={T.story.held.title}>
          <p>{fill(approved ? T.story.held.body : T.story.held.first, { word })}</p>
        </Notice>
      ) : null}
    </StoryText>
  )
}

function StoryText({
  m,
  title,
  body,
  featured,
  updated,
  waiting = false,
  onEdit,
  children,
}: {
  m: ModelDetail
  title: string
  body: string
  featured: boolean
  updated: string | null
  waiting?: boolean
  onEdit?: () => void
  children?: React.ReactNode
}) {
  return (
    <article className="mp-story" aria-labelledby="mp-story-h">
      <header className="mp-story-head">
        <h2 id="mp-story-h">{title}</h2>
        <span className="mp-story-meta">
          {m.baseline ? (
            <span>{T.story.team}</span>
          ) : (
            <>
              <Avatar handle={m.owner_handle} size="xs" />
              <span>{fill(T.story.by, { handle: m.owner_handle })}</span>
            </>
          )}
          {updated ? (
            <>
              <span aria-hidden="true">·</span>
              <span title={dateTime(updated)}>{fill(T.story.updated, { when: ago(updated) })}</span>
            </>
          ) : null}
          {featured ? <Badge tone="info">{T.badges.featured}</Badge> : null}
          {waiting ? <Badge tone="wait">{T.badges.waiting}</Badge> : null}
        </span>
        {onEdit ? (
          <button type="button" className="btn sm mp-story-edit" onClick={onEdit}>
            <Icon id="i-post" />
            {T.story.edit}
          </button>
        ) : null}
      </header>
      {children}
      <Prose text={body} />
    </article>
  )
}

const TITLE_MAX = 80
const BODY_MAX = 20000

function StoryEditor({
  m,
  start,
  onCancel,
  onSaved,
}: {
  m: ModelDetail
  start: { title: string; body: string }
  onCancel: () => void
  onSaved: (s: MyModelStory) => void
}) {
  const id = useId()
  const [title, setTitle] = useState(start.title)
  const [body, setBody] = useState(start.body)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const E = T.story.errors
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onSaved(await api.putModelStory(m.model_id, { title: title.trim(), body }))
    } catch (err) {
      const a = err instanceof ApiError ? err : null
      setError((a && lookup(E, a.code)) ?? fill(E.fallback, { message: a?.message ?? String(err) }))
      setBusy(false)
    }
  }
  return (
    <form className="mp-story-form" onSubmit={(e) => void submit(e)}>
      <Field label={T.story.form.title} htmlFor={`${id}-t`} hint={T.story.form.titleHint}>
        <input
          id={`${id}-t`}
          className="input"
          value={title}
          maxLength={TITLE_MAX}
          required
          onChange={(e) => setTitle(e.target.value.replace(/[\r\n]/g, ' '))}
        />
      </Field>
      <Field
        label={T.story.form.body}
        htmlFor={`${id}-b`}
        hint={
          <>
            {T.story.form.bodyHint}{' '}
            <span className="muted">{fill(T.story.form.count, { n: num(body.length), max: num(BODY_MAX) })}</span>
          </>
        }
      >
        <textarea id={`${id}-b`} className="input mp-story-text" value={body} maxLength={BODY_MAX} rows={16} required onChange={(e) => setBody(e.target.value)} />
      </Field>
      {error ? (
        <Notice tone="bad">
          <p>{error}</p>
          <AskForHelp />
        </Notice>
      ) : null}
      <div className="mp-form-actions">
        <button type="submit" className="btn primary sm" disabled={busy || !title.trim() || !body.trim()}>
          {busy ? T.story.form.saving : T.story.form.save}
        </button>
        <button type="button" className="btn sm" onClick={onCancel} disabled={busy}>
          {T.story.form.cancel}
        </button>
      </div>
    </form>
  )
}

// ---- 5. matches ---------------------------------------------------------------------------

function Matches({ m, rows, unplayed }: { m: ModelDetail; rows: VersionDetail[]; unplayed: boolean }) {
  const sel = useSelection()
  const [q, setQ] = useQueryState()
  // The chip is in the address (`?v=3`), so a narrowed grid is a link.
  const played = rows.filter((v) => v.last_played_at !== null)
  const chip = played.find((v) => String(v.version) === q('v')) ?? null
  const priv = usePlatform().priv()
  const list = useApi(
    `model-matches:${m.model_id}:${chip?.version_id ?? ''}:${priv}`,
    () => api.matches({ model: m.model_id, version: chip?.version_id ?? null, limit: 12 }, priv),
    !unplayed,
  )
  const more = sel.href('/matches', { model: m.model_id })
  return (
    <Section icon="i-matches" title={T.matches.title} more={unplayed ? undefined : { label: T.matches.all, to: more, icon: 'i-matches' }}>
      {played.length > 1 ? (
        <div className="mp-chips">
          <Segmented
            label={T.matches.chipLabel}
            value={chip ? String(chip.version) : ''}
            onChange={(k) => setQ({ v: k })}
            items={[{ key: '', label: T.matches.chipAll }, ...played.map((v) => ({ key: String(v.version), label: fill(C.version, { v: v.version }) }))]}
          />
        </div>
      ) : null}
      {unplayed ? (
        <EmptyState boxed>{T.matches.empty}</EmptyState>
      ) : list.state === 'error' ? (
        <InlineError error={list.error} what={T.matches.what} />
      ) : list.state === 'loading' ? (
        <CardGrid>
          <CardSkeletons n={6} />
        </CardGrid>
      ) : list.data.matches.length === 0 ? (
        <EmptyState boxed>{chip ? fill(T.matches.emptyVersion, { v: chip.version }) : T.matches.empty}</EmptyState>
      ) : (
        <CardGrid>
          {list.data.matches.map((x) => (
            <MatchCard m={x} via="grid" key={x.id} />
          ))}
        </CardGrid>
      )}
    </Section>
  )
}

// ---- 6. versions --------------------------------------------------------------------------

function Versions({
  m,
  rows,
  owner,
  canWrite,
  own,
  open,
  missing,
  onToggle,
  onEdited,
}: {
  m: ModelDetail
  rows: VersionDetail[]
  owner: boolean
  canWrite: boolean
  own: { state: 'loading' | 'ready' | 'error' }
  open: number | null
  missing: string | null
  onToggle: (n: number) => void
  onEdited: (v: VersionDetail) => void
}) {
  const H = V.head
  return (
    <Section title={V.title} sub={owner ? V.subMine : V.sub}>
      <div className="stack tight">
        {missing ? <Notice tone="info" title={fill(V.missing, { version: missing })} /> : null}
        {owner && own.state === 'error' ? <Notice tone="warn" title={V.ownFailed} /> : null}
        {rows.length === 0 && !(owner && own.state === 'loading') ? (
          <EmptyState boxed>{V.empty}</EmptyState>
        ) : (
          <div className="panel">
            <div className="tscroll">
              <table className="table mp-versions">
                <thead>
                  <tr>
                    <th>{H.version}</th>
                    <th>{H.status}</th>
                    <th className="wide-only">{H.class}</th>
                    <th className="r wide-only">{H.size}</th>
                    <th className="r">{H.open}</th>
                    <th className="wide-only">{H.entered}</th>
                    <th className="mp-note">{H.note}</th>
                    <th className="mp-xo">
                      <span className="vis-hidden">{H.more}</span>
                    </th>
                  </tr>
                </thead>
                <tbody aria-busy={(owner && own.state === 'loading') || undefined}>
                  {rows.map((v) => (
                    <VersionRow
                      m={m}
                      v={v}
                      canWrite={canWrite}
                      open={open === v.version}
                      onToggle={() => onToggle(v.version)}
                      onEdited={onEdited}
                      key={v.version_id}
                    />
                  ))}
                  {owner && own.state === 'loading' ? (
                    <tr aria-label={V.loadingOwn}>
                      <td><Skel w={22} /></td>
                      <td><Skel w={90} /></td>
                      <td className="wide-only"><Skel w={60} /></td>
                      <td className="r wide-only"><Skel w={50} /></td>
                      <td className="r"><Skel w={42} /></td>
                      <td className="wide-only"><Skel w={70} /></td>
                      <td className="mp-note"><Skel w={160} /></td>
                      <td className="mp-xo" />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

const COLS = 8

function VersionRow({
  m,
  v,
  canWrite,
  open,
  onToggle,
  onEdited,
}: {
  m: ModelDetail
  v: VersionDetail
  canWrite: boolean
  open: boolean
  onToggle: () => void
  onEdited: (v: VersionDetail) => void
}) {
  const xid = `version-${v.version}-record`
  const r = v.ratings?.open
  return (
    <>
      <tr
        id={`version-${v.version}`}
        className={cx('mp-vrow', open && 'open', v.status === 'active' && 'you')}
        onClick={(e) => {
          // A click on the row opens it; a click on a control in it is that control's.
          if ((e.target as HTMLElement).closest('a, button, input, form')) return
          onToggle()
        }}
      >
        <td className="mono">v{v.version}</td>
        <td>
          <VersionBadge status={v.status} />
        </td>
        <td className="wide-only">
          <ClassBadge k={v.class} />
        </td>
        <td className="r mono wide-only">
          {bytes(v.size_bytes)}
          {v.memory_bytes ? (
            <span className="mp-mem" title={fill(V.memory, { bytes: bytes(v.memory_bytes) })}>
              <Icon id="i-memory" label={fill(V.memory, { bytes: bytes(v.memory_bytes) })} />
              {bytes(v.memory_bytes)}
            </span>
          ) : null}
        </td>
        <td className="r">
          {r ? (
            <span className="lead">
              {fmtRating(r.rating)}
              {r.provisional ? <ProvisionalMark /> : null}
            </span>
          ) : (
            <span className="muted">—</span>
          )}
        </td>
        <td className="wide-only muted" title={dateTime(v.created_at)}>
          {ago(v.created_at)}
        </td>
        <td className="mp-note">
          <Note v={v} canWrite={canWrite} onEdited={onEdited} />
        </td>
        <td className="mp-xo">
          <button
            type="button"
            className="icon-btn"
            aria-expanded={open}
            aria-controls={open ? xid : undefined}
            aria-label={fill(open ? V.hide : V.show, { v: v.version })}
            title={fill(open ? V.hide : V.show, { v: v.version })}
            onClick={onToggle}
          >
            <Icon id="i-chevron" />
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="mp-vx" id={xid}>
          <td colSpan={COLS}>
            <VersionRecord m={m} v={v} canWrite={canWrite} onEdited={onEdited} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

/** The owner's one line about a version, edited on its row. */
function Note({ v, canWrite, onEdited }: { v: VersionDetail; canWrite: boolean; onEdited: (v: VersionDetail) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const N = V.note
  if (draft === null) {
    return (
      <span className="mp-note-line">
        {v.note ? <span>{v.note}</span> : null}
        {canWrite ? (
          <button
            type="button"
            className={v.note ? 'icon-btn' : 'mp-link'}
            aria-label={fill(N.edit, { v: v.version })}
            title={fill(N.edit, { v: v.version })}
            onClick={() => {
              setError(null)
              setDraft(v.note ?? '')
            }}
          >
            {v.note ? <Icon id="i-post" /> : N.add}
          </button>
        ) : null}
      </span>
    )
  }
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const next = await api.updateVersionNote(v.version_id, draft.trim() || null)
      onEdited(next)
      setDraft(null)
    } catch (err) {
      const a = err instanceof ApiError ? err : null
      // A listed word comes back beside `error`, not in `detail`.
      const word = (a?.body as { word?: unknown } | undefined)?.word
      const say = a ? lookup(N.errors, a.code) : undefined
      setError(say ? fill(say, { word: String(word ?? '') }) : fill(N.errors.fallback, { message: a?.message ?? String(err) }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="mp-note-form" onSubmit={(e) => void save(e)}>
      <input
        className="input"
        value={draft}
        maxLength={120}
        aria-label={fill(N.label, { v: v.version })}
        title={N.hint}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setDraft(null)
        }}
      />
      <button type="submit" className="btn primary sm" disabled={busy}>
        {N.save}
      </button>
      <button type="button" className="btn sm" disabled={busy} onClick={() => setDraft(null)}>
        {N.cancel}
      </button>
      {error ? <p className="mp-note-error">{error}</p> : null}
    </form>
  )
}

/** A version's row, opened: where it is in its life, its size against its cap, when it played, and
 *  the hashes admission checked. What the version page used to be. */
function VersionRecord({
  m,
  v,
  canWrite,
  onEdited,
}: {
  m: ModelDetail
  v: VersionDetail
  canWrite: boolean
  onEdited: (v: VersionDetail) => void
}) {
  const sel = useSelection()
  const { seasonName, game } = usePlatform()
  const cellsMax = game?.limits?.boards?.cells_max ?? null
  const { search } = useLocation()
  const played = v.ratings?.open?.matches ?? 0
  return (
    <div className="mp-vrec">
      <div className="stack tight">
        {m.baseline ? (
          <p className="steps-say">{stateSay(v)}</p>
        ) : (
          <>
            <h3>{R.lifecycle}</h3>
            <StepTracker steps={versionSteps(v.status)} say={stateSay(v)} />
          </>
        )}
        {v.status === 'rejected' ? <AskForHelp /> : null}
        <h3>{R.size}</h3>
        <CapMeter size={v.size_bytes} limit={v.class_max_bytes} k={v.class} />
        {v.param_count !== null || v.infer_us !== null ? (
          <p className="muted mp-measures">{fill(R.measures, { params: num(v.param_count), infer: micros(v.infer_us) })}</p>
        ) : null}
        {v.memory_bytes ? (
          <>
            <h3>{R.memory}</h3>
            <p className="muted">{memorySay(v, cellsMax)}</p>
          </>
        ) : null}
      </div>
      <div className="stack tight">
        {/* The note column folds away on a phone; the open row carries it there instead. */}
        {v.note || canWrite ? (
          <div className="mp-note-narrow stack tight">
            <h3>{V.head.note}</h3>
            <Note v={v} canWrite={canWrite} onEdited={onEdited} />
          </div>
        ) : null}
        <h3>{R.title}</h3>
        <KeyValueList
          items={[
            { key: m.baseline ? R.inPlaySince : R.submitted, value: dateTime(v.created_at) },
            { key: R.season, value: seasonName(v.season) },
            ...(v.last_played_at ? [{ key: R.lastPlayed, value: dateTime(v.last_played_at) }] : []),
            ...(v.successor
              ? [{ key: R.replacedBy, value: <Link to={`${versionPath(m.model_id, v.successor)}${search}`}>v{v.successor}</Link> }]
              : []),
            {
              key: (
                <>
                  <Icon id="i-matches" /> {R.matches}
                </>
              ),
              value:
                played > 0 ? (
                  <>
                    {fill(R.matchesValue, { n: num(played) })}
                    <span aria-hidden="true"> · </span>
                    <Link to={sel.href('/matches', { model: m.model_id, version: v.version_id, season: v.season })}>{R.matchesLink}</Link>
                  </>
                ) : (
                  <span className="muted">{R.notPlayed}</span>
                ),
            },
          ]}
        />
        <h3>{R.provenance}</h3>
        <KeyValueList
          items={[
            { key: R.modelHash, value: <span className="hash">{v.weights_hash ?? '—'}</span> },
            { key: R.manifestHash, value: <span className="hash">{v.manifest_hash ?? '—'}</span> },
            { key: R.artifact, value: <span className="hash">{fill(R.artifactPath, { id: v.version_id })}</span> },
            ...(v.orion_version ? [{ key: R.runtime, value: fill(R.runtimeValue, { version: v.orion_version }) }] : []),
          ]}
        />
      </div>
    </div>
  )
}
