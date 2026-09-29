// `/admin/seasons/rounds` — admin session only, reached from the season desk's strip.
//
// A SEASON'S FAIRNESS CONTROLS, one season at a time (the switcher's): the finals, the score
// resets, and the idle fill. A desk like /admin/seasons: a strip that says where the season stands
// (its round, the next reset counting down, the capacity every number here is chosen against),
// then the finals on the left and the resets and the fill on the right.
//
// THE FINALS ARE THE ADMIN'S. Once submissions close and nothing is still being admitted, the
// admin gives the numbers -- matches each, the start, the countdown's lead, the sigma floor and the
// mu shrink -- and Soma does the rest: the countdown across the site, the reset at the start, the
// same number of matches for every entry, and the close once all have played them. While they run
// the admin can change the number for everyone or end the season now.
//
// Every write answers the whole rounds document, but the page re-reads it rather than splicing, and
// polls while something is waiting or running, so the progress moves without a reload.

import { useEffect, useState } from 'react'
import { ApiError, api, type FleetSide, type RoundBody, type RoundEdit, type Season, type SeasonRound, type SeasonRounds } from '../api'
import { usePlatform } from '../providers/platform-context'
import { useSession } from '../providers/session-context'
import { useSelection } from '../lib/selection'
import { useKept } from '../lib/useKept'
import { dateTime, duration, num, rating as fmtRating } from '../lib/format'
import { count, fill, lookup } from '../lib/copy'
import { cx } from '../lib/cx'
import { Shell } from '../components/Shell'
import {
  Badge, type Column, ConfirmAction, Countdown, DataTable, Field, Icon, IconLabel, Loading, Notice, PageHeader, Panel,
  PanelBody, PanelHead, Rich, Select, StatGrid, Switch,
} from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { SeasonBadge } from '../components/Model'
import { AdminGate, InlineError } from '../components/ErrorStates'
import T from '../../copy/admin-season-rounds.json'
import common from '../../copy/common.json'

const POLL_MS = 10_000

export default function SeasonRoundsAdmin() {
  const { me, session } = useSession()
  if (session.state === 'loading') {
    return (
      <Shell title={T.tab}>
        <section className="wrap page-body">
          <Loading rows={3} label={common.site.checkingSession} />
        </section>
      </Shell>
    )
  }
  // A courtesy: Soma answers 403 to a non-admin whatever this page renders.
  if (!me || me.role !== 'admin') {
    return (
      <Shell title={T.tab}>
        <AdminGate signedIn={Boolean(me)} />
      </Shell>
    )
  }
  return <Desk />
}

/** Why a write was refused, as a sentence. */
function said(err: unknown): string {
  if (!(err instanceof ApiError)) return T.refusals.unsent
  return lookup(T.refusals.said, err.code) ?? err.message
}

/** A number field's text as a number, or null when it is empty. */
const numberOr = (v: string): number | null => (v.trim() === '' ? null : Number(v))

/** A datetime-local value (the admin's own clock) as an instant, or null when it is empty. */
const instantOr = (v: string): string | null => (v ? new Date(v).toISOString() : null)

