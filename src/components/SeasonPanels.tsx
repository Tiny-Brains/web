// A SEASON'S OWN PANELS, drawn by both desks that run one: the platform's `/admin/seasons` and the
// season admin's `/season-admin`. Its boards and its baselines -- each a list scrolling in its own
// fixed-height panel with its upload, and an import from another season, at the foot -- and the three
// sheets the strip opens: moving a scheduled season's dates, its classes' memory, and asking for its
// close. Both desks call the same routes, which answer a platform admin and the season's own admins
// alike, so one set of panels is one set of refusals, said the same way wherever they are hit.
//
// THE MAPS AND THE BASELINES ARE THE SEASON'S, AND THE TWO THINGS ABOUT IT THAT CHANGE WHILE IT IS
// LIVE. Both are uploaded (or imported), both land SWITCHED OFF, and both are switched on and off
// with no delete: a board is public from its upload and the matches played on it name it; a
// baseline's ratings and matches name its version. A baseline is admitted first, by the same walk
// a competitor's submission takes, so its switch appears once admission has passed it. An imported
// baseline is admitted again, under this season's rules.
//
// Closing is a REQUEST, because it settles every rating and freezes the standings and cannot be
// undone -- so the sheet makes you type the season's slug rather than click a red button by accident.

import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type Season, type SeasonBaseline, type SeasonImport, type SeasonMap } from '../api'
import { useKept } from '../lib/useKept'
import { usePlatform } from '../providers/platform-context'
import { baselineSaid, importSaid, mapSaid, seasonSaid } from '../lib/season-refusals'
import { UploadFailed, canHashHere, pickFile, putBytes, type Picked } from '../lib/upload'
import { bytes, dateInput, dateToIso, num } from '../lib/format'
import { cx } from '../lib/cx'
import {
  Badge, type Column, ConfirmAction, DataTable, Icon, IconLabel, type IconId, Notice, Panel, PanelBody, PanelHead, Select, Switch,
} from './ui'
import { ClassIcon, ClassMemoryFields, RatingValue } from './Model'
import { memoryChanged, memoryDraft, withMemory } from '../lib/weight-classes'
import { InlineError } from './ErrorStates'
import { count, fill } from '../lib/copy'
import T from '../../copy/admin-seasons.json'

/**
 * MOVING A SEASON THAT HAS NOT OPENED YET — the only reversible operation on a season. Only while
 * it is scheduled, and only the two dates: an open season's window is what every competitor has
 * planned around, and its classes and engine are what its standings mean.
 */
export function DatesSheet({ season, game, onDone }: { season: Season; game: string; onDone: () => void }) {
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
          {T.dates.opens}
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
          {T.dates.closes}
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
          {busy ? T.dates.moving : T.dates.move}
        </button>
        <span className="muted">
          {error ? null : saved ? T.dates.moved : T.dates.note}
        </span>
      </form>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  )
}

/**
 * EACH CLASS'S MEMORY, while the season is scheduled: the same guard as its dates, because the
 * update route freezes `weight_classes` once submissions open. The whole table goes back with only
 * the two memory numbers per class changed; the caps are the season's and stay as they are.
 */
export function MemorySheet({ season, game, onDone }: { season: Season; game: string; onDone: () => void }) {
  const [draft, setDraft] = useState(() => memoryDraft(season.weight_classes))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const changed = memoryChanged(season.weight_classes, draft)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.updateSeason(game, season.slug, { weight_classes: withMemory(season.weight_classes, draft) })
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
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <ClassMemoryFields
          classes={season.weight_classes}
          draft={draft}
          onChange={(d) => {
            setDraft(d)
            setSaved(false)
          }}
          id="s-memory"
        />
        <div className="row">
          <button className="btn primary sm" type="submit" disabled={busy || !changed}>
            {busy ? T.memory.saving : T.memory.save}
          </button>
          <span className="muted">{error ? null : saved ? T.memory.saved : T.memory.note}</span>
        </div>
      </form>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  )
}

/** Typing the slug is the confirmation. A destructive action that one mis-click can start is a
 *  destructive action that will eventually happen — and the slug, unlike a button, names the season
 *  it ends. */
