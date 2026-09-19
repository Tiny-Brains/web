// `/admin/seasons` — admin session only. The one link to it is the Admin group of an administrator's
// account menu, so the page still has to introduce itself.
//
// A DESK, NOT A DOCUMENT. One season at a time — the one the header's switcher selects, which is
// the live one unless another is chosen — drawn as a strip that says where it stands, then its maps
// and its baselines side by side. The page is a FIXED HEIGHT and each list scrolls inside its own
// panel, so a season of forty boards and a dozen baselines is one screen, not a scroll past one
// list to reach the other. Creating a season is a form an admin fills in a few times a year, so it
// is a page of its own (`/admin/seasons/new`) behind a button.
//
// THE MAPS AND THE BASELINES ARE THE SEASON'S, AND THE TWO THINGS ABOUT IT THAT CHANGE WHILE IT IS
// LIVE. Both are uploaded here, both land SWITCHED OFF, and both are switched on and off
// with no delete: a board is public from its upload and the matches played on it name it; a
// baseline's ratings and matches name its version. A baseline is admitted first, by the same walk
// a competitor's submission takes, so its switch appears once admission has passed it.
//
// TWO OPERATIONS ON THE SEASON ITSELF, and they are not symmetrical. Moving a scheduled season's
// dates is a form. Closing one is a REQUEST, because it settles every rating and freezes every
// standing and cannot be undone — so the strip makes you type the season's slug rather than click
// a red button by accident.

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type Season, type SeasonBaseline, type SeasonMap } from '../api'
import { usePlatform } from '../providers/platform-context'
import { useSession } from '../providers/session-context'
import { useSelection } from '../lib/selection'
import { baselineSaid, mapSaid, seasonSaid } from '../lib/season-refusals'
import { UploadFailed, canHashHere, pickFile, putBytes, type Picked } from '../lib/upload'
import { bytes, dateInput, dateToIso, num } from '../lib/format'
import { cx } from '../lib/cx'
import { Shell } from '../components/Shell'
import {
  Badge, type Column, ConfirmAction, DataTable, Icon, IconLabel, Loading, Notice, PageHeader, Panel, PanelBody,
  PanelHead, Select, Switch,
} from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { ClassIcon, RatingValue, SeasonBadge } from '../components/Model'
import { InlineError, AdminGate } from '../components/ErrorStates'

export default function SeasonsAdmin() {
  const { me, session } = useSession()

  if (session.state === 'loading') {
    return (
      <Shell title="Seasons · admin">
        <section className="wrap page-body">
          <Loading rows={3} label="Checking your session" />
        </section>
      </Shell>
    )
  }

  // Gated here as a courtesy, not as the control: Soma answers 403 to a non-admin whatever this
  // page renders, and that is what actually protects the operations.
  if (!me || me.role !== 'admin') {
    return (
      <Shell title="Seasons · admin">
        <AdminGate signedIn={Boolean(me)} />
      </Shell>
    )
  }

  return <Desk />
}