/** An instant as a datetime-local value, in the admin's own clock. */
const localInput = (iso: string) => {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function Desk() {
  const { slug: game, gameName, season, seasons, seasonsLoading, reload: reloadSeasons } = usePlatform()
  const { href } = useSelection()
  const doc = useKept(`rounds:${game}:${season?.slug ?? ''}`, () =>
    season ? api.seasonRounds(game, season.slug) : Promise.resolve(null),
  )

  // Poll while something moves on its own: a round waiting to start, or the finals running.
  const d = doc.data
  const moving = d !== null && d.state !== 'closed' && (d.rounds.some((r) => !r.applied_at && !r.cancelled_at) || (d.finals?.started ?? false))
  const { reload } = doc
  useEffect(() => {
    if (!moving) return
    const t = setTimeout(reload, POLL_MS)
    return () => clearTimeout(t)
  }, [moving, d, reload])

  const changed = () => {
    reload()
    reloadSeasons()
  }
  // THE STRIP'S SHEET: scheduling a reset, or changing a waiting round (its number). The desk is a
  // fixed height, so a form opens under the strip, as the season desk's do, not inside a list.
  const [sheet, setSheet] = useState<'reset' | number | null>(null)

  return (
    <Shell title={T.tab} scoped>
      <PageHeader
        crumbs={[
          { label: common.admin.crumb, to: '/admin/seasons' },
          { label: T.header.back, to: href('/admin/seasons') },
          { label: T.header.crumb },
        ]}
        title={T.header.title}
        badges={<Badge tone="info">{common.admin.badge}</Badge>}
      >
        <AdminTabs current="seasons" />
      </PageHeader>
      <div className="wrap page-body">
        {season === null ? (
          seasonsLoading ? (
            <Loading rows={4} label={T.loading} />
          ) : (
            <Notice tone="info" title={fill(T.none.title, { game: gameName })}>
              <p>
                <Rich text={T.none.body} />
              </p>
            </Notice>
          )
        ) : doc.error && !d ? (
          <InlineError error={doc.error} what={T.finals.what} />
        ) : !d ? (
          <Loading rows={4} label={T.loading} />
        ) : (
          <div className="desk rounds-desk">
            <Strip season={season} seasons={seasons} doc={d} game={game} sheet={sheet} onSheet={setSheet} onDone={changed} />
            <div className="desk-lists">
              {/* Keyed by the saved finals too, and for the same reason as the fill below. This desk
                  re-polls every 10 s while a round is waiting or the finals are running, and both
                  finals forms seed their state ONCE from `round`: keyed only on the slug they never
                  remounted, so a poll that brought another admin's change left the form holding the
                  old values while `editOf(draft, round)` compared them against the new ones. Save
                  un-disabled itself with nobody typing, and one click PATCHed the stale values back
                  over a live season's fairness controls. */}
              <FinalsPanel
                key={`finals-${season.slug}-${JSON.stringify(d.rounds.find((r) => r.kind === 'finals' && !r.cancelled_at) ?? null)}`}
                game={game}
                season={season}
                doc={d}
                onDone={changed}
              />
              <div className="rounds-side">
                <RoundsPanel key={`rounds-${season.slug}`} game={game} doc={d} sheet={sheet} onSheet={setSheet} onDone={changed} />
                {/* Keyed by what is saved, so a save or another admin's change resets the form to it. */}
                <FillPanel key={`fill-${season.slug}-${JSON.stringify(d.fill)}`} game={game} doc={d} onDone={reload} />
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}

// ---- where it stands ----------------------------------------------------------------------------

function Strip({
  season, seasons, doc, game, sheet, onSheet, onDone,
}: {
  season: Season
  seasons: Season[]
  doc: SeasonRounds
  game: string
  sheet: 'reset' | number | null
  onSheet: (s: 'reset' | number | null) => void
  onDone: () => void
}) {
  const { setSeason } = useSelection()
  const editing = typeof sheet === 'number' ? (doc.rounds.find((r) => r.n === sheet && !r.applied_at && !r.cancelled_at) ?? null) : null
  const done = () => {
    onSheet(null)
    onDone()
  }
  const current = doc.rounds.find((r) => r.current) ?? null
  const waiting = doc.rounds.find((r) => !r.applied_at && !r.cancelled_at) ?? null
  const c = doc.capacity
  return (
    <Panel className="desk-strip">
      <div className="strip-row">
        <Select
          look="pick"
          prefix={T.strip.season}
          label={T.strip.season}
          value={season.slug}
          options={seasons.map((s) => ({ value: s.slug, label: s.name, hint: s.state === 'closed' ? T.strip.final : s.state }))}
          onChange={(slug) => setSeason(slug)}
        />
        <SeasonBadge state={season.state} />
        <span className="strip-fact">{T.strip.policy[doc.policy]}</span>
        {current ? (
          <Badge tone={current.kind === 'finals' ? 'ok' : 'info'}>
            {current.kind === 'finals' ? T.strip.finals : fill(T.strip.round, { n: current.n })}
          </Badge>
        ) : (
          <span className="strip-fact">{T.strip.noRound}</span>
        )}
        {waiting ? (
          <Badge tone="wait">
            {waiting.kind === 'finals' ? T.strip.nextFinals : T.strip.next} <Countdown at={waiting.starts_at} />
          </Badge>
        ) : null}
        <div className="strip-actions">
          <span className="strip-fact" title={T.strip.lanes}>
            <Icon id="i-server" label={T.strip.lanes} />
            {num(c.lanes)}
          </span>
          <span className="strip-fact" title={T.strip.playing}>
            <Icon id="i-play" label={T.strip.playing} />
            {num(c.playing)}
          </span>
          <span className="strip-fact" title={T.strip.queued}>
            <Icon id="i-list" label={T.strip.queued} />
            {num(c.queued)}
          </span>
          <span className="strip-fact" title={T.strip.perHour}>
            <Icon id="i-clock" label={T.strip.perHour} />
            {c.per_hour === null ? T.strip.noPace : fill(T.strip.perHourValue, { n: num(c.per_hour) })}
          </span>
        </div>
      </div>
      {sheet === 'reset' ? (
        <div className="strip-sheet">
          <ResetForm game={game} doc={doc} onDone={done} onClose={() => onSheet(null)} />
        </div>
      ) : editing ? (
        <div className="strip-sheet">
          <RoundEditor key={editing.n} game={game} slug={doc.season} round={editing} onDone={done} onClose={() => onSheet(null)} />
        </div>
      ) : null}
    </Panel>
  )
}

// ---- the numbers of a round ---------------------------------------------------------------------

type Draft = { games: string; starts: string; warn: string; sigma: string; shrink: string }

const draftOf = (r: SeasonRound | null, games: number): Draft =>
  r
    ? {
        games: String(r.games),
        starts: localInput(r.starts_at),
        warn: String(r.warn_minutes),
        sigma: r.sigma_floor === null ? '' : String(r.sigma_floor),
        shrink: String(r.mu_shrink),
      }
    : { games: String(games), starts: '', warn: '15', sigma: '4', shrink: '0' }

/** The five numbers a reset or the finals take. `only` narrows it to the matches each, for a round
 *  that has started. */
function RoundFields({ draft, onChange, only, id }: { draft: Draft; onChange: (d: Draft) => void; only?: boolean; id: string }) {
  const F = T.finals.form
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => onChange({ ...draft, [k]: e.target.value })
  return (
    <div className="round-fields">
      <Field label={F.games} htmlFor={`${id}-games`} hint={F.gamesHint}>
        <input id={`${id}-games`} className="input mono" type="number" min={1} max={100000} step={1} required value={draft.games} onChange={set('games')} />
      </Field>
      {only ? null : (
        <>
          <Field label={F.starts} htmlFor={`${id}-starts`} hint={F.startsHint}>
            <input id={`${id}-starts`} className="input mono" type="datetime-local" value={draft.starts} onChange={set('starts')} />
          </Field>
          <Field label={F.warn} htmlFor={`${id}-warn`} hint={F.warnHint}>
            <input id={`${id}-warn`} className="input mono" type="number" min={0} max={1440} step={1} value={draft.warn} onChange={set('warn')} />
          </Field>
          <Field label={F.sigma} htmlFor={`${id}-sigma`} hint={F.sigmaHint}>
            <input id={`${id}-sigma`} className="input mono" type="number" min={0} max={1000} step="any" value={draft.sigma} onChange={set('sigma')} />
          </Field>
          <Field label={F.shrink} htmlFor={`${id}-shrink`} hint={F.shrinkHint}>
            <input id={`${id}-shrink`} className="input mono" type="number" min={0} max={1} step="any" value={draft.shrink} onChange={set('shrink')} />
          </Field>
        </>
      )}
    </div>
  )
}

const bodyOf = (kind: RoundBody['kind'], d: Draft): RoundBody => ({
  kind,
  games: Number(d.games),
  starts_at: instantOr(d.starts),
  warn_minutes: numberOr(d.warn),
  sigma_floor: numberOr(d.sigma),
  mu_shrink: numberOr(d.shrink),
})

const editOf = (d: Draft, was: SeasonRound): RoundEdit => {
  const e: RoundEdit = {}
  if (Number(d.games) !== was.games) e.games = Number(d.games)
  const starts = instantOr(d.starts)
  if (starts !== null && d.starts !== localInput(was.starts_at)) e.starts_at = starts
  const warn = numberOr(d.warn)
  if (warn !== null && warn !== was.warn_minutes) e.warn_minutes = warn
  const sigma = numberOr(d.sigma)
  if (sigma !== null && sigma !== was.sigma_floor) e.sigma_floor = sigma
  const shrink = numberOr(d.shrink)
  if (shrink !== null && shrink !== was.mu_shrink) e.mu_shrink = shrink
  return e
}

/** One write, its busy flag, and what it said. */
function useWrite(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const run = async (write: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    setOk(false)
    try {
      await write()
      setOk(true)
      onDone()
    } catch (err) {
      setError(said(err))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, ok, run, clear: () => setOk(false) }
}

// ---- the finals ---------------------------------------------------------------------------------

function FinalsPanel({ game, season, doc, onDone }: { game: string; season: Season; doc: SeasonRounds; onDone: () => void }) {
  const F = T.finals
  const round = doc.rounds.find((r) => r.kind === 'finals' && !r.cancelled_at) ?? null
  const entries = doc.versions.filter((v) => !v.baseline).length
  const closed = doc.state === 'closed'

  const columns: Column<SeasonRounds['versions'][number]>[] = [
    {
      key: 'model',
      head: F.head.model,
      cell: (v) => (
        <span className="who">
          <span>{v.model}</span>
          <small className="muted">{v.baseline ? F.baseline : `@${v.owner}`}</small>
        </span>
      ),
    },
    {
      key: 'games',
      head: <Icon id="i-matches" label={F.head.games} />,
      align: 'right',
      className: 'r-num',
      cell: (v) => {
        const quota = doc.rounds.find((r) => r.current)?.games ?? null
        return quota !== null && !v.baseline ? (
          <span className={cx(v.games >= quota && 'ok-num')}>{fill(F.gamesOf, { n: num(v.games), of: num(quota) })}</span>
        ) : (
          num(v.games)
        )
      },
    },
    { key: 'flight', head: <Icon id="i-play" label={F.head.inFlight} />, align: 'right', className: 'r-num muted', cell: (v) => (v.in_flight ? num(v.in_flight) : '—') },
    { key: 'season', head: F.head.season, align: 'right', className: 'r-num muted', wideOnly: true, cell: (v) => num(v.season_games) },
    { key: 'rating', head: <Icon id="i-leaderboard" label={F.head.rating} />, align: 'right', className: 'r-num', wideOnly: true, cell: (v) => (v.rating === null ? '—' : fmtRating(v.rating)) },
  ]

  return (
    <Panel className="fill">
      <PanelHead icon="i-trophy" title={F.title} />
      <PanelBody className="stack fill-notes">
        {closed ? (
          <p className="muted">{F.closed}</p>
        ) : round === null ? (
          <FinalsForm game={game} season={season} doc={doc} entries={entries} onDone={onDone} />
        ) : round.applied_at === null ? (
          <FinalsWaiting game={game} season={season} round={round} onDone={onDone} />
        ) : (
          <FinalsRunning game={game} season={season} doc={doc} round={round} onDone={onDone} />
        )}
      </PanelBody>
      <div className="fill-scroll">
        <DataTable state="ready" columns={columns} rows={doc.versions} rowKey={(v) => v.version_id} rowClass={(v) => (v.baseline ? 'off' : undefined)} empty={F.empty} />
      </div>
    </Panel>
  )
}

/** No finals yet: why they cannot start, or the form that starts them. */
function FinalsForm({ game, season, doc, entries, onDone }: { game: string; season: Season; doc: SeasonRounds; entries: number; onDone: () => void }) {
  const F = T.finals
  const [draft, setDraft] = useState<Draft>(() => draftOf(null, doc.rules?.games ?? 100))
  const w = useWrite(onDone)
  const open = doc.state === 'open' || doc.state === 'scheduled'
  const blocked = open || doc.admitting > 0

  const matches = Math.ceil((entries * Math.max(0, Number(draft.games) || 0)) / 2)
  const hours = doc.capacity.per_hour ? (matches / doc.capacity.per_hour) * 3600 : null

  return (
    <>
      <p className="muted">{F.intro}</p>
      {open ? (
        <Notice tone="info" title={F.windowOpen.title}>
          <p>
            <Rich text={F.windowOpen.body} vars={{ when: <Countdown at={doc.submissions_close_at} /> }} />
          </p>
        </Notice>
      ) : null}
      {doc.admitting > 0 ? (
        <Notice tone="warn">
          <p>{count(F.admitting, doc.admitting, { n: num(doc.admitting) })}</p>
        </Notice>
      ) : null}
      {blocked ? null : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            void w.run(() => api.addSeasonRound(game, season.slug, bodyOf('finals', draft)))
          }}
        >
          <RoundFields draft={draft} onChange={setDraft} id="finals" />
          <p className="muted">
            {hours === null ? fill(F.form.estimateNoPace, { matches: num(matches) }) : fill(F.form.estimate, { matches: num(matches), time: duration(hours) })}
          </p>
          <div className="row">
            <button className="btn primary" type="submit" disabled={w.busy || !(Number(draft.games) >= 1)}>
              <IconLabel icon="i-trophy">{w.busy ? F.form.scheduling : F.form.schedule}</IconLabel>
            </button>
          </div>
          {w.error ? <p className="form-error">{w.error}</p> : null}
        </form>
      )}
    </>
  )
}

/** Scheduled and counting down: its numbers, changeable, and a cancel. */
function FinalsWaiting({ game, season, round, onDone }: { game: string; season: Season; round: SeasonRound; onDone: () => void }) {
  const F = T.finals
  const [draft, setDraft] = useState<Draft>(() => draftOf(round, round.games))
  const [asking, setAsking] = useState(false)
  const w = useWrite(onDone)
  const edit = editOf(draft, round)

  return (
    <>
      <Notice tone="info" title={<Rich text={F.waiting} vars={{ when: <Countdown at={round.starts_at} /> }} />}>
        <p className="muted">{dateTime(round.starts_at)}</p>
      </Notice>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void w.run(() => api.updateSeasonRound(game, season.slug, round.n, edit))
        }}
      >
        <RoundFields
          draft={draft}
          onChange={(d) => {
            setDraft(d)
            w.clear()
          }}
          id="finals-edit"
        />
        <div className="row">
          <button className="btn primary sm" type="submit" disabled={w.busy || Object.keys(edit).length === 0}>
            {w.busy ? F.form.saving : F.form.save}
          </button>
          <button className="btn sm danger" type="button" disabled={w.busy} onClick={() => setAsking(true)}>
            {F.cancel}
          </button>
          {w.ok ? <span className="muted">{F.form.saved}</span> : null}
        </div>
      </form>
      {asking ? (
        <Notice tone="warn" title={F.cancel}>
          <p>{F.cancelSaid}</p>
          <div className="row">
            <button
              className="btn sm danger"
              type="button"
              disabled={w.busy}
              onClick={() => void w.run(() => api.updateSeasonRound(game, season.slug, round.n, { cancel: true })).then(() => setAsking(false))}
            >
              {w.busy ? F.cancelling : F.cancel}
            </button>
            <button className="btn sm" type="button" onClick={() => setAsking(false)}>
              {F.keep}
            </button>
          </div>
        </Notice>
      ) : null}
      {w.error ? <p className="form-error">{w.error}</p> : null}
    </>
  )
}

