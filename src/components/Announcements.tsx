// The announcement stack: under the bar, on every page, one line per live announcement, newest at
// the top. Its kind picks the colour and the icon (a closed list of four), and a dismissable one
// has a close the browser remembers; a sticky one stays until an admin disables it. One with an end
// time leaves at that time on Soma's side: the route lists only the live ones.
//
// Every page draws its own Shell, so this mounts on every navigation. The list is read once and
// kept for a minute, not re-read per page.

import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api, type Announcement, type AnnouncementKind } from '../api'
import { Icon, type IconId } from './ui'
import common from '../../copy/common.json'

const T = common.shell.announcements
const KEY = 'tb.announcements.dismissed'
const FRESH_MS = 60_000

const ICON: Record<AnnouncementKind, IconId> = {
  notice: 'i-megaphone',
  season: 'i-calendar',
  maintenance: 'i-clock',
  incident: 'i-alert',
}

let kept: { at: number; list: Announcement[] } | null = null
let pending: Promise<Announcement[]> | null = null

function read(): Promise<Announcement[]> {
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

function dismissed(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function Announcements() {
  const [list, setList] = useState<Announcement[]>(() => kept?.list ?? [])
  const [gone, setGone] = useState<Set<string>>(dismissed)

  useEffect(() => {
    let live = true
    void read().then((l) => {
      if (live) setList(l)
    })
    return () => {
      live = false
    }
  }, [])

  const close = (id: string) => {
    const next = new Set(gone).add(id)
    setGone(next)
    try {
      // Only the ids still live are worth remembering, so the list cannot grow for ever.
      const liveIds = new Set(list.map((a) => a.id))
      localStorage.setItem(KEY, JSON.stringify([...next].filter((x) => liveIds.has(x))))
    } catch {
      // Not remembering costs the reader one more close.
    }
  }

  const shown = list.filter((a) => !(a.dismissable && gone.has(a.id)))
  if (shown.length === 0) return null
  return (
    <div className="site-anns" role="region" aria-label={T.label}>
      {shown.map((a) => (
        <div className={`site-ann ${a.kind}`} key={a.id}>
          <Icon id={ICON[a.kind]} label={T.kinds[a.kind]} />
          <span>
            {a.body}
            {a.link ? (
              a.link.startsWith('/') ? (
                <Link to={a.link}>{T.more}</Link>
              ) : (
                <a href={a.link} target="_blank" rel="noopener">
                  {T.more}
                </a>
              )
            ) : null}
          </span>
          {a.dismissable ? (
            <button className="icon-btn" type="button" aria-label={T.close} onClick={() => close(a.id)}>
              <Icon id="i-x" />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
