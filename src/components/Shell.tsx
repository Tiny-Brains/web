// The shell: a two-row header, the footer, and the toasts. Every page renders inside it.
//
//   nav     which primary section is current
//   title   the page's own part of the document title
//   scoped  whether the page is about the selected game and season (the title then says which)
//   season  on a page about one match, model or version: the slug of the season that thing belongs
//           to, which the scope switcher shows instead of the selection
//
// Five parts, each with one job. The header's nav gets you to a section. The scope switcher sets
// the game and season, which live in the query string and ride on every link. Breadcrumbs, drawn
// by each page's header, take you up a level. The account menu holds everything personal, and is
// the one place admin pages are linked from. The footer holds the rest.

import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, type ReactNode } from 'react'
import { startGitHubSignIn, type Season } from '../api'
import { useSession } from '../providers/session-context'
import { usePlatform } from '../providers/platform-context'
import { useNotifications } from '../providers/notifications-context'
import { useSelection } from '../lib/selection'
import { usePopover } from '../lib/usePopover'
import { useTheme } from '../lib/theme'
import { daysUntil } from '../lib/format'
import { cx } from '../lib/cx'
import { Icon, IconLabel, Rich, Sprite, type IconId } from './ui'
import { Logo } from './Logo'
import { Avatar } from './Avatar'
import { SeasonBadge } from './Model'
import { InProgress, NotificationList, Toast } from './Notifications'
import { count, fill } from '../lib/copy'
import common from '../../copy/common.json'

const T = common.shell

export type Nav = 'leaderboard' | 'matches' | null

export function Shell({
  nav = null,
  title,
  scoped = false,
  season,
  children,
}: {
  nav?: Nav
  title?: string
  scoped?: boolean
  season?: string
  children: ReactNode
}) {
  useDocumentTitle(title, scoped)
  return (
    <>
      {/* First in the tab order and invisible until focused; <main> takes the focus it jumps to. */}
      <a className="skip" href="#main">
        {T.skip}
      </a>
      <Sprite />
      <TopBar nav={nav} season={season} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer />
      <Toasts />
    </>
  )
}

/** The page's part, then the game and season when the page is about them, then the site. */
function useDocumentTitle(title: string | undefined, scoped: boolean) {
  const { season, gameName } = usePlatform()
  const where = scoped && season ? `${gameName} ${season.name}` : null
  const text = [title, where, common.site.name].filter(Boolean).join(' · ')
  useEffect(() => {
    document.title = text
  }, [text])
}

const NAV: [Exclude<Nav, null>, string, string, IconId][] = [
  ['leaderboard', T.nav.leaderboard, '/leaderboard', 'i-leaderboard'],
  ['matches', T.nav.matches, '/matches', 'i-matches'],
]

// One row. On the left, the brand and beside it which game and season you are looking at; on the
// right, where to go (an icon over its word) and who you are.
function TopBar({ nav, season }: { nav: Nav; season?: string }) {
  const { me, session } = useSession()
  const { href } = useSelection()
  return (
    <header className="site-bar">
      <div className="wrap">
        <Link className="site-brand" to={href('/')} aria-label={T.brandLabel}>
          <Logo />
          <span>
            <Rich text={common.site.wordmark} />
          </span>
        </Link>
        <ScopeSwitcher season={season} />
        <nav className="site-nav" aria-label={T.navLabel}>
          {NAV.map(([key, label, path, icon]) => (
            <Link to={href(path)} aria-current={nav === key ? 'page' : undefined} key={key}>
              <Icon id={icon} />
              <span>{label}</span>
            </Link>
          ))}
          {/* Getting started is the book, which is not this application: a plain navigation, in a
              new tab, and it says so. */}
          <a href="/docs" target="_blank" rel="noopener">
            <Icon id="i-book" />
            <span>
              {T.nav.docs}
              <Icon id="i-ext" label={T.nav.newTab} />
            </span>
          </a>
        </nav>
        <div className="site-end">
          {session.state === 'loading' ? (
            <span className="skel bar-skel" aria-hidden="true" />
          ) : me ? (
            <>
              <Link className="btn primary on-tablet" to={href('/submit')}>
                <Icon id="i-plus" />
                {T.submit}
              </Link>
              <NotificationBell />
              <AccountMenu />
            </>
          ) : (
            <button className="btn" type="button" onClick={startGitHubSignIn}>
              <Icon id="i-github" />
              <span>
                {T.signIn}
                <span className="on-tablet"> {T.signInTail}</span>
              </span>
            </button>
          )}
          <PhoneMenu />
        </div>
      </div>
    </header>
  )
}

