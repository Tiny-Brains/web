// The shell: a 56px bar, the announcements under it, the guide beside the page, the one-line
// footer, and on a phone the drawer and the tab bar. Every page renders inside it.
//
//   nav      which guide item is current, when the address does not say (it usually does)
//   title    the page's own part of the document title
//   scoped   whether the page is about the selected game and season (the title then says which)
//   season   on a page about one match, model or version: the slug of the season that thing belongs
//            to, which the scope switcher shows instead of the selection
//   rail     the guide folds to its icon rail whatever the reader chose (the watch page)
//   reading  the page keeps a reading measure instead of running fluid (a post, account, submit)
//   learn    the Learn pages' shared column, wider than a reading page (Get started, FAQ, changelog,
//            credits)
//
// Ways around, each with one job. The guide gets you to a section, and below 1000px it is the
// drawer, and below 760px the tab bar carries its first four. The scope switcher sets the game and
// season, which live in the query string and ride on every link. Breadcrumbs, drawn by each page's
// header, take you up a level. The account menu holds everything personal and the admin desk. The
// footer holds the rest. Discord and GitHub, the two ways off the site to a person, close the guide.

import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { startGitHubSignIn, type Season } from '../api'
import { useSession } from '../providers/session-context'
import { usePlatform } from '../providers/platform-context'
import { useNotifications } from '../providers/notifications-context'
import { useSelection } from '../lib/selection'
import { usePopover } from '../lib/usePopover'
import { useTheme, type ThemeChoice } from '../lib/theme'
import { daysUntil } from '../lib/format'
import { cx } from '../lib/cx'
import { Icon, Rich, Sprite, type IconId } from './ui'
import { Logo } from './Logo'
import { Avatar } from './Avatar'
import { SeasonBadge } from './Model'
import { Announcements } from './Announcements'
import { InProgress, NotificationList, Toast } from './Notifications'
import { count, fill } from '../lib/copy'
import common from '../../copy/common.json'

const T = common.shell
const G = T.guide
const C = common.community

export type Nav =
  | 'home' | 'matches' | 'leaderboard' | 'maps' | 'stories'
  | 'models' | 'notifications' | 'start' | 'faq' | 'admin'
  | null

