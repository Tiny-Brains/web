// The bell's feed: the newest few, the unread count, and what arrived since the page opened.
//
// POLLED, NOT STREAMED. Soma is an Orion package with no long-lived connection to hold, so the
// provider asks for anything created since the newest item it has seen, every POLL_MS, and only
// while the tab is visible. The first read fills the bell silently; anything a later read finds is
// new, arrives as a toast, and — if this browser allowed it and the kind's push setting is on — as
// a system notification while the tab is in the background. A notification to a closed tab needs
// Web Push, which nothing here does yet.
//
// The feed is kept with the id of the user it belongs to, so signing out, or in as someone else,
// reads as an empty feed at once rather than as the last person's.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, ApiError, type Notification, type NotificationCategory } from '../api'
import { useSession } from './session-context'
import { NotificationsContext, type NotificationsValue } from './notifications-context'

const POLL_MS = 30_000
const LATEST = 6
const TOASTS = 3

type Feed = {
  user: string | null
  state: NotificationsValue['state']
  latest: Notification[]
  unread: number
  arrived: Notification[]
}

const EMPTY: Feed = { user: null, state: 'off', latest: [], unread: 0, arrived: [] }

/** A system notification for a tab in the background, when the browser and the setting allow it. */
function pushToBrowser(items: Notification[], pushable: Set<NotificationCategory>) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return
  for (const n of items) {
    if (!pushable.has(n.category)) continue
    try {
      const shown = new Notification(n.subject, { body: n.description ?? undefined, tag: n.id, icon: '/logo-circuit.svg' })
      shown.onclick = () => {
        window.focus()
        if (n.link?.startsWith('/')) window.location.assign(n.link)
      }
    } catch {
      // Some browsers only allow notifications from a service worker; the toast still shows.
    }
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { me } = useSession()
  const userId = me?.id ?? null
  const [feed, setFeed] = useState<Feed>(EMPTY)
  const [nonce, setNonce] = useState(0)
  const newest = useRef<string | null>(null)
  const pushable = useRef(new Set<NotificationCategory>())

  useEffect(() => {
    if (!userId) return
    let live = true
    let first = true
    newest.current = null

    // Which kinds may reach the system tray; read once per sign-in, and again on refresh.
    api.notificationSettings().then(
      (s) => {
        pushable.current = new Set(s.settings.filter((x) => x.push).map((x) => x.category))
      },
      () => {
        pushable.current = new Set()
      },
    )

    const poll = async () => {
      if (!first && document.visibilityState === 'hidden' && typeof Notification !== 'undefined' && Notification.permission !== 'granted') return
      try {
        const page = await api.notifications({ since: first ? null : newest.current, limit: LATEST })
        if (!live) return
        const fresh = page.notifications
        if (fresh.length > 0) newest.current = fresh[0].created_at
        const wasFirst = first
        first = false
        setFeed((old) => {
          const base = old.user === userId ? old : { ...EMPTY, user: userId }
          if (wasFirst) return { ...base, state: 'ready', latest: fresh, unread: page.unread, arrived: [] }
          if (fresh.length === 0) return { ...base, state: 'ready', unread: page.unread }
          return {
            ...base,
            state: 'ready',
            unread: page.unread,
            latest: [...fresh, ...base.latest.filter((o) => !fresh.some((f) => f.id === o.id))].slice(0, LATEST),
            arrived: [...fresh, ...base.arrived].slice(0, TOASTS),
          }
        })
        if (!wasFirst) pushToBrowser(fresh, pushable.current)
      } catch (err) {
        if (!live) return
        // A Soma without the notification routes answers 404; the bell then stays quiet.
        const gone = err instanceof ApiError && (err.status === 404 || err.status === 401)
        setFeed((old) => (old.user === userId && old.state === 'ready' && !gone ? old : { ...EMPTY, user: userId, state: 'unavailable' }))
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      live = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId, nonce])

  const dismiss = useCallback((id: string) => setFeed((old) => ({ ...old, arrived: old.arrived.filter((n) => n.id !== id) })), [])

  const markRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    const now = new Date().toISOString()
    setFeed((old) => ({ ...old, latest: old.latest.map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: now } : n)) }))
    try {
      const { unread } = await api.markNotificationsRead({ ids })
      setFeed((old) => ({ ...old, unread }))
    } catch {
      // The next poll brings the true count back.
    }
  }, [])

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString()
    setFeed((old) => ({ ...old, unread: 0, latest: old.latest.map((n) => (n.read_at ? n : { ...n, read_at: now })) }))
    try {
      const { unread } = await api.markNotificationsRead({ all: true })
      setFeed((old) => ({ ...old, unread }))
    } catch {
      // As above.
    }
  }, [])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  const value = useMemo<NotificationsValue>(() => {
    const mine = userId && feed.user === userId ? feed : { ...EMPTY, state: userId ? ('loading' as const) : ('off' as const) }
    return { state: mine.state, latest: mine.latest, unread: mine.unread, arrived: mine.arrived, dismiss, markRead, markAllRead, refresh }
  }, [feed, userId, dismiss, markRead, markAllRead, refresh])

  return <NotificationsContext value={value}>{children}</NotificationsContext>
}
