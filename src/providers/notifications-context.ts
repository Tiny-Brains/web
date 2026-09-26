// Held apart from the provider that fills it, so a consumer imports no component.

import { createContext, use } from 'react'
import type { Candidate, Notification } from '../api'

export type NotificationsValue = {
  /** 'off' for a visitor; 'unavailable' when the API has no notifications to give. */
  state: 'off' | 'loading' | 'ready' | 'unavailable'
  /** The newest few, for the bell. */
  latest: Notification[]
  unread: number
  /** The caller's versions still in flight, read with the feed: Soma keeps them off /v1/me so that
   *  route can be served from its session entry. */
  candidates: Candidate[]
  /** Notifications that arrived while a page was open, shown as toasts until dismissed. */
  arrived: Notification[]
  dismiss: (id: string) => void
  markRead: (ids: string[]) => Promise<void>
  markAllRead: () => Promise<void>
  refresh: () => void
}

export const NotificationsContext = createContext<NotificationsValue | null>(null)

export function useNotifications(): NotificationsValue {
  const v = use(NotificationsContext)
  if (!v) throw new Error('useNotifications outside NotificationsProvider')
  return v
}
