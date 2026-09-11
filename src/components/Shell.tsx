// The shell: the bar, the game-and-season strip, and the footer. Three props carry
// the whole difference between routes:
//
//   nav      which top-level link is current
//   ctx      'select' — live dropdowns, on the three selector pages
//            'read'   — the same strip, read-only, on a permalink
//            false    — no strip at all
//   ctxEnd   what sits at the right of a strip that carries no season
//   title    the page's own part of the document title
//
// The selection travels through the query string, so every link the shell makes
// carries it: picking season 1 and clicking Leaderboard has to stay in season 1.

import { Link, NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { startGitHubSignIn, type Season } from '../api'
import { useSession } from '../providers/session-context'
import { useSelection } from '../lib/selection'
import { usePlatform } from '../providers/platform-context'
import { useTheme } from '../lib/theme'
import { date, daysUntil, plural } from '../lib/format'
import { Icon, Select, Sprite } from './ui'
import { Logo } from './Logo'
import { Avatar } from './Avatar'

export type Nav = 'start' | 'leaderboard' | 'matches' | 'docs' | null
export type Ctx = 'select' | 'read' | false

export function Shell({
  nav = null,
  ctx = false,
  ctxEnd,
  title,
  children,
}: {
  nav?: Nav
  ctx?: Ctx
  ctxEnd?: ReactNode
  title?: string
  children: ReactNode
}) {
  useDocumentTitle(title, ctx)
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

/** The tab, the history entry and a bookmark all read this. The page's own part comes first,
 *  then the game and season when the page is about one (the strip is drawn), then the site —
 *  so two tabs on two ladders can be told apart. Every tab used to read `tinybrains`. Set from an
 *  effect rather than a rendered <title>, so the static one in index.html stays what a crawler
 *  reads and there is never a second title element for a browser to pick between. */
function useDocumentTitle(title: string | undefined, ctx: Ctx) {
  const { season, gameName } = usePlatform()
  const where = ctx && season ? `${gameName} season ${season.number}` : null
  const text = [title, where, 'TinyBrains'].filter(Boolean).join(' · ')
  useEffect(() => {
    document.title = text
  }, [text])
}

// ---- the bar --------------------------------------------------------------------------

function TopBar({ nav }: { nav: Nav }) {
  const { me, session } = useSession()
  const { href } = useSelection()

  // THE MENU, on a phone. Below 1000px the bar has room for the brand, one button and the
  // avatar, and the four links were simply hidden -- so a phone could not reach Get started,
  // the leaderboard, the matches or the book from the bar at all. A Menu button opens the same
  // nav as a panel under the bar, with the signed-in links folded in; it closes on navigation,
  // since a tap on a link is the end of the menu's job.
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setOpen(false)
  }, [location.pathname, location.search])

  return (
    <header className="site-bar">
      <div className="wrap">
        <Link className="brand" to={href('/')}>
          <Logo />
          <span className="wordmark">
            tiny<span>brains</span>
          </span>
        </Link>
        <nav className={cx('site-nav', open && 'open')} id="site-nav" aria-label="Site">
          {/* The conversion page gets a slot: it was reachable only from the hero and the footer. */}
          <NavLink to="/start" className={nav === 'start' ? 'on' : undefined}>
            Get started
          </NavLink>
          <NavLink to={href('/leaderboard')} className={nav === 'leaderboard' ? 'on' : undefined}>
            Leaderboard
          </NavLink>
          <NavLink to={href('/matches')} className={nav === 'matches' ? 'on' : undefined}>
            Matches
          </NavLink>
          {/* The book is served beside this application, so the link is a navigation, not a
              route: the SPA's /docs/* only answers on a deployment that mounted no book. */}
          <a href="/docs" className={nav === 'docs' ? 'on' : undefined}>
            Docs
          </a>
          {/* Only drawn inside the phone menu: on a wide bar these are the buttons beside the avatar. */}
          {me ? (
            <div className="nav-me">
              <Link to="/models">
                Your models
                {me.candidates.length > 0 ? ` · ${me.candidates.length} in admission` : ''}
              </Link>
              <Link to={href('/submit')}>Submit a version</Link>
              <Link to={`/profile/${me.handle}`}>Your profile · @{me.handle}</Link>
            </div>
          ) : null}
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
              {/* One flex item beside the icon; the tail is hidden on a phone. */}
              <span>
                Sign in<span className="long"> with GitHub</span>
              </span>
            </button>
          )}
        </div>
        <button
          type="button"
          className={cx('btn nav-toggle', open && 'on')}
          aria-expanded={open}
          aria-controls="site-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
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
      <Link className="btn on-wide" to="/models">
        Your models
      </Link>
      <Link className="btn primary on-wide" to={href('/submit')}>
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
      ['Questions people ask first', '/faq'],
      ['Connect your model', '/docs/models/adapters'],
      ['Weight classes', '/docs/models/weight-classes'],
      ['Test before you submit', '/docs/models/testing'],
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
  // Where the project lives. Ten repositories, all public, under one organisation; the
  // licence is the same in each, so one copy is linked.
  [
    'Project',
    [
      ['What’s new', '/changelog'],
      ['Source on GitHub', 'https://github.com/Tiny-Brains'],
      ['The starter', 'https://github.com/Tiny-Brains/ants-starter'],
      ['The baselines', 'https://github.com/Tiny-Brains/ants-baselines'],
      ['Contributing', '/docs/platform/contributing'],
      ['Licence · Apache-2.0', 'https://github.com/Tiny-Brains/web/blob/main/LICENSE'],
    ],
  ],
]

/** A footer link: routed when it is a page of this application, a plain navigation for the book
 *  (served beside the app) and for anything on another host. */
function FootLink({ label, to }: { label: string; to: string }) {
  if (to.startsWith('http'))
    return (
      <a href={to} rel="noopener">
        {label} ↗
      </a>
    )
  if (to.startsWith('/docs')) return <a href={to}>{label}</a>
  return <Link to={to}>{label}</Link>
}

function Footer() {
  const { season, gameName } = usePlatform()
  const [theme, setTheme] = useTheme()

  return (
    <footer>
      <div className="wrap">
        {FOOTER.map(([heading, links]) => (
          <div className="col" key={heading}>
            <strong>{heading}</strong>
            {links.map(([label, to]) => (
              <FootLink label={label} to={to} key={to} />
            ))}
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
