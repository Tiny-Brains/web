// `/admin/seasons` — admin session only. The one link to it is the Admin section of an
// administrator's own profile, so the page still has to introduce itself.
//
// TWO OPERATIONS, AND THEY ARE NOT SYMMETRICAL. Creating a season is a form.
// Closing one is a REQUEST, because it settles every rating and freezes every
// standing and cannot be undone — so the page makes you type the season number
// rather than click a red button by accident.
//
// THE CLASSES ARE DISPLAYED, NOT ASKED FOR: a new season inherits the previous
// one's, and the seat count is the cartridge's. Showing a field that cannot be
// saved is worse than showing none.
//
// THE RULES ARE ASKED FOR, and used not to be. The reason they were left out —
// that the schema refused to store anything but two keys — expired when
// seasons.rules became the whole description of a contest: quotas, which classes
// are offered, who may enter, how the ladder pairs, how standings are read.
// Four of them are fields here because they are what a season is usually about;
// the rest is a JSON box, validated server-side by season_rules_ok(), which
// refuses a key it does not know rather than storing a misspelling that then
// silently never applies.
//
// EVERY RULE IS OPTIONAL AND EVERY RULE FALLS BACK to the deploy's value, so a
// season created with this whole block left blank behaves exactly as today.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type Season, type SeasonWeightClass } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform } from '../providers/platform-context'
import { useSession } from '../providers/session-context'
import { cap, date, dateInput, dateToIso, num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Panel, PanelBody, PanelFoot, PanelHead, type Column, DataTable, Field, Loading, Notice, type Option, PageHeader, Badge, Select } from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { SeasonBadge } from '../components/Model'
import { kStyle } from '../lib/weight-classes'
import { InlineError, AdminGate } from '../components/ErrorStates'

const DAY = 86_400_000

const UNIQUE_WEIGHTS: Option[] = [
  { value: '', label: 'allowed — no rule' },
  { value: 'game', label: 'unique across the game' },
  { value: 'season', label: 'unique within this season' },
  { value: 'user', label: 'unique, and one competitor may not repeat their own' },
]

export default function SeasonsAdmin() {
  const { slug, gameName, seasons: fromContext } = usePlatform()
  const { me, session } = useSession()
  const seasons = useApi(`admin-seasons:${slug}`, () => api.seasons(slug))

  if (session.state === 'loading') {
    return (
      <Shell title="Seasons · admin">
        <section className="wrap page-body">
          <Loading rows={3} label="Checking your session" />
        </section>
      </Shell>
    )
  }

  // Gated here as a courtesy, not as the control: Soma answers 403 to a non-admin
  // whatever this page renders, and that is what actually protects the operations.
  if (!me || me.role !== 'admin') {
    return (
      <Shell title="Seasons · admin">
        <AdminGate signedIn={Boolean(me)} />
      </Shell>
    )
  }

  const rows = seasons.data ?? fromContext
  const newestFirst = [...rows].sort((a, b) => b.number - a.number)
  const liveSeason = newestFirst.find((s) => s.closed_at === null && s.state !== 'scheduled') ?? null
  // A season that has not opened yet is the one thing on this page that can still be changed
  // without changing anyone's result. There is at most one.
  const scheduled = newestFirst.find((s) => s.state === 'scheduled') ?? null

  return (
    <Shell title="Seasons · admin" scoped>
      <div>
        <PageHeader
          crumbs={[{ label: 'Admin', to: '/admin/seasons' }, { label: 'Seasons' }]}
          title="Seasons"
          badges={<Badge tone="info">Admin</Badge>}
          sub="A season is the field everyone plays in, so both operations on this page change the game for every competitor at once."
        >
          <AdminTabs current="seasons" />
        </PageHeader>

        <section className="wrap page-body">
          <div className="split">
            <div className="stack">
              <Panel>
                <PanelHead title={`${gameName} seasons`} end="newest first" />
                {seasons.state === 'error' ? (
                  <InlineError error={seasons.error} what="The seasons" />
                ) : (
                  <DataTable
                    state={seasons.state === 'loading' && rows.length === 0 ? 'loading' : 'ready'}
                    columns={SEASON_COLUMNS}
                    rows={newestFirst}
                    rowKey={(s) => String(s.number)}
                    rowClass={(s) => (s.state === 'open' ? 'you' : undefined)}
                    empty="This game has never had a season. Create the first one."
                  />
                )}
                <PanelFoot>
                  <span className="muted">
                    A game has at most one season taking submissions. Scheduling a new one before this
                    closes is refused.
                  </span>
                </PanelFoot>
              </Panel>

              {scheduled ? (
                <DatesCard key={scheduled.number} season={scheduled} game={slug} onDone={seasons.reload} />
              ) : null}

              {liveSeason ? <CloseCard season={liveSeason} game={slug} onDone={seasons.reload} /> : null}
            </div>

            <div className="stack">
              <CreateCard
                game={slug}
                gameName={gameName}
                nextNumber={newestFirst.length ? newestFirst[0].number + 1 : 1}
                inherited={newestFirst[0]?.weight_classes ?? []}
                blocked={Boolean(liveSeason)}
                onDone={seasons.reload}
              />

              <Notice tone="info" title="Scheduled, not open.">
                <p>
                  A created season sits as <em>scheduled</em> until its opening date. Only then does{' '}
                  <Link to="/submit">/submit</Link> start accepting versions for it.
                </p>
              </Notice>
            </div>
          </div>
        </section>
      </div>
    </Shell>
  )
}

