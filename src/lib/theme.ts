// Dark or light, remembered. The tokens ship both palettes and
// `data-theme="light"` on <html> is what selects the second one.

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

/** Dark is the default and the tokens declare it, so an unset preference needs no
 *  attribute. Called before the first paint so a reader who chose light does not
 *  get a dark flash. */
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
