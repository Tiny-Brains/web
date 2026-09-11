// `/admin/seasons` — admin session only, and unlinked by design: nothing on the
// site points here, so the page has to introduce itself.
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
import { Card, CardBody, CardFoot, CardHead, type Column, DataTable, Field, Loading, Note, type Option, PageHead, Pill, SeasonPill, Select } from '../components/ui'
import { kStyle } from '../lib/weight-classes'
import { InlineError } from '../components/ErrorStates'

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
      <Shell>
        <section className="wrap sec tight">
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
        <section className="mid">
          <div className="code">403 · admin only</div>
          <h1>This page is for administrators.</h1>
          <p>
            {me
              ? 'You are signed in, but this account does not administer seasons. Nothing on the site links here; if you arrived by a saved link, that is all that happened.'
              : 'You are not signed in. Even signed in, this page only opens for an account that administers seasons.'}
          </p>
          <div className="acts">
            <Link className="btn primary lg" to="/">
              Home
            </Link>
            <Link className="btn lg" to="/leaderboard">
              Leaderboard
            </Link>
          </div>
        </section>
      </Shell>
    )
  }

  const rows = seasons.data ?? fromContext
  const newestFirst = [...rows].sort((a, b) => b.number - a.number)
  const liveSeason = newestFirst.find((s) => s.closed_at === null && s.state !== 'scheduled') ?? null

  return (
    <Shell
      ctx="select"
      ctxEnd={<span className="ctx-item">admin only · <b>unlinked</b></span>}
      title="Seasons · admin"
    >
      <div className="admin-page">
        <PageHead
          title={<h1>Seasons</h1>}
          badges={<Pill tone="scheduled">Admin</Pill>}
          end={<span className="muted note-mono">signed in as @{me.handle} · admin</span>}
          sub="Nothing on the site links here. A season is the field everyone plays in, so both operations on this page change the game for every competitor at once."
        />

        <section className="wrap sec tight">
          <div className="split">
            <div className="stack">
              <Card>
                <CardHead title={`${gameName} seasons`} end="newest first" />
                {seasons.state === 'error' ? (
                  <InlineError error={seasons.error} what="The seasons" />
                ) : (
                  <DataTable
                    state={seasons.state === 'loading' && rows.length === 0 ? 'loading' : 'ready'}
                    columns={SEASON_COLUMNS}
                    rows={newestFirst}
                    rowKey={(s) => String(s.number)}
                    rowClass={(s) => (s.state === 'open' ? 'now' : undefined)}
                    empty="This game has never had a season. Create the first one."
                  />
                )}
                <CardFoot>
                  <span className="muted">
                    A game has at most one season taking submissions. Scheduling a new one before this
                    closes is refused.
                  </span>
                </CardFoot>
              </Card>

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

              <Note tone="info" title="Scheduled, not open.">
                <p>
                  A created season sits as <em>scheduled</em> until its opening date. Only then does{' '}
                  <Link to="/submit">/submit</Link> start accepting versions for it.
                </p>
              </Note>
            </div>
          </div>
        </section>
      </div>
    </Shell>
  )
}

const SEASON_COLUMNS: Column<Season>[] = [
  { key: 'n', head: '#', cellClass: 'r-rank top', cell: (s) => s.number },
  {
    key: 'window',
    head: 'Window',
    cellClass: 's-when',
    wide: true,
    cell: (s) => `${date(s.submissions_open_at)} → ${date(s.closed_at ?? s.submissions_close_at)}`,
  },
  { key: 'state', head: 'State', cell: (s) => <SeasonPill state={s.state} /> },
  {
    key: 'versions',
    head: 'Versions',
    align: 'right',
    cellClass: 'r-num',
    cell: (s) => (s.entered_versions ? num(s.entered_versions) : '—'),
  },
  {
    key: 'matches',
    head: 'Matches',
    align: 'right',
    cellClass: 'r-num muted',
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
      ) : (
        <Link className="btn sm" to={`/?season=${s.number}`}>
          View
        </Link>
      ),
  },
]

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
    <Card>
      <span id="close" />
      <CardHead title="Request a close" end={`season ${season.number}`} />
      <CardBody className="stack">
        {season.close_requested_at !== null ? (
          <Note tone="warn" title={`A close has already been requested for season ${season.number}.`}>
            <p>
              Requested {date(season.close_requested_at)}. The arena drains what it is playing, then Jodi's
              closure clock settles every rating and freezes every standing. There is nothing further to do
              here, and the request cannot be withdrawn.
            </p>
          </Note>
        ) : (
          <>
            <Note tone="warn" title={`Closing season ${season.number} cannot be undone.`}>
              <p>
                Every rating settles at its current value, every standing freezes, the{' '}
                {season.weight_classes.length + 1} ladders become final, and no version can be submitted to
                it again. Matches already queued are cancelled rather than played. Competitors see the same
                pages they see now, in their frozen state.
              </p>
            </Note>
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
            <div className="admin-act">
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
      </CardBody>
    </Card>
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
    <Card>
      <CardHead title="Create a season" />
      <CardBody>
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

          <div className="row2">
            <Field label="Opens" htmlFor="n-open">
              <input className="input mono" id="n-open" type="date" value={opens} onChange={(e) => setOpens(e.target.value)} />
            </Field>
            <Field label="Closes" htmlFor="n-close">
              <input className="input mono" id="n-close" type="date" value={closes} onChange={(e) => setCloses(e.target.value)} />
            </Field>
          </div>
          <span className="hint tuck">
            Season {nextNumber}. The number is the next one; it is not chosen. Both dates are read as
            midnight UTC.
          </span>

          <Field
            label="Weight classes"
            hint="Inherited from the previous season. A season owns its classes, so a result in one class is comparable within its season and not across seasons."
          >
            <div className="fixed">
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
            <Note tone="bad" title="Not valid JSON.">
              <p>{extraBad}</p>
            </Note>
          ) : null}

          {error ? (
            <Note tone="bad" title="It was not created.">
              <p>{error}</p>
            </Note>
          ) : made !== null ? (
            <Note tone="ok" title={`Season ${made} created.`}>
              <p>It is scheduled until its opening date, and appears in the table beside this form.</p>
            </Note>
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
      </CardBody>
    </Card>
  )
}

/** The refusals creating a season can hit, said rather than coded. */
function createSaid(err: unknown): string {
  if (!(err instanceof ApiError)) return 'The season could not be created.'
  switch (err.code) {
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