/** Running: how far along, the matches each changeable for everyone, and the season ended now. */
function FinalsRunning({ game, season, doc, round, onDone }: { game: string; season: Season; doc: SeasonRounds; round: SeasonRound; onDone: () => void }) {
  const F = T.finals
  const f = doc.finals
  const [games, setGames] = useState(String(round.games))
  const [ending, setEnding] = useState(false)
  const w = useWrite(onDone)
  const end = useWrite(onDone)
  const done = f?.done ?? false
  const share = f && f.entries > 0 ? f.complete / f.entries : 0

  return (
    <>
      <StatGrid
        items={[
          { label: F.facts.games, value: num(round.games), icon: 'i-matches' },
          { label: F.facts.complete, value: f ? `${num(f.complete)} / ${num(f.entries)}` : '—', icon: 'i-check' },
          { label: F.facts.sigma, value: round.sigma_floor === null ? F.facts.none : String(round.sigma_floor) },
          { label: F.facts.shrink, value: String(round.mu_shrink) },
        ]}
      />
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={f?.entries ?? 0} aria-valuenow={f?.complete ?? 0} aria-label={f ? fill(F.progress, { done: num(f.complete), of: num(f.entries), games: num(round.games) }) : F.title}>
        <span style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      {done ? (
        <Notice tone="ok" title={F.done.title}>
          <p>{F.done.body}</p>
        </Notice>
      ) : null}
      {doc.state === 'closed' || doc.close_requested_at ? null : (
        <>
          <form
            className="strip-form"
            onSubmit={(e) => {
              e.preventDefault()
              void w.run(() => api.updateSeasonRound(game, season.slug, round.n, { games: Number(games) }))
            }}
          >
            <label>
              {F.games}
              <input className="input mono" type="number" min={1} max={100000} step={1} value={games} onChange={(e) => setGames(e.target.value)} />
            </label>
            <button className="btn primary sm" type="submit" disabled={w.busy || Number(games) === round.games || !(Number(games) >= 1)}>
              {w.busy ? F.form.saving : F.form.save}
            </button>
            <span className="muted">{w.ok ? F.form.saved : F.gamesSaid}</span>
          </form>
          {w.error ? <p className="form-error">{w.error}</p> : null}
          {ending ? (
            <>
              <Notice tone="warn" title={fill(F.end.title, { season: season.name })}>
                <p>{F.end.body}</p>
              </Notice>
              <ConfirmAction
                word={season.slug}
                action={end.busy ? F.end.requesting : fill(F.end.action, { season: season.name })}
                busy={end.busy}
                size="sm"
                onConfirm={() => void end.run(() => api.closeSeason(game, season.slug))}
              />
              {end.error ? <p className="form-error">{end.error}</p> : null}
            </>
          ) : (
            <div className="row">
              <button className="btn sm danger" type="button" onClick={() => setEnding(true)}>
                {F.end.open}
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}

// ---- the resets ---------------------------------------------------------------------------------

function RoundsPanel({
  game, doc, sheet, onSheet, onDone,
}: {
  game: string
  doc: SeasonRounds
  sheet: 'reset' | number | null
  onSheet: (s: 'reset' | number | null) => void
  onDone: () => void
}) {
  const R = T.rounds
  const [cancelling, setCancelling] = useState<number | null>(null)
  const w = useWrite(onDone)
  const waiting = doc.rounds.find((r) => !r.applied_at && !r.cancelled_at) ?? null
  const finals = doc.rounds.some((r) => r.kind === 'finals' && !r.cancelled_at)
  const closed = doc.state === 'closed'

  const stateOf = (r: SeasonRound) =>
    r.cancelled_at ? 'cancelled' : !r.applied_at ? 'waiting' : r.current ? 'current' : 'done'
  const TONE = { waiting: 'wait', current: 'ok', done: 'off', cancelled: 'off' } as const

  const columns: Column<SeasonRound>[] = [
    { key: 'n', head: R.head.n, cell: (r) => (r.kind === 'finals' ? R.kind.finals : fill(R.kind.round, { n: r.n })) },
    {
      key: 'starts',
      head: <Icon id="i-calendar" label={R.head.starts} />,
      className: 'muted',
      cell: (r) => (!r.applied_at && !r.cancelled_at ? <Countdown at={r.starts_at} /> : <span title={dateTime(r.starts_at)}>{dateTime(r.applied_at ?? r.starts_at)}</span>),
    },
    { key: 'games', head: <Icon id="i-matches" label={R.head.games} />, align: 'right', className: 'r-num', cell: (r) => num(r.games) },
    {
      key: 'reset',
      head: R.head.reset,
      className: 'mono muted',
      wideOnly: true,
      cell: (r) => (r.sigma_floor === null ? fill(R.resetNone, { shrink: r.mu_shrink }) : fill(R.reset, { sigma: r.sigma_floor, shrink: r.mu_shrink })),
    },
    {
      key: 'state',
      head: R.head.state,
      cell: (r) => {
        const s = stateOf(r)
        return s === 'waiting' && !closed ? (
          <span className="row tight">
            <button className={cx('btn sm', sheet === r.n && 'on')} type="button" onClick={() => onSheet(sheet === r.n ? null : r.n)}>
              {R.move}
            </button>
            <button className="btn sm danger" type="button" onClick={() => setCancelling(r.n)}>
              {R.cancel}
            </button>
          </span>
        ) : (
          <Badge tone={TONE[s]}>{R.state[s]}</Badge>
        )
      },
    },
  ]


  return (
    <Panel className="fill">
      <PanelHead
        icon="i-calendar"
        title={R.title}
        end={<span className="muted">{doc.rules?.enabled ? fill(R.weekly, { days: doc.rules.days ?? 7, games: num(doc.rules.games ?? 100) }) : R.manual}</span>}
      />
      {cancelling !== null || w.error ? (
        <PanelBody className="stack fill-notes">
          {cancelling !== null ? (
            <Notice tone="warn" title={fill(R.cancelTitle, { n: cancelling })}>
              <p>{R.cancelSaid}</p>
              <div className="row">
                <button
                  className="btn sm danger"
                  type="button"
                  disabled={w.busy}
                  onClick={() => void w.run(() => api.updateSeasonRound(game, doc.season, cancelling, { cancel: true })).then(() => setCancelling(null))}
                >
                  {R.cancel}
                </button>
                <button className="btn sm" type="button" onClick={() => setCancelling(null)}>
                  {R.keep}
                </button>
              </div>
            </Notice>
          ) : null}
          {w.error ? <p className="form-error">{w.error}</p> : null}
        </PanelBody>
      ) : null}
      <div className="fill-scroll">
        <DataTable state="ready" columns={columns} rows={doc.rounds} rowKey={(r) => String(r.n)} rowClass={(r) => (r.cancelled_at ? 'off' : undefined)} empty={R.empty} />
      </div>
      <div className="fill-foot">
        {closed ? (
          <p className="muted">{R.add.blocked.closed}</p>
        ) : finals ? (
          <p className="muted">{R.add.blocked.finals}</p>
        ) : waiting ? (
          <p className="muted">{R.add.blocked.waiting}</p>
        ) : (
          <button className={cx('btn sm', sheet === 'reset' && 'on')} type="button" onClick={() => onSheet(sheet === 'reset' ? null : 'reset')}>
            <IconLabel icon="i-plus">{R.add.title}</IconLabel>
          </button>
        )}
      </div>
    </Panel>
  )
}

function RoundEditor({ game, slug, round, onDone, onClose }: { game: string; slug: string; round: SeasonRound; onDone: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(round, round.games))
  const w = useWrite(onDone)
  const edit = editOf(draft, round)
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        void w.run(() => api.updateSeasonRound(game, slug, round.n, edit))
      }}
    >
      <RoundFields draft={draft} onChange={setDraft} id={`round-${round.n}`} />
      <div className="row">
        <button className="btn primary sm" type="submit" disabled={w.busy || Object.keys(edit).length === 0}>
          {w.busy ? T.finals.form.saving : T.finals.form.save}
        </button>
        <button className="btn sm" type="button" onClick={onClose}>
          {T.rounds.close}
        </button>
      </div>
      {w.error ? <p className="form-error">{w.error}</p> : null}
    </form>
  )
}

function ResetForm({ game, doc, onDone, onClose }: { game: string; doc: SeasonRounds; onDone: () => void; onClose: () => void }) {
  const R = T.rounds
  const [draft, setDraft] = useState<Draft>(() => ({ ...draftOf(null, doc.rules?.games ?? 100), sigma: doc.rules?.sigma_floor != null ? String(doc.rules.sigma_floor) : '3' }))
  const w = useWrite(onDone)
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        void w.run(() => api.addSeasonRound(game, doc.season, bodyOf('round', draft)))
      }}
    >
      <RoundFields draft={draft} onChange={setDraft} id="reset" />
      <div className="row">
        <button className="btn primary sm" type="submit" disabled={w.busy || !(Number(draft.games) >= 1)}>
          {w.busy ? R.add.scheduling : R.add.schedule}
        </button>
        <button className="btn sm" type="button" onClick={onClose}>
          {R.close}
        </button>
      </div>
      {w.error ? <p className="form-error">{w.error}</p> : null}
    </form>
  )
}