const SEASON_COLUMNS: Column<Season>[] = [
  { key: 'n', head: '#', className: 'r-rank top', cell: (s) => s.number },
  {
    key: 'window',
    head: 'Window',
    className: 's-when',
    cell: (s) => `${date(s.submissions_open_at)} → ${date(s.closed_at ?? s.submissions_close_at)}`,
  },
  { key: 'state', head: 'State', cell: (s) => <SeasonBadge state={s.state} /> },
  {
    key: 'versions',
    head: 'Versions',
    align: 'right',
    className: 'r-num',
    cell: (s) => (s.entered_versions ? num(s.entered_versions) : '—'),
  },
  {
    key: 'matches',
    head: 'Matches',
    align: 'right',
    className: 'r-num muted',
    cell: (s) => (s.matches_played ? num(s.matches_played) : '—'),
  },
  {
    key: 'act',
    head: '',
    align: 'right',
    cell: (s) =>
      s.state === 'open' ? (
        <a className="btn sm danger" href="#close">
          Request close
        </a>
      ) : s.state === 'closed' ? (
        <Link className="btn sm" to={`/leaderboard?season=${s.number}`}>
          Final standings
        </Link>
      ) : s.state === 'scheduled' ? (
        <a className="btn sm" href="#dates">
          Move its dates
        </a>
      ) : (
        <Link className="btn sm" to={`/?season=${s.number}`}>
          View
        </Link>
      ),
  },
]

/**
 * MOVING A SEASON THAT HAS NOT OPENED YET — the third operation, and the only reversible one.
 *
 * A date set a fortnight ago is the thing most likely to be wrong, and until now nothing could
 * change it: the page could create a season and request its close, and the gap meant deleting
 * nothing and waiting. The client has had `updateSeason` the whole time with no caller.
 *
 * ONLY WHILE IT IS SCHEDULED, and only the two dates. An open season's window is what every
 * competitor has planned around, and its classes and its engine are what its standings mean; Soma
 * decides all of that and answers its own refusal, but the page does not offer what it knows is
 * refused. This is why it is a form and not a confirmation: nothing here has happened yet.
 */
