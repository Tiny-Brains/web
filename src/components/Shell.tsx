// The shell: the bar, the game-and-season strip, and the footer.
//
// The home page decided these, and every route wears them rather than designing
// again. Three props carry the whole difference between routes:
//
//   nav      which top-level link is current
//   ctx      'select' -- live dropdowns, on the three selector pages
//            'read'   -- the same strip, read-only, on a permalink
//            false    -- no strip at all, where there is nothing to select
//   ctxEnd   what sits at the right of a strip that carries no season
//
// The selection travels through the query string, so every link the shell makes
// carries it: picking season 1 on the home page and clicking Leaderboard has to
// stay in season 1.

import { Link, NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { startGitHubSignIn } from '../api'
import { useSession } from '../lib/session-context'
import { useSelection } from '../lib/selection'
import { usePlatform } from '../lib/platform-context'
import { useTheme } from '../lib/theme'
import { date, daysUntil, num, plural } from '../lib/format'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { Avatar } from './Avatar'
import { Sprite } from './Icon'

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
// wordmark → Leaderboard → Matches → Docs, then the account control. Signed out
// that control is one button; signed in it is the candidate chip, the submit
// button and the avatar, which is the only route to your own page.

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
            // Sized like the control it becomes, so the bar does not jump when
            // the session answers.
            <span className="skel" style={{ width: 168, height: 40 }} aria-hidden="true" />
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

function SignedIn() {
  const { me } = useSession()
  const { href, game } = useSelection()
  if (!me) return null

  // A candidate is a version of yours that is not on the ladder yet. It belongs
  // in the bar because it is the one thing about your entry that changes without
  // you doing anything.
  const candidate = me.candidates.find((c) => c.game === game) ?? me.candidates[0] ?? null
  const said: Record<string, string> = {
    queued: 'queued',
    verifying: 'in admission',
    awaiting_trial: 'awaiting trial',
  }

  return (
    <>
      {candidate ? (
        <Link className="candidate-chip" to={`/models/${candidate.model_id}`}>
          v{candidate.version} · {said[candidate.phase]}
        </Link>
      ) : null}
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
  const { games, seasons, season, slug, seasonsLoading } = usePlatform()
  const { setGame, setSeason, href } = useSelection()
  const selectable = mode === 'select'
  const gameName = games.find((g) => g.id === slug)?.name ?? slug

  return (
    <div className="site-context">
      <div className="wrap">
        {selectable ? (
          <select className="pick" aria-label="Game" value={slug} onChange={(e) => setGame(e.target.value)}>
            {/* Before the list arrives the strip still has to name the game it is
                showing, or the control would be empty on first paint. */}
            {games.length === 0 ? <option value={slug}>{gameName}</option> : null}
            {games.map((g) => (
              <option value={g.id} key={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : (
          <Link className="game-pick" to={`/?game=${slug}`}>
            {gameName}
          </Link>
        )}

        {season || seasonsLoading ? <div className="ctx-sep" /> : null}

        {selectable ? (
          <select
            className="pick sm"
            aria-label="Season"
            value={season ? String(season.number) : ''}
            onChange={(e) => setSeason(Number(e.target.value))}
          >
            {seasons.length === 0 && season ? <option value={season.number}>Season {season.number}</option> : null}
            {seasons.map((s) => (
              <option value={s.number} key={s.number}>
                Season {s.number}
                {s.state === 'open' ? '' : ' · final'}
              </option>
            ))}
          </select>
        ) : season ? (
          <Link className="ctx-item" to={href('/', { season: season.number })}>
            Season <b>{season.number}</b>
          </Link>
        ) : null}

        {season ? <SeasonFacts /> : null}
        {!season && end ? <div className="ctx-end">{end}</div> : null}
      </div>
    </div>
  )
}

function SeasonFacts() {
  const { season, live } = usePlatform()
  const { href } = useSelection()
  if (!season) return null

  const left = daysUntil(season.submissions_close_at)
  const count = live ? season.active_versions : season.entered_versions

  return (
    <>
      {live ? (
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
      ) : season.state === 'closed' ? (
        <>
          <span className="pill closed">Closed</span>
          <span className="deadline muted">Final · closed {date(season.closed_at)}</span>
        </>
      ) : season.state === 'settling' ? (
        <>
          <span className="pill settling">Settling</span>
          <span className="deadline muted">Submissions closed {date(season.submissions_close_at)}</span>
        </>
      ) : (
        <>
          <span className="pill scheduled">Scheduled</span>
          <span className="deadline muted">Opens {date(season.submissions_open_at)}</span>
        </>
      )}
      <div className="ctx-end">
        <span className="ctx-item">
          <b>{num(count)}</b> {live ? 'active versions' : 'versions entered'}
        </span>
        <Link className="btn sm" to={href('/', { season: season.number })}>
          Season rules
        </Link>
      </div>
    </>
  )
}

// ---- the footer -----------------------------------------------------------------------

function Footer() {
  const { season, games, slug } = usePlatform()
  const [theme, setTheme] = useTheme()
  const gameName = games.find((g) => g.id === slug)?.name ?? slug

  return (
    <footer>
      <div className="wrap">
        <div className="col">
          <strong>Compete</strong>
          <Link to="/leaderboard">Leaderboard</Link>
          <Link to="/matches">Matches</Link>
          <Link to="/submit">Submit a version</Link>
          <Link to="/start">Get started</Link>
        </div>
        <div className="col">
          <strong>Build</strong>
          <a href="/docs/quickstart">Start building</a>
          <a href="/docs/models/adapters">Connect your model</a>
          <a href="/docs/models/weight-classes">Weight classes</a>
          <a href="/docs/drill">Test locally with drill</a>
        </div>
        <div className="col">
          <strong>Platform</strong>
          <a href="/docs/platform/architecture">Architecture</a>
          <a href="/docs/reference/api">HTTP API</a>
          <Link to="/status">System status</Link>
        </div>
        <div className="end">
          <span>
            TinyBrains{season ? ` · ${gameName} season ${season.number}` : null}
          </span>
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
