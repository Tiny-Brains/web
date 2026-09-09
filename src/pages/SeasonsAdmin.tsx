// `/admin/seasons` — admin session only, and unlinked by design: nothing on the
// site points here, so the page has to introduce itself.
//
// TWO OPERATIONS, AND THEY ARE NOT SYMMETRICAL. Creating a season is a form.
// Closing one is a REQUEST, because closing settles every rating and freezes every
// standing and cannot be undone -- so the page makes you type the season number
// rather than click a red button by accident.
//
// THE CLASSES ARE DISPLAYED, NOT ASKED FOR. Weight classes are a column on the
// season now, and a new season inherits the previous one's unless it is given a
// table of its own; the strike limit and the turn cap the earlier draft asked for
// are the cartridge's and seasons_rules_known refuses to store them. Showing a
// field that cannot be saved is worse than showing none.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type Season } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform } from '../lib/platform-context'
import { useSession } from '../lib/session-context'
import { cap, date, dateInput, dateToIso, num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardBody, CardFoot, CardHead, Field, Loading, Note, PageHead, Pill, SeasonPill } from '../components/ui'
import { DataTable, type Column } from '../components/Table'
import { kStyle } from '../lib/classes'
import { InlineError } from '../components/states'

export default function SeasonsAdmin() {
  const { slug, game, seasons: fromContext } = usePlatform()
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

  // The route is gated here as a courtesy, not as the control: Soma answers 403
  // to a non-admin whatever this page renders, and that is what actually protects
  // the operations.
  if (!me || me.role !== 'admin') {
    return (
      <Shell>
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
  const liveSeason = rows.find((s) => s.closed_at === null && s.state !== 'scheduled') ?? null
  const nextNumber = rows.length ? Math.max(...rows.map((s) => s.number)) + 1 : 1
  const inherited = rows.length ? [...rows].sort((a, b) => b.number - a.number)[0].weight_classes : []

  return (
    <Shell ctx="select" ctxEnd={<span className="ctx-item">admin only · <b>unlinked</b></span>}>
      <div className="admin-page">
        <PageHead
          title={<h1>Seasons</h1>}
          badges={<Pill tone="scheduled">Admin</Pill>}
          end={
            <span className="muted" style={{ font: '12px var(--font-mono)' }}>
              signed in as @{me.handle} · admin
            </span>
          }
          sub="Nothing on the site links here. A season is the field everyone plays in, so both operations on this page change the game for every competitor at once."
        />

        <section className="wrap sec tight">
          <div className="split">
            <div className="stack">
              <Card>
                <CardHead title={`${game?.name ?? slug} seasons`} end="newest first" />
                {seasons.state === 'error' ? (
                  <InlineError error={seasons.error} what="The seasons" />
                ) : (
                  <DataTable
                    state={seasons.state === 'loading' && rows.length === 0 ? 'loading' : 'ready'}
                    columns={seasonColumns()}
                    rows={[...rows].sort((a, b) => b.number - a.number)}
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

              {liveSeason ? <CloseCard season={liveSeason} game={slug} onDone={() => seasons.reload()} /> : null}
            </div>

            <div className="stack">
              <CreateCard
                game={slug}
                gameName={game?.name ?? slug}
                nextNumber={nextNumber}
                inherited={inherited}
                blocked={Boolean(liveSeason)}
                onDone={() => seasons.reload()}
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

function seasonColumns(): Column<Season>[] {
  return [
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
}

/** Typing the number is the confirmation. A destructive action that one mis-click
 *  can start is a destructive action that will eventually happen. */
function CloseCard({ season, game, onDone }: { season: Season; game: string; onDone: () => void }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requested = season.close_requested_at !== null
  const armed = typed.trim() === String(season.number)

  const close = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.closeSeason(game)
      setTyped('')
      onDone()
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'no_live_season'
          ? 'There is no live season to close — it may have closed between loading this page and pressing the button.'
          : err instanceof ApiError
            ? err.message
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
        {requested ? (
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
                Every rating settles at its current value, every standing freezes, the {season.weight_classes.length + 1}{' '}
                ladders become final, and no version can be submitted to it again. Matches already queued are
                cancelled rather than played. Competitors see the same pages they see now, in their frozen
                state.
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
                className="input mono"
                id="c-confirm"
                type="text"
                placeholder={String(season.number)}
                autoComplete="off"
                style={{ maxWidth: 160 }}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </Field>
            <div className="admin-act">
              <button className="btn danger lg" type="button" disabled={!armed || busy} onClick={close}>
                {busy ? 'Requesting…' : `Close season ${season.number}`}
              </button>
              <span className="muted">
                The close is queued, not immediate: the arena drains what it is playing first.
              </span>
            </div>
            {error ? <p className="muted" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p> : null}
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
  inherited: { class: string; max_bytes: number }[]
  blocked: boolean
  onDone: () => void
}) {
  // Lazy: the default dates are computed once, when the form first mounts, and
  // must not move under the editor on every re-render.
  const [opens, setOpens] = useState(() => dateInput(new Date(Date.now() + 7 * 86_400_000).toISOString()))
  const [closes, setCloses] = useState(() => dateInput(new Date(Date.now() + 90 * 86_400_000).toISOString()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<number | null>(null)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const s = await api.createSeason(game, {
        submissions_open_at: dateToIso(opens),
        submissions_close_at: dateToIso(closes),
      })
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
          <span className="hint" style={{ marginTop: -10 }}>
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

/** The three refusals creating a season can hit, said rather than coded. */
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