function DatesCard({ season, game, onDone }: { season: Season; game: string; onDone: () => void }) {
  const [opens, setOpens] = useState(() => dateInput(season.submissions_open_at))
  const [closes, setCloses] = useState(() => dateInput(season.submissions_close_at))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const moved =
    opens !== dateInput(season.submissions_open_at) || closes !== dateInput(season.submissions_close_at)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.updateSeason(game, season.number, {
        submissions_open_at: dateToIso(opens),
        submissions_close_at: dateToIso(closes),
      })
      setSaved(true)
      onDone()
    } catch (err) {
      setError(createSaid(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <span id="dates" />
      <PanelHead title="Move its dates" end={`season ${season.number} · scheduled`} />
      <PanelBody className="stack">
        <Notice tone="info" title="Nothing has been played in it yet.">
          <p>
            Season {season.number} opens on {date(season.submissions_open_at)} and takes no
            submissions until it does, so moving either date changes nobody&rsquo;s standing and
            cancels nothing. Once it opens this card is gone: the window an open season runs to is
            what every competitor has planned around.
          </p>
        </Notice>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="form-grid">
            <Field label="Opens" htmlFor="e-open">
              <input
                className="input mono"
                id="e-open"
                type="date"
                value={opens}
                onChange={(e) => {
                  setOpens(e.target.value)
                  setSaved(false)
                }}
              />
            </Field>
            <Field label="Closes" htmlFor="e-close">
              <input
                className="input mono"
                id="e-close"
                type="date"
                value={closes}
                onChange={(e) => {
                  setCloses(e.target.value)
                  setSaved(false)
                }}
              />
            </Field>
          </div>
          <span className="hint">Both dates are read as midnight UTC, as they are above.</span>

          {error ? (
            <Notice tone="bad" title="It was not moved.">
              <p>{error}</p>
            </Notice>
          ) : saved ? (
            <Notice tone="ok" title={`Season ${season.number} moved.`}>
              <p>The table beside this form is the season as it now stands.</p>
            </Notice>
          ) : null}

          <div className="row">
            <button className="btn primary" type="submit" disabled={busy || !moved || !opens || !closes}>
              {busy ? 'Moving…' : 'Move the dates'}
            </button>
            <span className="muted">
              {moved ? 'Unsaved.' : 'Both dates are as the season holds them.'}
            </span>
          </div>
        </form>
      </PanelBody>
    </Panel>
  )
}

/** Typing the number is the confirmation. A destructive action that one mis-click
 *  can start is a destructive action that will eventually happen. */
function CloseCard({ season, game, onDone }: { season: Season; game: string; onDone: () => void }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.closeSeason(game)
      setTyped('')
      onDone()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === 'no_live_season'
            ? 'There is no live season to close — it may have closed between loading this page and pressing the button.'
            : err.message
          : 'The request could not be sent.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <span id="close" />
      <PanelHead title="Request a close" end={`season ${season.number}`} />
      <PanelBody className="stack">
        {season.close_requested_at !== null ? (
          <Notice tone="warn" title={`A close has already been requested for season ${season.number}.`}>
            <p>
              Requested {date(season.close_requested_at)}. The arena drains what it is playing, then the
              closure clock settles every rating and freezes every standing. There is nothing further to do
              here, and the request cannot be withdrawn.
            </p>
          </Notice>
        ) : (
          <>
            <Notice tone="warn" title={`Closing season ${season.number} cannot be undone.`}>
              <p>
                Every rating settles at its current value, every standing freezes, the{' '}
                {season.weight_classes.length + 1} ladders become final, and no version can be submitted to
                it again. Matches already queued are cancelled rather than played. Competitors see the same
                pages they see now, in their frozen state.
              </p>
            </Notice>
            <Field
              label="Type the season number to confirm"
              htmlFor="c-confirm"
              hint={
                season.in_flight_versions > 0
                  ? `${num(season.in_flight_versions)} versions are mid-trial and will be cancelled, not admitted.`
                  : 'No version is mid-trial right now.'
              }
            >
              <input
                className="input mono narrow"
                id="c-confirm"
                type="text"
                placeholder={String(season.number)}
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </Field>
            <div className="row">
              <button
                className="btn danger lg"
                type="button"
                disabled={typed.trim() !== String(season.number) || busy}
                onClick={close}
              >
                {busy ? 'Requesting…' : `Close season ${season.number}`}
              </button>
              <span className="muted">
                The close is queued, not immediate: the arena drains what it is playing first.
              </span>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
          </>
        )}
      </PanelBody>
    </Panel>
  )
}

