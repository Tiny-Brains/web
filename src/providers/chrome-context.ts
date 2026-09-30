// What the shell says about the page inside it, held apart from the provider that fills it so a
// file that only reads the settings imports no component and fast refresh keeps working.
//
// THE SHELL OUTLIVES THE PAGE, WHICH IS WHY A PAGE CANNOT DRAW IT. The bar, the guide, the
// announcements, the footer and the toasts are mounted once, above the router; a page DECLARES what
// they should say (`components/Shell.tsx`) and the declaration lands in a LAYOUT effect, which React
// flushes before the browser paints. Declaring during render would be one component writing
// another's state mid-render — React's own error; declaring in a passive effect would show the
// reader a painted frame of the previous page's title and season.

import { createContext, use } from 'react'

/** Which guide item is current when the address does not say. `undefined` means "read the address",
 *  which is the usual case; `null` means "none of them". */
export type Nav =
  | 'home' | 'matches' | 'leaderboard' | 'maps' | 'stories'
  | 'models' | 'notifications' | 'start' | 'faq' | 'admin' | 'season-admin'
  | null

export type Chrome = {
  nav?: Nav
  /** The page's own part of the document title. */
  title?: string
  /** Whether the page is about the selected game and season: the title then says which. */
  scoped: boolean
  /** On a page about one match, model or version, the slug of the season that thing belongs to —
   *  what the scope switcher shows instead of the selection. */
  season?: string
}

/** Before any page has spoken: the site's own name in the tab, and the selection in the switcher. */
export const NO_CHROME: Chrome = { scoped: false }

export function sameChrome(a: Chrome, b: Chrome): boolean {
  return a.nav === b.nav && a.title === b.title && a.scoped === b.scoped && a.season === b.season
}

export type ChromeValue = {
  chrome: Chrome
  declare: (next: Chrome) => void
}

export const ChromeContext = createContext<ChromeValue | null>(null)

export function useChrome(): ChromeValue {
  const v = use(ChromeContext)
  if (!v) throw new Error('useChrome outside ChromeProvider')
  return v
}
