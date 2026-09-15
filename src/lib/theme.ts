// Dark or light, chosen by the reader — and until they choose, by their system.
//
// The tokens ship both palettes and `data-theme` on <html> selects one. THE ATTRIBUTE IS ALWAYS
// SET, by `initTheme()` before the first paint, so there is exactly one mechanism deciding the
// palette: a `prefers-color-scheme` block in the stylesheet as well would be a second, and the two
// would eventually disagree. With no JavaScript at all the tokens' own default stands, which is
// dark.
//
// A STORED CHOICE OUTRANKS THE SYSTEM, and nothing else does: before one is made the page follows
// the system, including while it is open; after one is made it stops following, because a reader
// who picked light did not ask to be moved at sunset.

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'tb.theme'

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light' ? v : null
  } catch {
    // Reading storage can throw outright, not only return null.
    return null
  }
}

function query(): MediaQueryList | null {
  try {
    return window.matchMedia('(prefers-color-scheme: light)')
  } catch {
    // No matchMedia (a very old engine, a hostile embedding): the tokens' default stands.
    return null
  }
}

/** What the reader has asked for, by choice or by system setting. */
function preferred(): Theme {
  return stored() ?? (query()?.matches ? 'light' : 'dark')
}

/** Called before the first paint, so a reader whose system is light does not get a dark flash —
 *  which is exactly what they used to get, every time, until they found the footer's toggle. */
export function initTheme(): void {
  document.documentElement.dataset.theme = preferred()
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState<Theme>(preferred)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Follow the system while nothing has been chosen, and never after.
  useEffect(() => {
    const mq = query()
    if (!mq) return
    const follow = (e: MediaQueryListEvent) => {
      if (stored()) return
      set(e.matches ? 'light' : 'dark')
    }
    mq.addEventListener('change', follow)
    return () => mq.removeEventListener('change', follow)
  }, [])

  const choose = useCallback((t: Theme) => {
    set(t)
    try {
      localStorage.setItem(KEY, t)
    } catch {
      // Not remembering is a smaller failure than not switching.
    }
  }, [])

  return [theme, choose]
}