function CreateCard({
  game,
  gameName,
  nextNumber,
  inherited,
  blocked,
  onDone,
}: {
  game: string
  gameName: string
  nextNumber: number
  inherited: SeasonWeightClass[]
  blocked: boolean
  onDone: () => void
}) {
  // Lazy: the default dates are computed once, when the form first mounts, and
  // must not move under the editor on every re-render.
  const [opens, setOpens] = useState(() => dateInput(new Date(Date.now() + 7 * DAY).toISOString()))
  const [closes, setCloses] = useState(() => dateInput(new Date(Date.now() + 90 * DAY).toISOString()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<number | null>(null)

  // The rules, as the four an admin sets by hand plus an escape hatch for the rest.
  const [maxPerUser, setMaxPerUser] = useState('')
  const [inFlightMax, setInFlightMax] = useState('')
  const [classes, setClasses] = useState('')
  const [handles, setHandles] = useState('')
  const [uniqueWeights, setUniqueWeights] = useState('')
  const [turnMs, setTurnMs] = useState('')
  const [maxTurns, setMaxTurns] = useState('')
  const [extra, setExtra] = useState('')
  const [extraBad, setExtraBad] = useState<string | null>(null)

  const rules = (): Record<string, unknown> | undefined => {
    const r: Record<string, unknown> = {}
    const entries: Record<string, unknown> = {}
    if (maxPerUser.trim()) entries.max_per_user = Number(maxPerUser)
    if (inFlightMax.trim()) entries.in_flight_max = Number(inFlightMax)
    if (Object.keys(entries).length > 0) r.entries = { enabled: true, ...entries }

    const allow = classes.split(',').map((c) => c.trim()).filter(Boolean)
    if (allow.length > 0) r.classes = { enabled: true, allow }

    // Stored AS TYPED and resolved at each submission, so a cohort member who signs up next week
    // is admitted without an edit. The response reports which handles have no account yet.
    if (handles.trim()) r.participants = { enabled: true, handles: handles.trim() }

    if (uniqueWeights) r.unique_weights = { enabled: true, scope: uniqueWeights }

    // The terms a model competes under, sent to a runner on the claim. Left blank, the season plays
    // by the cartridge's own published limits -- so an empty box is not "no limit", it is "the
    // game's", which is why neither field carries a placeholder number that looks like a default.
    const execution: Record<string, unknown> = {}
    if (turnMs.trim()) execution.turn_ms = Number(turnMs)
    if (maxTurns.trim()) execution.max_turns = Number(maxTurns)
    if (Object.keys(execution).length > 0) r.execution = { enabled: true, ...execution }

    if (extra.trim()) Object.assign(r, JSON.parse(extra))
    return Object.keys(r).length > 0 ? r : undefined
  }

  const create = async () => {
    setBusy(true)
    setError(null)
    setExtraBad(null)
    let body
    try {
      body = {
        submissions_open_at: dateToIso(opens),
        submissions_close_at: dateToIso(closes),
        rules: rules(),
      }
    } catch {
      setExtraBad('That is not valid JSON, so nothing was sent.')
      setBusy(false)
      return
    }
    try {
      const s = await api.createSeason(game, body)
      setMade(s.number)
      onDone()
    } catch (err) {
      setError(createSaid(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <PanelHead title="Create a season" />
      <PanelBody>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <Field label="Game" htmlFor="n-game">
            <input className="input" id="n-game" type="text" value={gameName} readOnly disabled />
          </Field>

          <div className="form-grid">
            <Field label="Opens" htmlFor="n-open">
              <input className="input mono" id="n-open" type="date" value={opens} onChange={(e) => setOpens(e.target.value)} />
            </Field>
            <Field label="Closes" htmlFor="n-close">
              <input className="input mono" id="n-close" type="date" value={closes} onChange={(e) => setCloses(e.target.value)} />
            </Field>
          </div>
          <span className="hint">
            Season {nextNumber}. The number is the next one; it is not chosen. Both dates are read as
            midnight UTC.
          </span>

          <Field
            label="Weight classes"
            hint="Inherited from the previous season. A season owns its classes, so a result in one class is comparable within its season and not across seasons."
          >
            <div className="row">
              {inherited.length === 0 ? (
                <span>the platform defaults</span>
              ) : (
                inherited.map((c) => (
                  <span key={c.class}>
                    <i style={kStyle(c.class)} />
                    {c.class} · {cap(c.max_bytes)}
                  </span>
                ))
              )}
            </div>
          </Field>

          <Field
            label="Engine"
            hint="Pinned at creation from the game's active engine. A season plays one engine from beginning to end, or its standings mean nothing."
          >
            <input className="input mono" type="text" value="the game's active engine digest" readOnly disabled />
          </Field>

          {/* THE RULES. Every one is optional and every one falls back to the deploy's value, so a
              season left blank here behaves exactly as the platform does today. These four are the
              ones a season is usually about; the rest of the document is below. */}
          <h3 className="form-h">Rules</h3>

          <Field
            label="Models per competitor"
            hint="How many models one person may hold in this season. Blank means no limit. A retired model frees its slot."
          >
            <input
              className="input"
              type="number"
              min={1}
              placeholder="no limit"
              value={maxPerUser}
              onChange={(e) => setMaxPerUser(e.target.value)}
            />
          </Field>

          <Field
            label="Versions in admission at once"
            hint="Across all of one competitor's models. One version per model is always the rule; this is the ceiling on top of it."
          >
            <input
              className="input"
              type="number"
              min={1}
              placeholder="no limit"
              value={inFlightMax}
              onChange={(e) => setInFlightMax(e.target.value)}
            />
          </Field>

          <Field
            label="Weight classes offered"
            hint="Comma-separated, from the table above — nano, micro, mini, small, large. Blank offers all of them. A model measuring into a class this season does not run is refused CLASS_NOT_OFFERED, which is not the same as being too large for every class there is."
          >
            <input
              className="input"
              type="text"
              placeholder="all of them"
              value={classes}
              onChange={(e) => setClasses(e.target.value)}
            />
          </Field>

          <Field
            label="Participants"
            hint="Comma-separated GitHub usernames — a university cohort, say. They are stored as typed and matched at each submission, so someone who signs in for the first time next week is admitted without an edit. Blank leaves the season open to everyone."
          >
            <textarea
              className="input"
              rows={3}
              placeholder="open to everyone"
              value={handles}
              onChange={(e) => setHandles(e.target.value)}
            />
          </Field>

          <Field
            label="Duplicate weights"
            htmlFor="n-unique"
            hint="Whether two entries may stand on the same weights. `user` is the strictest and is the one the entry split made necessary: without it a competitor can put one set of weights behind five models and take five ladder slots."
          >
            <Select
              id="n-unique"
              label="Duplicate weights"
              value={uniqueWeights}
              options={UNIQUE_WEIGHTS}
              onChange={setUniqueWeights}
            />
          </Field>

          <Field
            label="Turn budget (ms)"
            htmlFor="n-turnms"
            hint="How long a model has to answer one turn. This is the constraint that decides how large a model can be and still play, so it is the one number that changes what the contest rewards. Blank plays by the game's own limit."
          >
            <input
              id="n-turnms"
              className="input"
              type="number"
              min={1}
              max={60000}
              placeholder="the game's limit"
              value={turnMs}
              onChange={(e) => setTurnMs(e.target.value)}
            />
          </Field>

          <Field
            label="Match length (turns)"
            htmlFor="n-maxturns"
            hint="How long a match runs before it is scored as it stands. Shorter rewards opening play and costs less to run; longer rewards the endgame. Blank plays by the game's own limit."
          >
            <input
              id="n-maxturns"
              className="input"
              type="number"
              min={1}
              max={100000}
              placeholder="the game's limit"
              value={maxTurns}
              onChange={(e) => setMaxTurns(e.target.value)}
            />
          </Field>

          <Field
            label="Everything else"
            hint="The rest of the rules document as JSON — graph, pairing, rating, standings, closure. The server validates every key and refuses one it does not know, so a misspelt rule fails here rather than silently never applying."
          >
            <textarea
              className="input mono"
              rows={4}
              placeholder={'{ "pairing": { "enabled": true, "self_pairing": false } }'}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </Field>
          {extraBad ? (
            <Notice tone="bad" title="Not valid JSON.">
              <p>{extraBad}</p>
            </Notice>
          ) : null}

          {error ? (
            <Notice tone="bad" title="It was not created.">
              <p>{error}</p>
            </Notice>
          ) : made !== null ? (
            <Notice tone="ok" title={`Season ${made} created.`}>
              <p>It is scheduled until its opening date, and appears in the table beside this form.</p>
            </Notice>
          ) : null}

          <button className="btn primary lg" type="submit" disabled={busy || blocked || !opens || !closes}>
            {busy ? 'Creating…' : `Create season ${nextNumber}`}
          </button>
          {blocked ? (
            <span className="hint">
              A season is still live. Request its close first — a game has at most one season taking
              submissions.
            </span>
          ) : null}
        </form>
      </PanelBody>
    </Panel>
  )
}

/** The refusals creating or moving a season can hit, said rather than coded. */
function createSaid(err: unknown): string {
  if (!(err instanceof ApiError)) return 'The season could not be saved.'
  switch (err.code) {
    case 'season_not_scheduled':
      return 'That season has opened since this page was loaded, so its window is no longer something to move: competitors are submitting to it.'
    case 'unknown_season':
      return 'There is no season with that number any more.'
    case 'season_live':
      return 'A season is still live for this game. A game has at most one season taking submissions, so this one has to be closed first.'
    case 'no_engine':
      return 'This game has no active engine digest, so there is nothing to pin the season to. The cartridge has to be registered before a season can be created.'
    case 'inside_gap':
      return 'The opening date is inside the minimum gap after the previous season closed. Move it later.'
    case 'dates_required':
      return 'Both dates are required.'
    case 'admin_only':
      return 'This account does not administer seasons.'
    default:
      return err.message
  }
}