function Desk() {
  const { slug: game, gameName, season: resolved, seasons, seasonsLoading, reload } = usePlatform()
  const { href } = useSelection()
  // THE SEASON ON SCREEN OUTLIVES A RELOAD OF THE SEASONS. Moving the dates or requesting a close
  // re-reads them, and while that runs the platform has no season -- which would unmount the desk,
  // and with it the sheet saying what just happened. React's own pattern for state that follows a
  // value: set during render, compared first, so it settles in one extra pass.
  const [kept, setKept] = useState<Season | null>(resolved)
  if (resolved !== null && resolved !== kept) setKept(resolved)
  const season = resolved ?? (seasonsLoading ? kept : null)

  return (
    <Shell title="Seasons · admin" scoped>
      <PageHeader
        crumbs={[{ label: 'Admin', to: '/admin/seasons' }, { label: 'Seasons' }]}
        title="Seasons"
        badges={<Badge tone="info">Admin</Badge>}
        actions={
          <Link className="btn primary" to={href('/admin/seasons/new')}>
            <IconLabel icon="i-plus">New season</IconLabel>
          </Link>
        }
      >
        <AdminTabs current="seasons" />
      </PageHeader>

      <div className="wrap page-body">
        {season === null ? (
          seasonsLoading ? (
            <Loading rows={4} label="Loading the seasons" />
          ) : (
            <Notice tone="info" title={`${gameName} has never had a season.`}>
              <p>
                Create the first one with <b>New season</b>. It opens with no maps and no baselines; both are
                uploaded here afterwards.
              </p>
            </Notice>
          )
        ) : (
          <div className="desk">
            <SeasonStrip key={`strip-${season.slug}`} game={game} season={season} seasons={seasons} onDone={reload} />
            <div className="desk-lists">
              {/* Neither list reloads the seasons: a flip or an upload changes nothing the header or
                  the strip draws, and the seasons' reload blanks the desk while it runs. */}
              <MapsPanel key={`maps-${season.slug}`} game={game} season={season} />
              <BaselinesPanel key={`baselines-${season.slug}`} game={game} season={season} />
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}

/**
 * A read that KEEPS WHAT IT HAD while it asks again. `useApi` goes back to loading on a reload,
 * which is right for a page and wrong for a list polled every few seconds or flipped a row at a
 * time: the table would blank to skeletons on every tick. The answer is keyed, so switching season
 * never shows the last season's rows under the new one's name.
 */
function useKept<T>(key: string, run: () => Promise<T>) {
  const [kept, setKept] = useState<{ key: string; data: T | null; error: ApiError | null } | null>(null)
  const [nonce, setNonce] = useState(0)
  const latest = useRef(run)
  useEffect(() => {
    latest.current = run
  })
  useEffect(() => {
    let live = true
    latest.current().then(
      (data) => {
        if (live) setKept({ key, data, error: null })
      },
      (err: unknown) => {
        if (!live) return
        const error = err instanceof ApiError ? err : new ApiError(0, 'unknown', err instanceof Error ? err.message : String(err))
        setKept((was) => ({ key, data: was?.key === key ? was.data : null, error }))
      },
    )
    return () => {
      live = false
    }
  }, [key, nonce])
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const mine = kept?.key === key ? kept : null
  return { data: mine?.data ?? null, error: mine?.error ?? null, loading: mine === null, reload }
}

// ---- the season ------------------------------------------------------------------------------

const dayMonthYear = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Which season, where it stands, and the two operations on it. The picker is the header's
 *  switcher again, here where the admin is looking; both write the same `?season=`. */
function SeasonStrip({ game, season, seasons, onDone }: { game: string; season: Season; seasons: Season[]; onDone: () => void }) {
  const { setSeason } = useSelection()
  const [sheet, setSheet] = useState<'dates' | 'close' | null>(null)
  const open = season.state === 'open' || season.state === 'settling'
  const canClose = open && season.close_requested_at === null

  return (
    <Panel className="season-strip">
      <div className="strip-row">
        <Select
          look="pick"
          prefix="Season"
          label="Season"
          value={season.slug}
          options={seasons.map((s) => ({ value: s.slug, label: s.name, hint: s.state === 'closed' ? 'final' : s.state }))}
          onChange={(slug) => setSeason(slug)}
        />
        <SeasonBadge state={season.state} />
        <span className="strip-fact" title="Submission window">
          <Icon id="i-calendar" />
          {dayMonthYear(season.submissions_open_at)} → {dayMonthYear(season.closed_at ?? season.submissions_close_at)}
        </span>
        <span className="strip-fact" title="Versions entered">
          <Icon id="i-flask" label="Versions entered" />
          {num(season.entered_versions)}
        </span>
        <span className="strip-fact" title="Matches played">
          <Icon id="i-matches" label="Matches played" />
          {num(season.matches_played)}
        </span>
        <div className="strip-actions">
          {season.state === 'scheduled' ? (
            <button className={cx('btn sm', sheet === 'dates' && 'on')} type="button" onClick={() => setSheet(sheet === 'dates' ? null : 'dates')}>
              <IconLabel icon="i-calendar">Move dates</IconLabel>
            </button>
          ) : null}
          {canClose ? (
            <button className={cx('btn sm danger', sheet === 'close' && 'on')} type="button" onClick={() => setSheet(sheet === 'close' ? null : 'close')}>
              Close season
            </button>
          ) : null}
          {open && !canClose ? <Badge tone="wait">Close requested</Badge> : null}
          <Link className="btn sm" to={`/leaderboard?season=${season.slug}`}>
            <IconLabel icon="i-leaderboard">{season.state === 'closed' ? 'Final standings' : 'Standings'}</IconLabel>
          </Link>
        </div>
      </div>
      {sheet === 'dates' ? <DatesSheet season={season} game={game} onDone={onDone} /> : null}
      {sheet === 'close' ? <CloseSheet season={season} game={game} onDone={onDone} /> : null}
    </Panel>
  )
}

/**
 * MOVING A SEASON THAT HAS NOT OPENED YET — the only reversible operation on a season. Only while
 * it is scheduled, and only the two dates: an open season's window is what every competitor has
 * planned around, and its classes and engine are what its standings mean.
 */
function DatesSheet({ season, game, onDone }: { season: Season; game: string; onDone: () => void }) {
  const [opens, setOpens] = useState(() => dateInput(season.submissions_open_at))
  const [closes, setCloses] = useState(() => dateInput(season.submissions_close_at))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const moved = opens !== dateInput(season.submissions_open_at) || closes !== dateInput(season.submissions_close_at)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.updateSeason(game, season.slug, { submissions_open_at: dateToIso(opens), submissions_close_at: dateToIso(closes) })
      setSaved(true)
      onDone()
    } catch (err) {
      setError(seasonSaid(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="strip-sheet">
      <form
        className="strip-form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label>
          Opens
          <input
            className="input mono"
            type="date"
            value={opens}
            onChange={(e) => {
              setOpens(e.target.value)
              setSaved(false)
            }}
          />
        </label>
        <label>
          Closes
          <input
            className="input mono"
            type="date"
            value={closes}
            onChange={(e) => {
              setCloses(e.target.value)
              setSaved(false)
            }}
          />
        </label>
        <button className="btn primary sm" type="submit" disabled={busy || !moved || !opens || !closes}>
          {busy ? 'Moving…' : 'Move the dates'}
        </button>
        <span className="muted">
          {error ? null : saved ? 'Moved.' : 'Midnight UTC. Nothing has been played in it yet, so this changes no standing.'}
        </span>
      </form>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  )
}

/** Typing the slug is the confirmation. A destructive action that one mis-click can start is a
 *  destructive action that will eventually happen — and the slug, unlike a button, names the season
 *  it ends. */
function CloseSheet({ season, game, onDone }: { season: Season; game: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.closeSeason(game, season.slug)
      onDone()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === 'season_not_live'
            ? `${season.name} is not live any more, or its close was already asked for.`
            : err.message
          : 'The request could not be sent.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="strip-sheet stack">
      <Notice tone="warn" title={`Closing ${season.name} cannot be undone.`}>
        <p>
          Every rating settles, every standing freezes and the {season.weight_classes.length + 1} ladders become final.
          Queued matches are cancelled
          {season.in_flight_versions > 0 ? `, and ${num(season.in_flight_versions)} versions mid-trial are withdrawn` : ''}.
        </p>
      </Notice>
      <ConfirmAction word={season.slug} action={busy ? 'Requesting…' : `Close ${season.name}`} busy={busy} size="sm" onConfirm={() => void close()} />
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  )
}

// ---- a panel of the desk -----------------------------------------------------------------------

/** One list of the desk: a head, what needs saying, the table scrolling inside the panel's fixed
 *  height, and what adds to it at the foot. */
function DeskPanel({
  icon,
  title,
  end,
  notes,
  foot,
  children,
}: {
  icon: 'i-map' | 'i-anchor'
  title: string
  end?: ReactNode
  notes?: ReactNode
  foot?: ReactNode
  children: ReactNode
}) {
  return (
    <Panel className="fill">
      <PanelHead icon={icon} title={title} end={end} />
      {notes ? <PanelBody className="stack fill-notes">{notes}</PanelBody> : null}
      <div className="fill-scroll">{children}</div>
      {foot ? <div className="fill-foot">{foot}</div> : null}
    </Panel>
  )
}

/** A switch that asks before it takes something out of play: switching off cancels what is queued
 *  on it, which a second click cannot put back. */
function Confirm({ what, said, onYes, onNo, busy }: { what: string; said: ReactNode; onYes: () => void; onNo: () => void; busy: boolean }) {
  return (
    <Notice tone="warn" title={`Take ${what} out of play?`}>
      <p>{said}</p>
      <div className="row">
        <button className="btn sm danger" type="button" disabled={busy} onClick={onYes}>
          Switch off
        </button>
        <button className="btn sm" type="button" onClick={onNo}>
          Keep it
        </button>
      </div>
    </Notice>
  )
}

// ---- the season's maps ----------------------------------------------------------------------------

/** Every board of one season, and a switch each. A closed season's list is its record: no switch,
 *  no upload. */
function MapsPanel({ game, season }: { game: string; season: Season }) {
  const closed = season.state === 'closed'
  const list = useKept(`maps:${game}:${season.slug}`, () => api.seasonMaps(game, season.slug))
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const maps = list.data?.maps ?? []
  const off = maps.filter((m) => !m.enabled)
  const on = maps.length - off.length

  const flip = async (id: string, enabled: boolean) => {
    setBusy(id)
    setError(null)
    try {
      await api.setSeasonMap(game, season.slug, id, enabled)
    } catch (err) {
      setError(`${id}: ${mapSaid(err).said}`)
    } finally {
      setBusy(null)
      setConfirming(null)
      list.reload()
    }
  }

  const enableAll = async () => {
    for (const m of off) await flip(m.map_id, true)
  }

  const columns: Column<SeasonMap>[] = [
    {
      key: 'map',
      head: <IconLabel icon="i-map">Map</IconLabel>,
      cell: (m) => (
        <Link className="mono" to={`/maps?season=${season.slug}#${m.map_id}`}>
          {m.map_id}
        </Link>
      ),
    },
    { key: 'seats', head: <Icon id="i-seats" label="Seats" />, align: 'right', className: 'r-num', cell: (m) => m.players },
    { key: 'size', head: 'Size', align: 'right', className: 'r-num mono', wideOnly: true, cell: (m) => `${m.rows}×${m.cols}` },
    { key: 'matches', head: <Icon id="i-matches" label="Matches" />, align: 'right', className: 'r-num muted', wideOnly: true, cell: (m) => (m.matches ? num(m.matches) : '—') },
    {
      key: 'on',
      head: 'In play',
      cell: (m) =>
        closed ? (
          m.enabled ? 'yes' : 'no'
        ) : (
          <Switch
            checked={m.enabled}
            label={`${m.map_id} in play`}
            busy={busy !== null}
            onChange={(next) => (next ? void flip(m.map_id, true) : setConfirming(m.map_id))}
          />
        ),
    },
  ]

  const notes = (
    <>
      {!closed && list.data && on === 0 ? (
        <Notice tone="warn" title="No map is in play.">
          <p>Nothing is paired until one is switched on.</p>
        </Notice>
      ) : null}
      {confirming ? (
        <Confirm
          what={confirming}
          said="Its queued matches are cancelled; running ones finish and count. It can be switched on again."
          busy={busy !== null}
          onYes={() => void flip(confirming, false)}
          onNo={() => setConfirming(null)}
        />
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
    </>
  )
  const hasNotes = (!closed && list.data !== null && on === 0) || confirming !== null || error !== null

  return (
    <DeskPanel
      icon="i-map"
      title="Maps"
      end={
        <>
          {list.data ? (
            <span className="num">
              {num(on)} of {num(maps.length)} in play
            </span>
          ) : null}
          {!closed && off.length ? (
            <button className="btn sm" type="button" disabled={busy !== null} onClick={() => void enableAll()}>
              Switch all on
            </button>
          ) : null}
        </>
      }
      notes={hasNotes ? notes : null}
      foot={
        closed ? null : (
          <MapUpload
            game={game}
            season={season}
            onDone={list.reload}
          />
        )
      }
    >
      {list.error && !list.data ? (
        <InlineError error={list.error} what="The maps" />
      ) : (
        <DataTable
          state={list.loading ? 'loading' : 'ready'}
          columns={columns}
          rows={maps}
          rowKey={(m) => m.map_id}
          rowClass={(m) => (m.enabled ? undefined : 'off')}
          loadingRows={6}
          empty={closed ? 'This season had no maps.' : 'No maps yet. Drop the season’s map files below.'}
        />
      )}
    </DeskPanel>
  )
}

type MapUploaded = { file: string; ok: true; map: SeasonMap } | { file: string; ok: false; code: string; said: string }

/** Many `.json` files, dropped or picked, each POSTed in turn, each answered on its own line. */
function MapUpload({ game, season, onDone }: { game: string; season: Season; onDone: () => void }) {
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<MapUploaded[]>([])

  const send = async (files: File[]) => {
    const json = files.filter((f) => f.name.endsWith('.json'))
    if (json.length === 0) return
    setBusy(true)
    const out: MapUploaded[] = []
    for (const f of json) {
      let board: unknown
      try {
        board = JSON.parse(await f.text())
      } catch {
        out.push({ file: f.name, ok: false, code: 'not_json', said: 'Not JSON.' })
        setResults([...out])
        continue
      }
      try {
        const map = await api.addSeasonMap(game, season.slug, board)
        out.push({ file: f.name, ok: true, map })
      } catch (err) {
        out.push({ file: f.name, ok: false, ...mapSaid(err) })
      }
      setResults([...out])
    }
    setBusy(false)
    onDone()
  }

  const added = results.filter((r) => r.ok).length
  return (
    <div className="stack tight">
      <label
        className={cx('drop slim', over && 'over', busy && 'busy')}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (!busy) void send([...e.dataTransfer.files])
        }}
      >
        <Icon id="i-plus" />
        <b>{busy ? `Uploading ${results.length + 1}…` : 'Drop map files'}</b>
        <span className="muted">or pick them · .json · they land switched off</span>
        <input
          className="vis-hidden"
          type="file"
          accept=".json,application/json"
          multiple
          disabled={busy}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            void send(files)
          }}
        />
      </label>
      {results.length ? (
        <ul className="upload-results" aria-live="polite">
          {results.map((r, i) => (
            <li key={`${r.file}-${i}`} className={r.ok ? 'ok' : 'bad'}>
              <Icon id={r.ok ? 'i-check' : 'i-alert'} label={r.ok ? 'added' : 'refused'} />
              <span className="mono">{r.ok ? r.map.map_id : r.file}</span>
              {r.ok ? (
                <span className="muted">
                  {r.map.players} seats · {r.map.rows}×{r.map.cols}
                </span>
              ) : (
                <span>
                  {r.said} <code className="muted">{r.code}</code>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {added && !busy ? <p className="muted">{num(added)} added, switched off. Switch them on above to put them in play.</p> : null}
    </div>
  )
}

// ---- the season's baselines ----------------------------------------------------------------------

const ADMITTING_POLL_MS = 4000

/** Every baseline uploaded into one season: the ones in play, the ones admitted and switched off,
 *  the ones still being admitted and the uploads admission refused — the last so an admin can see
 *  why and upload again. The list is re-read every few seconds while anything is being admitted. */
function BaselinesPanel({ game, season }: { game: string; season: Season }) {
  const closed = season.state === 'closed'
  const list = useKept(`baselines:${game}:${season.slug}`, () => api.seasonBaselines(game, season.slug))
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<SeasonBaseline | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rows = list.data?.baselines ?? []
  const current = rows.filter((b) => b.status !== 'rejected' || !rows.some((o) => o.slug === b.slug && o.version > b.version))
  const on = current.filter((b) => b.enabled).length
  const ready = current.filter((b) => b.status === 'disabled')
  const admitting = current.some((b) => b.status === 'testing')

  const { reload } = list
  useEffect(() => {
    if (!admitting) return
    const t = setTimeout(reload, ADMITTING_POLL_MS)
    return () => clearTimeout(t)
  }, [admitting, list.data, reload])

  const flip = async (b: SeasonBaseline, enabled: boolean) => {
    setBusy(b.slug)
    setError(null)
    try {
      await api.setSeasonBaseline(game, season.slug, b.slug, enabled)
    } catch (err) {
      setError(`${b.name}: ${baselineSaid(err).said}`)
    } finally {
      setBusy(null)
      setConfirming(null)
      list.reload()
    }
  }

  const enableAll = async () => {
    for (const b of ready) await flip(b, true)
  }

  const columns: Column<SeasonBaseline>[] = [
    {
      key: 'name',
      head: <IconLabel icon="i-anchor">Baseline</IconLabel>,
      cell: (b) => (
        <span className="baseline-cell">
          <Link to={`/models/${b.model_id}`}>{b.name}</Link>
          <span className="muted">v{b.version}</span>
        </span>
      ),
    },
    { key: 'class', head: 'Class', cell: (b) => (b.class ? <ClassIcon k={b.class} /> : '—') },
    { key: 'size', head: 'Size', align: 'right', className: 'r-num muted', wideOnly: true, cell: (b) => (b.size_bytes ? bytes(b.size_bytes) : '—') },
    {
      key: 'rating',
      head: <Icon id="i-leaderboard" label="Rating on open" />,
      align: 'right',
      className: 'r-num',
      cell: (b) => (b.rating === null ? '—' : <RatingValue value={b.rating} />),
    },
    { key: 'matches', head: <Icon id="i-matches" label="Matches" />, align: 'right', className: 'r-num muted', wideOnly: true, cell: (b) => (b.matches ? num(b.matches) : '—') },
    {
      key: 'on',
      head: 'In play',
      cell: (b) =>
        b.status === 'testing' ? (
          <Badge tone="wait">Admitting</Badge>
        ) : b.status === 'rejected' ? (
          <span className="refused" title={`Admission refused it: ${b.reject_reason ?? 'no reason given'}`}>
            <Badge tone="bad">Refused</Badge> <code className="muted">{b.reject_reason}</code>
          </span>
        ) : closed ? (
          b.enabled ? 'yes' : 'no'
        ) : (
          <Switch
            checked={b.enabled}
            label={`${b.name} in play`}
            busy={busy !== null}
            onChange={(next) => (next ? void flip(b, true) : setConfirming(b))}
          />
        ),
    },
  ]

  const warn = !closed && list.data !== null && on === 0
  const hasNotes = warn || confirming !== null || error !== null

  return (
    <DeskPanel
      icon="i-anchor"
      title="Baselines"
      end={
        <>
          {list.data ? (
            <span className="num">
              {num(on)} of {num(current.filter((b) => b.status !== 'rejected').length)} in play
            </span>
          ) : null}
          {!closed && ready.length ? (
            <button className="btn sm" type="button" disabled={busy !== null} onClick={() => void enableAll()}>
              Switch all on
            </button>
          ) : null}
        </>
      }
      notes={
        hasNotes ? (
          <>
            {warn ? (
              <Notice tone="warn" title="No baseline is in play.">
                <p>A trial is played against the baselines, so every new version waits until one is switched on.</p>
              </Notice>
            ) : null}
            {confirming ? (
              <Confirm
                what={confirming.name}
                said="Its queued matches are cancelled; running ones finish and count. It leaves the ladder and keeps its rating, and switching it on again puts it back."
                busy={busy !== null}
                onYes={() => void flip(confirming, false)}
                onNo={() => setConfirming(null)}
              />
            ) : null}
            {error ? <p className="form-error">{error}</p> : null}
          </>
        ) : null
      }
      foot={
        closed ? null : (
          <BaselineUpload
            game={game}
            season={season}
            onDone={list.reload}
          />
        )
      }
    >
      {list.error && !list.data ? (
        <InlineError error={list.error} what="The baselines" />
      ) : (
        <DataTable
          state={list.loading ? 'loading' : 'ready'}
          columns={columns}
          rows={rows}
          rowKey={(b) => b.version_id}
          rowClass={(b) => (b.enabled ? undefined : 'off')}
          loadingRows={4}
          empty={closed ? 'This season had no baselines.' : 'No baselines yet. Upload one below: a name and its two files.'}
        />
      )}
    </DeskPanel>
  )
}

type Pair = { onnx: Picked | null; manifest: Picked | null }

/**
 * ONE BASELINE: a name and its two files, hashed here and PUT straight to the object store — the
 * submission's own path, and the same guarantee: each file is read once, and the bytes hashed are
 * the bytes sent. The version is recorded first and uploaded second, so a PUT that fails leaves a
 * version admission will refuse ARTIFACT_MISSING; uploading again under the same name recovers it.
 */
function BaselineUpload({ game, season, onDone }: { game: string; season: Season; onDone: () => void }) {
  const [name, setName] = useState('')
  const [files, setFiles] = useState<Pair>({ onnx: null, manifest: null })
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; text: string; code?: string } | null>(null)
  const hashing = canHashHere()

  const take = async (picked: File[]) => {
    const next: Pair = { ...files }
    for (const f of picked) {
      if (f.name.endsWith('.onnx')) next.onnx = await pickFile(f)
      else if (f.name.endsWith('.json')) next.manifest = await pickFile(f)
    }
    setFiles(next)
    setSaid(null)
  }

  const send = async () => {
    if (!files.onnx || !files.manifest) return
    setBusy(true)
    setSaid(null)
    try {
      const made = await api.addSeasonBaseline(game, season.slug, {
        name: name.trim(),
        weights_hash: files.onnx.hash,
        manifest_hash: files.manifest.hash,
      })
      if (made.upload) {
        await putBytes('model.onnx', made.upload.model_onnx, files.onnx.bytes)
        await putBytes('manifest.json', made.upload.manifest_json, files.manifest.bytes)
      }
      setSaid({ ok: true, text: `${made.name} is uploaded, and admission is checking it. It lands switched off.` })
      setName('')
      setFiles({ onnx: null, manifest: null })
      onDone()
    } catch (err) {
      if (err instanceof UploadFailed) {
        setSaid({ ok: false, text: `${err.which} did not upload: ${err.message}. Upload it again under the same name.` })
        onDone()
      } else {
        const r = baselineSaid(err)
        setSaid({ ok: false, text: r.said, code: r.code })
      }
    } finally {
      setBusy(false)
    }
  }

  if (!hashing) {
    return (
      <p className="muted">
        This browser cannot hash files here (the page is not served over https or localhost), so upload baselines with
        <code> scripts/dev/upload-baselines.sh</code> or the API.
      </p>
    )
  }

  return (
    <div className="stack tight">
      <form
        className={cx('baseline-add', over && 'over')}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (!busy) void take([...e.dataTransfer.files])
        }}
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input
          className="input"
          type="text"
          maxLength={48}
          placeholder="Name: Scout, nano-bc"
          aria-label="Baseline name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="btn sm pick">
          <IconLabel icon="i-plus">Files</IconLabel>
          <input
            className="vis-hidden"
            type="file"
            accept=".onnx,.json"
            multiple
            disabled={busy}
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])]
              e.target.value = ''
              void take(picked)
            }}
          />
        </label>
        <span className="pair" aria-live="polite">
          <FileMark name="model.onnx" file={files.onnx} />
          <FileMark name="manifest.json" file={files.manifest} />
        </span>
        <button className="btn primary sm" type="submit" disabled={busy || !name.trim() || !files.onnx || !files.manifest}>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </form>
      {said ? (
        <p className={said.ok ? 'muted' : 'form-error'}>
          {said.text} {said.code ? <code className="muted">{said.code}</code> : null}
        </p>
      ) : null}
    </div>
  )
}

function FileMark({ name, file }: { name: string; file: Picked | null }) {
  return (
    <span className={cx('filemark', file && 'have')} title={file ? `${file.name} · ${bytes(file.size)} · ${file.hash}` : `${name}: not picked`}>
      <Icon id={file ? 'i-check' : 'i-x'} label={file ? 'picked' : 'missing'} />
      {name}
    </span>
  )
}
