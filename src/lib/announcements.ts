// The live announcements, read once and kept for a minute across page loads.
//
// THE STACK IS MOUNTED WITH THE SHELL AND OUTLIVES EVERY PAGE, so this is no longer what stops a
// read per navigation — it is what stops one per RELOAD, per tab, and after the component is ever
// mounted a second time. An admin who publishes or disables one calls forgetAnnouncements(), so the
// next read is a fresh one rather than a minute-old list that does not have their change in it.

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
