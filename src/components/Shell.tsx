// The shell: the bar, the game-and-season strip, and the footer. Three props carry
// the whole difference between routes:
//
//   nav      which top-level link is current
//   ctx      'select' — live dropdowns, on the three selector pages
//            'read'   — the same strip, read-only, on a permalink
//            false    — no strip at all
//   ctxEnd   what sits at the right of a strip that carries no season
//
// The selection travels through the query string, so every link the shell makes
// carries it: picking season 1 and clicking Leaderboard has to stay in season 1.

import { Link, NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { startGitHubSignIn, type Season } from '../api'
import { useSession } from '../providers/session-context'
import { useSelection } from '../lib/selection'
import { usePlatform } from '../providers/platform-context'
import { useTheme } from '../lib/theme'
import { date, daysUntil, plural } from '../lib/format'
import { Icon, Select, Sprite } from './ui'
import { Logo } from './Logo'
import { Avatar } from './Avatar'

export type Nav = 'leaderboard' | 'matches' | 'docs' | null
export type Ctx = 'select' | 'read' | false

export function Shell({
  nav = null,
  ctx = false,
  ctxEnd,
  children,
}: {
  nav?: Nav
  ctx?: Ctx
  ctxEnd?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <Sprite />
      <TopBar nav={nav} />
      {ctx ? <ContextStrip mode={ctx} end={ctxEnd} /> : null}
      <main>{children}</main>
      <Footer />
    </>
  )
}

// ---- the bar --------------------------------------------------------------------------

function TopBar({ nav }: { nav: Nav }) {
  const { me, session } = useSession()
  const { href } = useSelection()

  return (
    <header className="site-bar">
      <div className="wrap">
        <Link className="brand" to={href('/')}>
          <Logo />
          <span className="wordmark">
            tiny<span>brains</span>
          </span>
        </Link>
        <nav className="site-nav">
          <NavLink to={href('/leaderboard')} className={nav === 'leaderboard' ? 'on' : undefined}>
            Leaderboard
          </NavLink>
          <NavLink to={href('/matches')} className={nav === 'matches' ? 'on' : undefined}>
            Matches
          </NavLink>
          {/* The book is served by nginx at this origin, not routed by the SPA. */}
          <a href="/docs" className={nav === 'docs' ? 'on' : undefined}>
            Docs
          </a>
        </nav>
        <div className="bar-end">
          {session.state === 'loading' ? (
            // Sized like the control it becomes, so the bar does not jump.
            <span className="skel bar-skel" aria-hidden="true" />
          ) : me ? (
            <SignedIn />
          ) : (
            <button className="btn" type="button" onClick={startGitHubSignIn}>
              <Icon id="i-github" />
              Sign in with GitHub
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

const CANDIDATE_PHASE: Record<string, string> = {
  queued: 'queued',
  verifying: 'in admission',
  awaiting_trial: 'awaiting trial',
}

function SignedIn() {
  const { me } = useSession()
  const { href, game } = useSelection()
  if (!me) return null

  // A candidate is a version of yours that is not on the ladder yet. It belongs in the bar
  // because it is the one thing about your models that changes on its own.
  //
  // There may be SEVERAL now -- one per model, up to whatever the season's in_flight_max allows.
  // One is named; more than one is counted, because a bar is not a list and /models is.
  const here = me.candidates.filter((c) => c.game === game)
  const candidates = here.length > 0 ? here : me.candidates
  const candidate = candidates[0] ?? null

  return (
    <>
      {candidate ? (
        <Link
          className="candidate-chip"
          to={candidates.length > 1 ? '/models' : `/versions/${candidate.version_id}`}
        >
          {candidates.length > 1
            ? `${candidates.length} in admission`
            : `${candidate.model} v${candidate.version} · ${CANDIDATE_PHASE[candidate.phase]}`}
        </Link>
      ) : null}
      <Link className="btn" to="/models">
        Your models
      </Link>
      <Link className="btn primary" to={href('/submit')}>
        Submit a version
      </Link>
      <Link to={`/profile/${me.handle}`} aria-label={`@${me.handle} — your profile`}>
        <Avatar handle={me.handle} name={me.display_name} />
      </Link>
    </>
  )
}

// ---- the game and season strip --------------------------------------------------------

function ContextStrip({ mode, end }: { mode: 'select' | 'read'; end?: ReactNode }) {
  const { games, seasons, season, slug, gameName, seasonsLoading } = usePlatform()
  const { setGame, setSeason, href } = useSelection()
  const selectable = mode === 'select'

  return (
    <div className="site-context">
      <div className="wrap">
        {selectable ? (
          <Select
            look="pick"
            label="Game"
            value={slug}
            // Before the list arrives the strip still has to name the game it is
            // showing, or the control would be empty on first paint.
            options={games.length === 0 ? [{ value: slug, label: gameName }] : games.map((g) => ({ value: g.id, label: g.name }))}
            onChange={(v) => setGame(v)}
          />
        ) : (
          <Link className="game-pick" to={`/?game=${slug}`}>
            {gameName}
          </Link>
        )}

        {season || seasonsLoading ? <div className="ctx-sep" /> : null}

        {selectable ? (
          <Select
            look="pick"
            className="sm"
            label="Season"
            value={season ? String(season.number) : ''}
            // Each season's state rides beside its number in the open list. The button
            // leaves it to the pill beside it, which says it for the season shown.
            options={
              seasons.length === 0 && season
                ? [{ value: String(season.number), label: `Season ${season.number}` }]
                : seasons.map((s) => ({
                    value: String(s.number),
                    label: `Season ${s.number}`,
                    hint: s.state === 'closed' ? 'final' : s.state,
                  }))
            }
            onChange={(v) => setSeason(Number(v))}
          />
        ) : season ? (
          <Link className="ctx-item" to={href('/', { season: season.number })}>
            Season <b>{season.number}</b>
          </Link>
        ) : null}

        {season ? <SeasonDeadline season={season} /> : null}
        {!season && end ? <div className="ctx-end">{end}</div> : null}
      </div>
    </div>
  )
}

function SeasonDeadline({ season }: { season: Season }) {
  if (season.state === 'open') {
    const left = daysUntil(season.submissions_close_at)
    return (
      <>
        <span className="pill open">Open</span>
        <span className="deadline">
          Submissions close {date(season.submissions_close_at)}
          {left !== null && left >= 0 ? (
            <>
              {' · '}
              <em>
                {left} {plural(left, 'day')} left
              </em>
            </>
          ) : null}
        </span>
      </>
    )
  }
  if (season.state === 'closed') {
    return (
      <>
        <span className="pill closed">Closed</span>
        <span className="deadline muted">Final · closed {date(season.closed_at)}</span>
      </>
    )
  }
  if (season.state === 'settling') {
    return (
      <>
        <span className="pill settling">Settling</span>
        <span className="deadline muted">Submissions closed {date(season.submissions_close_at)}</span>
      </>
    )
  }
  return (
    <>
      <span className="pill scheduled">Scheduled</span>
      <span className="deadline muted">Opens {date(season.submissions_open_at)}</span>
    </>
  )
}

// ---- the footer -----------------------------------------------------------------------

const FOOTER: [string, [string, string][]][] = [
  [
    'Compete',
    [
      ['Leaderboard', '/leaderboard'],
      ['Matches', '/matches'],
      ['Submit a version', '/submit'],
      ['Get started', '/start'],
    ],
  ],
  [
    'Build',
    [
      ['Start building', '/docs/quickstart'],
      ['Connect your model', '/docs/models/adapters'],
      ['Weight classes', '/docs/models/weight-classes'],
      ['Test locally with drill', '/docs/drill'],
    ],
  ],
  [
    'Platform',
    [
      ['Architecture', '/docs/platform/architecture'],
      ['HTTP API', '/docs/reference/api'],
      ['System status', '/status'],
    ],
  ],
]

function Footer() {
  const { season, gameName } = usePlatform()
  const [theme, setTheme] = useTheme()

  return (
    <footer>
      <div className="wrap">
        {FOOTER.map(([heading, links]) => (
          <div className="col" key={heading}>
            <strong>{heading}</strong>
            {/* /docs is served by nginx at this origin, not routed by the SPA. */}
            {links.map(([label, to]) =>
              to.startsWith('/docs') ? (
                <a href={to} key={to}>
                  {label}
                </a>
              ) : (
                <Link to={to} key={to}>
                  {label}
                </Link>
              ),
            )}
          </div>
        ))}
        <div className="end">
          <span>TinyBrains{season ? ` · ${gameName} season ${season.number}` : null}</span>
          <div className="seg" role="group" aria-label="Theme">
            <button type="button" className={theme === 'dark' ? 'on' : undefined} onClick={() => setTheme('dark')}>
              Dark
            </button>
            <button type="button" className={theme === 'light' ? 'on' : undefined} onClick={() => setTheme('light')}>
              Light
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