// ---- the idle fill ------------------------------------------------------------------------------

function FillPanel({ game, doc, onDone }: { game: string; doc: SeasonRounds; onDone: () => void }) {
  const F = T.fill
  const [enabled, setEnabled] = useState(doc.fill.enabled)
  const [games, setGames] = useState(String(doc.fill.games ?? doc.rules?.games ?? 100))
  const [headroom, setHeadroom] = useState(String(doc.fill.headroom ?? 0))
  const w = useWrite(onDone)
  const closed = doc.state === 'closed'
  const [loaded] = useState(() => ({ enabled, games, headroom }))
  const same = enabled === loaded.enabled && games === loaded.games && headroom === loaded.headroom
  const c = doc.capacity

  return (
    <Panel>
      <PanelHead icon="i-server" title={F.title} end={<span className="muted">{fill(F.lanes, { lanes: num(c.lanes), playing: num(c.playing), queued: num(c.queued) })}</span>} />
      <PanelBody className="stack">
        <form
          className="strip-form"
          onSubmit={(e) => {
            e.preventDefault()
            void w.run(() =>
              api.setSeasonFill(game, doc.season, enabled ? { enabled, games: Number(games), headroom: Number(headroom) } : { enabled, headroom: Number(headroom) }),
            )
          }}
        >
          <Switch checked={enabled} label={F.switch} busy={closed || w.busy} onChange={(next) => { setEnabled(next); w.clear() }} />
          <label>
            {F.games}
            <input className="input mono" type="number" min={1} max={100000} step={1} value={games} disabled={closed} onChange={(e) => { setGames(e.target.value); w.clear() }} />
          </label>
          <label title={F.headroomHint}>
            {F.headroom}
            <input className="input mono" type="number" min={0} max={1000} step={1} value={headroom} disabled={closed} onChange={(e) => { setHeadroom(e.target.value); w.clear() }} />
          </label>
          <button className="btn primary sm" type="submit" disabled={closed || w.busy || same || (enabled && !(Number(games) >= 1))}>
            {w.busy ? F.saving : F.save}
          </button>
          {w.ok ? <span className="muted">{F.saved}</span> : null}
        </form>
        <p className="hint">{F.intro}</p>
        {w.error ? <p className="form-error">{w.error}</p> : null}
        {closed ? null : <FleetForm game={game} doc={doc} onDone={onDone} />}
      </PanelBody>
    </Panel>
  )
}

