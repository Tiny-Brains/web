// The announcement stack: under the bar, on every page, one line per live announcement, newest at
// the top. Its kind picks the colour and the icon (a closed list of four), and a dismissable one
// has a close the browser remembers; a sticky one stays until an admin disables it. One with an end
// time leaves at that time on Soma's side: the route lists only the live ones.
//
// Every page draws its own Shell, so this mounts on every navigation. The list is read once and
// kept for a minute (lib/announcements.ts), not re-read per page; an admin's write forgets it.

import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import type { Announcement, AnnouncementKind } from '../api'
import { keptAnnouncements, readAnnouncements } from '../lib/announcements'
import { Icon, type IconId } from './ui'
import common from '../../copy/common.json'

const T = common.shell.announcements
const KEY = 'tb.announcements.dismissed'

const ICON: Record<AnnouncementKind, IconId> = {
  notice: 'i-megaphone',
  season: 'i-calendar',
  maintenance: 'i-clock',
  incident: 'i-alert',
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
  const [list, setList] = useState<Announcement[]>(keptAnnouncements)
  const [gone, setGone] = useState<Set<string>>(dismissed)

  useEffect(() => {
    let live = true
    void readAnnouncements().then((l) => {
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

  // THE STACK'S HEIGHT IS A CSS VARIABLE, --site-anns-h, so a page that sizes itself to the first
  // screen (the watch page's player) leaves room for it in CSS, however late the list arrives.
  const stack = useRef<HTMLDivElement>(null)
  const any = shown.length > 0
  useEffect(() => {
    const root = document.documentElement
    const el = stack.current
    if (!el || typeof ResizeObserver === 'undefined') {
      root.style.setProperty('--site-anns-h', `${el?.offsetHeight ?? 0}px`)
      return
    }
    const seen = new ResizeObserver(() => root.style.setProperty('--site-anns-h', `${el.offsetHeight}px`))
    seen.observe(el)
    return () => {
      seen.disconnect()
      root.style.setProperty('--site-anns-h', '0px')
    }
  }, [any])

  if (!any) return null
  return (
    <div className="site-anns" role="region" aria-label={T.label} ref={stack}>
      {shown.map((a) => (
        <div className={`site-ann ${a.kind}`} key={a.id} role={a.kind === 'incident' ? 'alert' : undefined}>
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
