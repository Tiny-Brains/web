// Dark or light, remembered.
//
// The tokens ship both palettes and `data-theme="light"` on <html> is what
// selects the second one. In the layout studies this switch was review chrome;
// in the application it is the one piece of it that is real, because nothing
// else would let a reader reach the light palette at all.

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'tb.theme'

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light' ? v : null
  } catch {
    // A browser that refuses storage still gets a working switch, it just does
    // not remember. Reading it can throw outright, not only return null.
    return null
  }
}

/** Dark is the default, and the tokens declare it, so an unset preference needs
 *  no attribute at all. */
export function initTheme(): void {
  const t = stored()
  if (t) document.documentElement.dataset.theme = t
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState<Theme>(() => stored() ?? 'dark')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

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
