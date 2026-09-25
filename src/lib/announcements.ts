// The live announcements, read once and kept for a minute across page loads: every page draws its
// own Shell, and the bar is on every one of them. An admin who publishes or disables one calls
// forgetAnnouncements(), so the bar they land on next reads the list again.

import { api, type Announcement } from '../api'

const FRESH_MS = 60_000

let kept: { at: number; list: Announcement[] } | null = null
let pending: Promise<Announcement[]> | null = null

export function readAnnouncements(): Promise<Announcement[]> {
  if (kept && Date.now() - kept.at < FRESH_MS) return Promise.resolve(kept.list)
  pending ??= api
    .announcements()
    .then((r) => {
      kept = { at: Date.now(), list: r.announcements }
      return r.announcements
    })
    .catch(() => kept?.list ?? [])
    .finally(() => {
      pending = null
    })
  return pending
}

export function keptAnnouncements(): Announcement[] {
  return kept?.list ?? []
}

export function forgetAnnouncements(): void {
  kept = null
}