/** WHO PLAYS AND ADMITS THE SEASON: its own runners (season keys), the platform's, or both. A
 *  platform admin changes it while the season is live -- the platform steps in when a cohort's
 *  own machines are down. */
function FleetForm({ game, doc, onDone }: { game: string; doc: SeasonRounds; onDone: () => void }) {
  const F = T.fleet
  const [matches, setMatches] = useState<FleetSide>(doc.fleet.matches)
  const [admissions, setAdmissions] = useState<FleetSide>(doc.fleet.admissions)
  const w = useWrite(onDone)
  const same = matches === doc.fleet.matches && admissions === doc.fleet.admissions
  const options = (['platform', 'own', 'both'] as const).map((v) => ({ value: v, label: F.options[v] }))
  return (
    <form
      className="strip-form"
      onSubmit={(e) => {
        e.preventDefault()
        void w.run(() => api.setSeasonFleet(game, doc.season, { matches, admissions }))
      }}
    >
      <Select look="pick" prefix={F.matches} label={F.matches} value={matches} options={options} onChange={(v) => { setMatches(v as FleetSide); w.clear() }} />
      <Select look="pick" prefix={F.admissions} label={F.admissions} value={admissions} options={options} onChange={(v) => { setAdmissions(v as FleetSide); w.clear() }} />
      <button className="btn primary sm" type="submit" disabled={w.busy || same}>
        {w.busy ? F.saving : F.save}
      </button>
      {w.ok ? <span className="muted">{F.saved}</span> : null}
      {w.error ? <span className="form-error">{w.error}</span> : null}
    </form>
  )
}