// ---- the scope switcher -------------------------------------------------------------------

const LIST_PAGES = new Set(['/', '/leaderboard', '/matches', '/maps'])

/** Two pickers joined into one control: the game, then the season with its state. */
function ScopeSwitcher({ season: pinned }: { season?: string }) {
  const { games, seasons, season, slug, gameName } = usePlatform()
  const { game, explicitGame } = useSelection()
  const location = useLocation()
  const navigate = useNavigate()
  const gameRoot = useRef<HTMLDivElement>(null)
  const gameButton = useRef<HTMLButtonElement>(null)
  const gamePop = usePopover(gameRoot, gameButton)
  const seasonRoot = useRef<HTMLDivElement>(null)
  const seasonButton = useRef<HTMLButtonElement>(null)
  const seasonPop = usePopover(seasonRoot, seasonButton)
  const shown = pinned !== undefined ? (seasons.find((s) => s.slug === pinned) ?? null) : season
  const live = seasons.find((s) => s.state === 'open') ?? null

  // A list page keeps its page and its filters for the new choice; any other page belongs to one
  // season or none, so a new choice goes to that season's home.
  const go = (nextGame: string, next: string | null) => {
    const onList = LIST_PAGES.has(location.pathname)
    const q = new URLSearchParams(onList ? location.search : '')
    q.delete('cursor')
    if (nextGame !== 'ants' || explicitGame) q.set('game', nextGame)
    else q.delete('game')
    if (nextGame !== game) q.delete('season')
    if (next === null || (live && next === live.slug)) q.delete('season')
    else q.set('season', next)
    const s = q.toString()
    navigate(`${onList ? location.pathname : '/'}${s ? `?${s}` : ''}`)
  }

  const when = (s: Season) => {
    if (s.state === 'closed') return fill(T.scope.closed, { date: shortDate(s.closed_at) })
    if (s.state === 'scheduled') return fill(T.scope.scheduled, { date: shortDate(s.submissions_open_at) })
    const left = daysUntil(s.submissions_close_at)
    return left !== null && left >= 0 ? count(T.scope.daysLeft, left) : fill(T.scope.closes, { date: shortDate(s.submissions_close_at) })
  }

  return (
    <div className="site-scope">
      <div className="site-pop" ref={gameRoot}>
        <button
          ref={gameButton}
          type="button"
          className="site-scope-btn"
          aria-label={fill(T.scope.gameLabel, { game: gameName })}
          aria-haspopup="true"
          aria-expanded={gamePop.open}
          onClick={gamePop.toggle}
        >
          <Icon id="i-game" />
          <b>{gameName}</b>
          <Icon id="i-chevron" />
        </button>
        {gamePop.open ? (
          <div className="site-pop-panel">
            <div className="site-pop-h">{T.scope.gameHeading}</div>
            {(games.length ? games : [{ id: slug, name: gameName }]).map((g) => (
              <button className="site-pop-i" type="button" aria-current={g.id === slug} onClick={() => go(g.id, null)} key={g.id}>
                <Icon id="i-game" />
                {g.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="site-pop" ref={seasonRoot}>
        <button
          ref={seasonButton}
          type="button"
          className="site-scope-btn"
          aria-label={shown ? fill(T.scope.seasonLabel, { season: shown.name, state: shown.state, when: when(shown) }) : T.scope.seasonHeading}
          title={shown ? fill(T.scope.seasonTitle, { season: shown.name, when: when(shown) }) : undefined}
          aria-haspopup="true"
          aria-expanded={seasonPop.open}
          onClick={seasonPop.toggle}
          disabled={seasons.length === 0}
        >
          <Icon id="i-calendar" />
          {shown ? (
            <>
              <span className="site-season">{shown.name}</span>
              <SeasonBadge state={shown.state} />
            </>
          ) : (
            <span>{T.scope.seasonHeading}</span>
          )}
          <Icon id="i-chevron" />
        </button>
        {seasonPop.open ? (
          <div className="site-pop-panel">
            <div className="site-pop-h">{T.scope.seasonHeading}</div>
            {seasons.map((s) => (
              <button
                className="site-pop-i"
                type="button"
                aria-current={s.slug === shown?.slug}
                disabled={s.state === 'scheduled'}
                onClick={() => go(slug, s.slug)}
                key={s.slug}
              >
                {s.name} <SeasonBadge state={s.state} />
                <small>{when(s)}</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function shortDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ---- the account menu, the bell, the phone menu -------------------------------------------

function AccountMenu() {
  const { me, signOut } = useSession()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const pop = usePopover(root, button)
  const navigate = useNavigate()
  if (!me) return null
  const admin = me.role === 'admin'
  return (
    <div className="site-pop" ref={root}>
      <button ref={button} type="button" className="site-avatar-btn" aria-label={fill(T.account.label, { handle: me.handle })} aria-haspopup="true" aria-expanded={pop.open} onClick={pop.toggle}>
        <Avatar handle={me.handle} name={me.display_name} />
      </button>
      {pop.open ? (
        <div className="site-pop-panel right">
          <div className="site-pop-who">
            <b>{me.display_name ?? fill(T.account.handle, { handle: me.handle })}</b>
            <small>{fill(admin ? T.account.handleAdmin : T.account.handle, { handle: me.handle })}</small>
          </div>
          <div className="site-pop-sep" />
          <PersonalLinks />
          {admin ? <AdminLinks /> : null}
          <div className="site-pop-sep" />
          <button
            className="site-pop-i"
            type="button"
            onClick={() => {
              void signOut().then(() => navigate('/'))
            }}
          >
            {T.account.signOut}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function PersonalLinks() {
  const { me } = useSession()
  const { unread } = useNotifications()
  if (!me) return null
  const inFlight = me.candidates.length
  return (
    <>
      <Link className="site-pop-i" to="/me">
        {T.account.models}
        {inFlight ? <small>{fill(T.account.modelsInProgress, { n: inFlight })}</small> : null}
      </Link>
      <Link className="site-pop-i" to="/me/notifications">
        {T.account.notifications}
        {unread ? <small>{fill(T.account.notificationsUnread, { n: unread })}</small> : null}
      </Link>
      <Link className="site-pop-i" to="/submit">
        {T.account.submit}
      </Link>
      <Link className="site-pop-i" to={`/profile/${me.handle}`}>
        {T.account.profile}
      </Link>
      <Link className="site-pop-i" to="/me/account">
        {T.account.account}
      </Link>
    </>
  )
}

function AdminLinks() {
  return (
    <>
      <div className="site-pop-sep" />
      <div className="site-pop-h">{T.account.adminHeading}</div>
      <Link className="site-pop-i" to="/admin/seasons">
        <Icon id="i-calendar" />
        {T.account.adminSeasons}
      </Link>
      <Link className="site-pop-i" to="/admin/runners">
        <Icon id="i-server" />
        {T.account.adminRunners}
      </Link>
      <Link className="site-pop-i" to="/admin/users">
        <Icon id="i-key" />
        {T.account.adminUsers}
      </Link>
    </>
  )
}

function NotificationBell() {
  const { me } = useSession()
  const { state, latest, unread, markRead, markAllRead } = useNotifications()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const pop = usePopover(root, button)
  const candidates = me?.candidates ?? []
  return (
    <div className="site-pop spans" ref={root}>
      <button
        ref={button}
        type="button"
        className="site-bell"
        aria-label={unread ? fill(T.bell.labelUnread, { n: unread }) : T.bell.label}
        aria-haspopup="true"
        aria-expanded={pop.open} onClick={pop.toggle}
      >
        <Icon id="i-bell" />
        {unread ? <span className="site-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span> : null}
      </button>
      {pop.open ? (
        <div className="site-pop-panel right site-ntf-panel">
          <div className="site-ntf-head">
            <b>{T.bell.title}</b>
            {unread ? (
              <button className="btn sm ghost" type="button" onClick={() => void markAllRead()}>
                {T.bell.markAll}
              </button>
            ) : null}
          </div>
          {candidates.length ? (
            <>
              <div className="site-pop-h">{T.bell.inProgress}</div>
              <InProgress candidates={candidates} />
            </>
          ) : null}
          <div className="site-pop-h">{T.bell.latest}</div>
          {state === 'unavailable' ? (
            <p className="empty">{T.bell.failed}</p>
          ) : state === 'loading' ? (
            <div className="loading" aria-label={T.bell.loading}>
              <div className="skel" />
              <div className="skel" />
            </div>
          ) : latest.length === 0 ? (
            <p className="empty">{T.bell.empty}</p>
          ) : (
            <NotificationList items={latest.slice(0, 5)} onOpen={(n) => void markRead([n.id])} />
          )}
          <Link className="site-ntf-all" to="/me/notifications">
            {T.bell.seeAll}
          </Link>
        </div>
      ) : null}
    </div>
  )
}

/** Below 1000px the nav links fold in here, with the personal and admin links under them. */
function PhoneMenu() {
  const { me } = useSession()
  const { href } = useSelection()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const pop = usePopover(root, button)
  return (
    <div className="site-pop spans site-menu" ref={root}>
      <button ref={button} type="button" className="btn" aria-label={T.menuLabel} aria-haspopup="true" aria-expanded={pop.open} onClick={pop.toggle}>
        <Icon id="i-menu" />
      </button>
      {pop.open ? (
        <div className="site-pop-panel right">
          {NAV.map(([key, label, path, icon]) => (
            <Link className="site-pop-i" to={href(path)} key={key}>
              <Icon id={icon} />
              {label}
            </Link>
          ))}
          <a className="site-pop-i" href="/docs" target="_blank" rel="noopener">
            <Icon id="i-book" />
            {T.nav.docs}
            <Icon id="i-ext" label={T.nav.newTab} />
          </a>
          {me ? (
            <>
              <div className="site-pop-sep" />
              <PersonalLinks />
              {me.role === 'admin' ? <AdminLinks /> : null}
            </>
          ) : (
            <>
              <div className="site-pop-sep" />
              <button className="site-pop-i" type="button" onClick={startGitHubSignIn}>
                <Icon id="i-github" />
                {T.signInFull}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

// ---- toasts and the footer ----------------------------------------------------------------

function Toasts() {
  const { arrived, dismiss } = useNotifications()
  useEffect(() => {
    if (arrived.length === 0) return
    const oldest = arrived[arrived.length - 1]
    const t = window.setTimeout(() => dismiss(oldest.id), 12_000)
    return () => window.clearTimeout(t)
  }, [arrived, dismiss])
  if (arrived.length === 0) return null
  return (
    <div className="site-toasts">
      {arrived.map((n) => (
        <Toast n={n} onDismiss={() => dismiss(n.id)} key={n.id} />
      ))}
    </div>
  )
}

function FootLink({ label, to }: { label: string; to: string }) {
  const { href } = useSelection()
  if (to.startsWith('http'))
    return (
      <a href={to} rel="noopener">
        {label}
        <Icon id="i-ext" label={T.footer.external} />
      </a>
    )
  if (to.startsWith('/docs')) return <a href={to}>{label}</a>
  if (to === '/leaderboard' || to === '/matches')
    return (
      <Link to={href(to)}>
        <IconLabel icon={to === '/leaderboard' ? 'i-leaderboard' : 'i-matches'}>{label}</IconLabel>
      </Link>
    )
  return <Link to={to}>{label}</Link>
}

function Footer() {
  const { season, gameName } = usePlatform()
  const [theme, setTheme] = useTheme()
  return (
    <footer className="site-foot">
      <div className="wrap">
        <div className="site-foot-grid">
          <div className="site-foot-brand">
            <Link className="site-brand" to="/">
              <Logo />
              <span>
                <Rich text={common.site.wordmark} />
              </span>
            </Link>
            <p>{T.footer.tagline}</p>
            <div className="seg" role="group" aria-label={T.footer.theme}>
              <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
                {T.footer.dark}
              </button>
              <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
                {T.footer.light}
              </button>
            </div>
          </div>
          {T.footer.columns.map(({ heading, links }) => (
            <div className="site-foot-col" key={heading}>
              <h4>{heading}</h4>
              {links.map(({ label, to }) => (
                <FootLink label={label} to={to} key={to} />
              ))}
            </div>
          ))}
        </div>
        <div className={cx('site-foot-end')}>
          <span>{season ? fill(T.footer.bottomSeason, { game: gameName, season: season.name }) : T.footer.bottom}</span>
          <Link to="/status">{T.footer.status}</Link>
        </div>
      </div>
    </footer>
  )
}