export function CloseSheet({ season, game, onDone }: { season: Season; game: string; onDone: () => void }) {
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
            ? fill(T.close.notLive, { season: season.name })
            : err.message
          : T.close.unsent,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="strip-sheet stack">
      <Notice tone="warn" title={fill(T.close.title, { season: season.name })}>
        <p>
          {season.in_flight_versions > 0
            ? fill(T.close.bodyInFlight, { versions: num(season.in_flight_versions) })
            : T.close.body}
        </p>
      </Notice>
      <ConfirmAction word={season.slug} action={busy ? T.close.requesting : fill(T.close.action, { season: season.name })} busy={busy} size="sm" onConfirm={() => void close()} />
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  )
}

// ---- a panel of the desk -----------------------------------------------------------------------

/** One list of the desk: a head, what needs saying, the table scrolling inside the panel's fixed
 *  height, and what adds to it at the foot. */
export function DeskPanel({
  icon,
  title,
  end,
  notes,
  foot,
  children,
}: {
  icon: IconId
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
export function Confirm({ what, said, onYes, onNo, busy }: { what: string; said: ReactNode; onYes: () => void; onNo: () => void; busy: boolean }) {
  return (
    <Notice tone="warn" title={fill(T.confirm.title, { what })}>
      <p>{said}</p>
      <div className="row">
        <button className="btn sm danger" type="button" disabled={busy} onClick={onYes}>
          {T.confirm.yes}
        </button>
        <button className="btn sm" type="button" onClick={onNo}>
          {T.confirm.no}
        </button>
      </div>
    </Notice>
  )
}

// ---- the season's maps ----------------------------------------------------------------------------

/** Every board of one season, and a switch each. A closed season's list is its record: no switch,
 *  no upload. */
export function MapsPanel({ game, season }: { game: string; season: Season }) {
  const closed = season.state === 'closed'
  // A private season's boards are read through the member's route: the public one answers 404.
  const priv = usePlatform().priv(season.slug)
  const list = useKept(`maps:${game}:${season.slug}:${priv}`, () => api.seasonMaps(game, season.slug, { priv }))
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
      head: <IconLabel icon="i-map">{T.maps.head.map}</IconLabel>,
      cell: (m) => (
        <Link className="mono" to={`/maps?season=${season.slug}#${m.map_id}`}>
          {m.map_id}
        </Link>
      ),
    },
    { key: 'seats', head: <Icon id="i-seats" label={T.maps.head.seats} />, align: 'right', className: 'r-num', cell: (m) => m.players },
    { key: 'size', head: T.maps.head.size, align: 'right', className: 'r-num mono', wideOnly: true, cell: (m) => `${m.rows}×${m.cols}` },
    { key: 'matches', head: <Icon id="i-matches" label={T.maps.head.matches} />, align: 'right', className: 'r-num muted', wideOnly: true, cell: (m) => (m.matches ? num(m.matches) : '—') },
    {
      key: 'on',
      head: T.maps.head.inPlay,
      cell: (m) =>
        closed ? (
          m.enabled ? T.maps.yes : T.maps.no
        ) : (
          <Switch
            checked={m.enabled}
            label={fill(T.maps.switch, { map: m.map_id })}
            busy={busy !== null}
            onChange={(next) => (next ? void flip(m.map_id, true) : setConfirming(m.map_id))}
          />
        ),
    },
  ]

  const notes = (
    <>
      {!closed && list.data && on === 0 ? (
        <Notice tone="warn" title={T.maps.noneInPlay.title}>
          <p>{T.maps.noneInPlay.body}</p>
        </Notice>
      ) : null}
      {confirming ? (
        <Confirm
          what={confirming}
          said={T.maps.confirm}
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
      title={T.maps.title}
      end={
        <>
          {list.data ? (
            <span className="num">
              {fill(T.maps.count, { on: num(on), total: num(maps.length) })}
            </span>
          ) : null}
          {!closed && off.length ? (
            <button className="btn sm" type="button" disabled={busy !== null} onClick={() => void enableAll()}>
              {T.maps.switchAllOn}
            </button>
          ) : null}
        </>
      }
      notes={hasNotes ? notes : null}
      foot={
        closed ? null : (
          <div className="stack tight">
            <MapUpload game={game} season={season} onDone={list.reload} />
            <ImportFrom
              season={season}
              what="maps"
              run={(from) => api.importSeasonMaps(game, season.slug, { from })}
              onDone={list.reload}
            />
          </div>
        )
      }
    >
      {list.error && !list.data ? (
        <InlineError error={list.error} what={T.maps.what} />
      ) : (
        <DataTable
          state={list.loading ? 'loading' : 'ready'}
          columns={columns}
          rows={maps}
          rowKey={(m) => m.map_id}
          rowClass={(m) => (m.enabled ? undefined : 'off')}
          loadingRows={6}
          empty={closed ? T.maps.emptyClosed : T.maps.empty}
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
        out.push({ file: f.name, ok: false, code: 'not_json', said: T.mapUpload.notJson })
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
        <b>{busy ? fill(T.mapUpload.uploading, { n: results.length + 1 }) : T.mapUpload.drop}</b>
        <span className="muted">{T.mapUpload.or}</span>
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
              <Icon id={r.ok ? 'i-check' : 'i-alert'} label={r.ok ? T.mapUpload.added : T.mapUpload.refused} />
              <span className="mono">{r.ok ? r.map.map_id : r.file}</span>
              {r.ok ? (
                <span className="muted">
                  {fill(T.mapUpload.board, { players: r.map.players, rows: r.map.rows, cols: r.map.cols })}
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
      {added && !busy ? <p className="muted">{fill(T.mapUpload.done, { n: num(added) })}</p> : null}
    </div>
  )
}

// ---- the season's baselines ----------------------------------------------------------------------

const ADMITTING_POLL_MS = 4000

/** Every baseline uploaded into one season: the ones in play, the ones admitted and switched off,
 *  the ones still being admitted and the uploads admission refused — the last so an admin can see
 *  why and upload again. The list is re-read every few seconds while anything is being admitted. */
export function BaselinesPanel({ game, season }: { game: string; season: Season }) {
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
      head: <IconLabel icon="i-anchor">{T.baselines.head.baseline}</IconLabel>,
      cell: (b) => (
        <span className="baseline-cell">
          <Link to={`/models/${b.model_id}`} title={b.name}>
            {b.name}
          </Link>
          <span className="muted">v{b.version}</span>
          {/* Its profile, where its record across seasons is: a baseline is an account of its own. */}
          <Link className="baseline-profile" to={`/profile/${b.handle}`}>
            <Icon id="i-user" label={fill(T.baselines.profile, { name: b.name, handle: b.handle })} />
          </Link>
        </span>
      ),
    },
    { key: 'class', head: T.baselines.head.class, cell: (b) => (b.class ? <ClassIcon k={b.class} /> : '—') },
    { key: 'size', head: T.baselines.head.size, align: 'right', className: 'r-num muted', wideOnly: true, cell: (b) => (b.size_bytes ? bytes(b.size_bytes) : '—') },
    {
      key: 'rating',
      head: <Icon id="i-leaderboard" label={T.baselines.head.rating} />,
      align: 'right',
      className: 'r-num',
      cell: (b) => (b.rating === null ? '—' : <RatingValue value={b.rating} />),
    },
    { key: 'matches', head: <Icon id="i-matches" label={T.baselines.head.matches} />, align: 'right', className: 'r-num muted', wideOnly: true, cell: (b) => (b.matches ? num(b.matches) : '—') },
    {
      key: 'on',
      head: T.baselines.head.inPlay,
      cell: (b) =>
        b.status === 'testing' ? (
          <Badge tone="wait">{T.baselines.admitting}</Badge>
        ) : b.status === 'rejected' ? (
          <span
            className="refused"
            title={b.reject_reason != null ? fill(T.baselines.refusedTitle, { reason: b.reject_reason }) : T.baselines.refusedTitleNoReason}
          >
            <Badge tone="bad">{T.baselines.refused}</Badge> <code className="muted">{b.reject_reason}</code>
          </span>
        ) : closed ? (
          b.enabled ? T.baselines.yes : T.baselines.no
        ) : (
          <Switch
            checked={b.enabled}
            label={fill(T.baselines.switch, { name: b.name })}
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
      title={T.baselines.title}
      end={
        <>
          {list.data ? (
            <span className="num">
              {fill(T.baselines.count, { on: num(on), total: num(current.filter((b) => b.status !== 'rejected').length) })}
            </span>
          ) : null}
          {!closed && ready.length ? (
            <button className="btn sm" type="button" disabled={busy !== null} onClick={() => void enableAll()}>
              {T.baselines.switchAllOn}
            </button>
          ) : null}
        </>
      }
      notes={
        hasNotes ? (
          <>
            {warn ? (
              <Notice tone="warn" title={T.baselines.noneInPlay.title}>
                <p>{T.baselines.noneInPlay.body}</p>
              </Notice>
            ) : null}
            {confirming ? (
              <Confirm
                what={confirming.name}
                said={T.baselines.confirm}
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
          <div className="stack tight">
            <BaselineUpload game={game} season={season} onDone={list.reload} />
            <ImportFrom
              season={season}
              what="baselines"
              run={(from) => api.importSeasonBaselines(game, season.slug, { from })}
              onDone={list.reload}
            />
          </div>
        )
      }
    >
      {list.error && !list.data ? (
        <InlineError error={list.error} what={T.baselines.what} />
      ) : (
        <DataTable
          state={list.loading ? 'loading' : 'ready'}
          columns={columns}
          rows={rows}
          rowKey={(b) => b.version_id}
          rowClass={(b) => (b.enabled ? undefined : 'off')}
          loadingRows={4}
          empty={closed ? T.baselines.emptyClosed : T.baselines.empty}
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
      setSaid({ ok: true, text: fill(T.baselineUpload.uploaded, { name: made.name }) })
      setName('')
      setFiles({ onnx: null, manifest: null })
      onDone()
    } catch (err) {
      if (err instanceof UploadFailed) {
        setSaid({ ok: false, text: fill(T.baselineUpload.failed, { file: err.which, reason: err.message }) })
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
        {T.baselineUpload.noHashing}
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
          placeholder={T.baselineUpload.name}
          aria-label={T.baselineUpload.nameLabel}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="btn sm pick">
          <IconLabel icon="i-plus">{T.baselineUpload.files}</IconLabel>
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
          {busy ? T.baselineUpload.uploading : T.baselineUpload.upload}
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
    <span className={cx('filemark', file && 'have')} title={file ? `${file.name} · ${bytes(file.size)} · ${file.hash}` : fill(T.baselineUpload.notPicked, { name })}>
      <Icon id={file ? 'i-check' : 'i-x'} label={file ? T.baselineUpload.picked : T.baselineUpload.missing} />
      {name}
    </span>
  )
}

// ---- importing from another season ----------------------------------------------------------------

/** Another season's boards or baselines, brought in whole: boards land switched off, and baselines
 *  are admitted again under this season's rules before they can be switched on. The sources are the
 *  seasons this viewer can see, which is exactly what the route will take. */
function ImportFrom({
  season,
  what,
  run,
  onDone,
}: {
  season: Season
  what: 'maps' | 'baselines'
  run: (from: string) => Promise<SeasonImport>
  onDone: () => void
}) {
  const { seasons } = usePlatform()
  const [from, setFrom] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; text: string; code?: string } | null>(null)
  const sources = seasons.filter((s) => s.slug !== season.slug)
  if (sources.length === 0) return null
  const I = T.import
  const name = (slug: string) => sources.find((s) => s.slug === slug)?.name ?? slug

  const go = async () => {
    if (!from) return
    setBusy(true)
    setSaid(null)
    try {
      const r = await run(from)
      const done = what === 'maps' ? I.mapsDone : I.baselinesDone
      const none = what === 'maps' ? I.mapsNone : I.baselinesNone
      setSaid({ ok: true, text: r.imported > 0 ? count(done, r.imported, { n: num(r.imported), season: name(r.from) }) : fill(none, { season: name(r.from) }) })
      onDone()
    } catch (err) {
      const r = importSaid(err)
      setSaid({ ok: false, text: fill(r.said, { season: name(from) }), code: r.code })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack tight">
      <div className="import-row">
        <Select
          label={what === 'maps' ? I.labelMaps : I.labelBaselines}
          value={from}
          options={[
            { value: '', label: what === 'maps' ? I.pickMaps : I.pickBaselines },
            ...sources.map((s) => ({ value: s.slug, label: s.name, hint: s.state })),
          ]}
          onChange={(v) => {
            setFrom(v)
            setSaid(null)
          }}
        />
        <button className="btn sm" type="button" disabled={!from || busy} onClick={() => void go()}>
          {busy ? I.importing : I.action}
        </button>
      </div>
      {said ? (
        <p className={said.ok ? 'muted' : 'form-error'} aria-live="polite">
          {said.text} {said.code ? <code className="muted">{said.code}</code> : null}
        </p>
      ) : null}
    </div>
  )
}