export function Shell({
  nav,
  title,
  scoped = false,
  season,
  rail = false,
  reading = false,
  learn = false,
  children,
}: {
  nav?: Nav
  title?: string
  scoped?: boolean
  season?: string
  rail?: boolean
  reading?: boolean
  learn?: boolean
  children: ReactNode
}) {
  useDocumentTitle(title, scoped)
  const here = useCurrent(nav)
  const [folded, toggleFold] = useGuideFold()
  const [drawer, setDrawer] = useState(false)
  const location = useLocation()
  // Following a link is the end of the drawer's job.
  const at = `${location.pathname}${location.search}`
  const [openedAt, setOpenedAt] = useState(at)
  const drawerOpen = drawer && openedAt === at
  const closeDrawer = useCallback(() => setDrawer(false), [])

  const toggle = () => {
    if (window.matchMedia('(max-width: 1000px)').matches) {
      setOpenedAt(at)
      setDrawer((d) => !d)
    } else toggleFold()
  }

  return (
    <>
      {/* First in the tab order and invisible until focused; <main> takes the focus it jumps to. */}
      <a className="skip" href="#main">
        {T.skip}
      </a>
      <Sprite />
      <TopBar season={season} onToggle={toggle} drawerOpen={drawerOpen} />
      <div className={cx('site-frame', (rail || folded) && 'rail')}>
        <nav className="site-guide" aria-label={T.guideLabel}>
          <Guide here={here} />
        </nav>
        <div className="site-main">
          <Announcements />
          <main id="main" tabIndex={-1} className={cx(reading && 'reading', learn && 'learn')}>
            {children}
          </main>
          <Footer />
        </div>
      </div>
      {drawerOpen ? <Drawer here={here} season={season} onClose={closeDrawer} /> : null}
      <TabBar here={here} />
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

/** Which guide item the address is under. A page may say otherwise with `nav`. */
function useCurrent(nav: Nav | undefined): Nav {
  const { pathname } = useLocation()
  const { me } = useSession()
  if (nav !== undefined) return nav
  if (pathname === '/') return 'home'
  if (pathname.startsWith('/matches')) return 'matches'
  if (pathname.startsWith('/leaderboard')) return 'leaderboard'
  if (pathname.startsWith('/maps')) return 'maps'
  if (pathname.startsWith('/blog')) return 'stories'
  if (pathname === '/me/notifications') return 'notifications'
  if (pathname === '/me' || (me && pathname === `/profile/${me.handle}`)) return 'models'
  if (pathname.startsWith('/start')) return 'start'
  if (pathname.startsWith('/faq')) return 'faq'
  if (pathname.startsWith('/admin')) return 'admin'
  return null
}

// ---- the guide's fold ---------------------------------------------------------------------

const FOLD_KEY = 'tb.guide'
const WIDE = '(min-width: 1280px)'

function storedFold(): boolean | null {
  try {
    const v = localStorage.getItem(FOLD_KEY)
    return v === 'rail' ? true : v === 'full' ? false : null
  } catch {
    return null
  }
}

function widthFold(): boolean {
  try {
    return !window.matchMedia(WIDE).matches
  } catch {
    return false
  }
}

/** THE WIDTH SETS THE DEFAULT AND THE READER'S TOGGLE WINS OVER IT: the full guide from 1280px, the
 *  rail below, until the toggle is pressed, and from then on what it was left at. */
function useGuideFold(): [boolean, () => void] {
  const [chosen, setChosen] = useState<boolean | null>(storedFold)
  const [byWidth, setByWidth] = useState(widthFold)

  useEffect(() => {
    let mq: MediaQueryList
    try {
      mq = window.matchMedia(WIDE)
    } catch {
      return
    }
    const follow = (e: MediaQueryListEvent) => setByWidth(!e.matches)
    mq.addEventListener('change', follow)
    return () => mq.removeEventListener('change', follow)
  }, [])

  const folded = chosen ?? byWidth
  const toggle = useCallback(() => {
    const next = !folded
    setChosen(next)
    try {
      localStorage.setItem(FOLD_KEY, next ? 'rail' : 'full')
    } catch {
      // Not remembering is a smaller failure than not folding.
    }
  }, [folded])
  return [folded, toggle]
}

// ---- the bar ------------------------------------------------------------------------------

function TopBar({ season, onToggle, drawerOpen }: { season?: string; onToggle: () => void; drawerOpen: boolean }) {
  const { me, session } = useSession()
  const { href } = useSelection()
  return (
    <header className="site-bar">
      <button
        className="icon-btn site-toggle"
        type="button"
        aria-label={T.guideToggle}
        aria-expanded={drawerOpen || undefined}
        onClick={onToggle}
      >
        <Icon id="i-menu" />
      </button>
      <Link className="site-brand" to={href('/')} aria-label={T.brandLabel}>
        <Logo />
        <span>
          <Rich text={common.site.wordmark} />
        </span>
      </Link>
      <ScopeSwitcher season={season} />
      <div className="site-end">
        {session.state === 'loading' ? (
          <span className="skel bar-skel" aria-hidden="true" />
        ) : me ? (
          <>
            <Link className="btn primary site-submit" to={href('/submit')} title={T.submit}>
              <Icon id="i-plus" />
              <span>{T.submit}</span>
            </Link>
            <NotificationBell />
            <AccountMenu />
          </>
        ) : (
          <button className="btn" type="button" onClick={startGitHubSignIn}>
            <Icon id="i-github" />
            <span>{T.signIn}</span>
          </button>
        )}
      </div>
    </header>
  )
}

// ---- the guide, beside the page and in the drawer -----------------------------------------

type Item = { key: Exclude<Nav, null>; label: string; to: string; icon: IconId; scoped?: boolean }

const MAIN: Item[] = [
  { key: 'home', label: G.home, to: '/', icon: 'i-home', scoped: true },
  { key: 'matches', label: G.matches, to: '/matches', icon: 'i-matches', scoped: true },
  { key: 'leaderboard', label: G.leaderboard, to: '/leaderboard', icon: 'i-leaderboard', scoped: true },
  { key: 'maps', label: G.maps, to: '/maps', icon: 'i-map', scoped: true },
  { key: 'stories', label: G.stories, to: '/blog', icon: 'i-post' },
]

const YOU: Item[] = [
  { key: 'models', label: G.models, to: '/me', icon: 'i-user' },
  { key: 'notifications', label: G.notifications, to: '/me/notifications', icon: 'i-bell' },
]

const LEARN: Item[] = [
  { key: 'start', label: G.start, to: '/start', icon: 'i-flask' },
  { key: 'faq', label: G.faq, to: '/faq', icon: 'i-info' },
]

const COMMUNITY: [string, string, IconId][] = [
  [C.discord.href, C.discord.word, 'i-discord'],
  [C.github.href, C.github.word, 'i-github'],
]

function Guide({ here }: { here: Nav }) {
  const { me } = useSession()
  const { href } = useSelection()
  const { unread } = useNotifications()
  const item = (i: Item) => (
    <Link to={i.scoped ? href(i.to) : i.to} aria-current={here === i.key ? 'page' : undefined} title={i.label} key={i.key}>
      <Icon id={i.icon} />
      <span>{i.label}</span>
      {i.key === 'notifications' && unread ? <small className="site-guide-count">{unread > 99 ? '99+' : unread}</small> : null}
    </Link>
  )
  const out = (to: string, label: string, icon: IconId) => (
    <a href={to} target="_blank" rel="noopener" title={label} key={to}>
      <Icon id={icon} />
      <span>{label}</span>
      <Icon id="i-ext" className="site-guide-ext" label={G.newTab} />
    </a>
  )
  return (
    <>
      {MAIN.map(item)}
      {me ? (
        <>
          <hr />
          <h4>{G.you}</h4>
          {YOU.map(item)}
        </>
      ) : null}
      <hr />
      <h4>{G.learn}</h4>
      {LEARN.slice(0, 1).map(item)}
      {/* The book is not this application: a plain navigation, in a new tab, and it says so. */}
      {out('/docs', G.docs, 'i-book')}
      {LEARN.slice(1).map(item)}
      <hr />
      {COMMUNITY.map(([to, word, icon]) => out(to, word, icon))}
      {me?.role === 'admin' ? (
        <div className="site-guide-admin">
          <hr />
          {item({ key: 'admin', label: G.admin, to: '/admin', icon: 'i-shield' })}
        </div>
      ) : null}
    </>
  )
}

/** Below 1000px the guide opens over the page from the left, with the scope switcher at its top
 *  since the bar has no room for it. Escape and the scrim close it; a link closes it by moving. */
function Drawer({ here, season, onClose }: { here: Nav; season?: string; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    panel.current?.querySelector<HTMLElement>('a, button')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="site-drawer">
      <button className="site-scrim" type="button" aria-label={T.drawerClose} onClick={onClose} tabIndex={-1} />
      <nav className="site-guide" aria-label={T.guideLabel} ref={panel}>
        <div className="site-drawer-scope">
          <ScopeSwitcher season={season} />
        </div>
        <Guide here={here} />
      </nav>
    </div>
  )
}

/** Below 760px: the four places a phone goes most. You is your profile, or Sign in. */
function TabBar({ here }: { here: Nav }) {
  const { me } = useSession()
  const { href } = useSelection()
  const tab = (key: Nav, to: string, icon: IconId, label: string) => (
    <Link to={to} aria-current={here === key ? 'page' : undefined} key={label}>
      <Icon id={icon} />
      <span>{label}</span>
    </Link>
  )
  return (
    <nav className="site-tabs" aria-label={T.tabsLabel}>
      {tab('home', href('/'), 'i-home', T.tabs.home)}
      {tab('matches', href('/matches'), 'i-matches', T.tabs.matches)}
      {tab('leaderboard', href('/leaderboard'), 'i-leaderboard', T.tabs.leaderboard)}
      {me ? (
        tab('models', '/me', 'i-user', T.tabs.you)
      ) : (
        <button type="button" onClick={startGitHubSignIn}>
          <Icon id="i-github" />
          <span>{T.tabs.signIn}</span>
        </button>
      )}
    </nav>
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

// ---- the account menu and the bell --------------------------------------------------------

const THEMES: [ThemeChoice, string][] = [
  ['system', T.account.system],
  ['dark', T.account.dark],
  ['light', T.account.light],
]

function AccountMenu() {
  const { me, signOut } = useSession()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const pop = usePopover(root, button)
  const navigate = useNavigate()
  const [, setTheme, choice] = useTheme()
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
            <Avatar handle={me.handle} name={me.display_name} />
            <span>
              <b>{me.display_name ?? fill(T.account.handle, { handle: me.handle })}</b>
              <small>{fill(admin ? T.account.handleAdmin : T.account.handle, { handle: me.handle })}</small>
            </span>
          </div>
          <div className="site-pop-sep" />
          <Link className="site-pop-i" to="/me">
            <Icon id="i-user" />
            {T.account.profile}
          </Link>
          <Link className="site-pop-i" to="/me/account">
            <Icon id="i-settings" />
            {T.account.account}
          </Link>
          {admin ? (
            <Link className="site-pop-i" to="/admin">
              <Icon id="i-shield" />
              {T.account.admin}
            </Link>
          ) : null}
          <div className="site-pop-sep" />
          <div className="site-pop-h">{T.account.themeHeading}</div>
          <div className="seg site-pop-seg" role="group" aria-label={T.account.theme}>
            {THEMES.map(([t, word]) => (
              <button type="button" aria-pressed={choice === t} onClick={() => setTheme(t)} key={t}>
                {word}
              </button>
            ))}
          </div>
          <div className="site-pop-sep" />
          <button
            className="site-pop-i"
            type="button"
            onClick={() => {
              void signOut().then(() => navigate('/'))
            }}
          >
            <Icon id="i-x" />
            {T.account.signOut}
          </button>
        </div>
      ) : null}
    </div>
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
        aria-expanded={pop.open}
        onClick={pop.toggle}
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
            <NotificationList items={latest.slice(0, 8)} onOpen={(n) => void markRead([n.id])} />
          )}
          <Link className="site-ntf-all" to="/me/notifications">
            {T.bell.seeAll}
          </Link>
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

/** One line: the name, then the pages the guide has no room for. */
function Footer() {
  return (
    <footer className="site-foot">
      <span>{T.footer.name}</span>
      {T.footer.links.map(({ label, to }) =>
        to.startsWith('http') ? (
          <a href={to} rel="noopener" key={to}>
            {label}
            <Icon id="i-ext" label={T.footer.external} />
          </a>
        ) : to.startsWith('/docs') ? (
          <a href={to} key={to}>
            {label}
          </a>
        ) : (
          <Link to={to} key={to}>
            {label}
          </Link>
        ),
      )}
    </footer>
  )
}
