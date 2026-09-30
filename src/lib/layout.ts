// Which measure a page runs at, and whether the guide folds — read from the address.
//
// THE MEASURE BELONGS TO THE ROUTE, NOT TO ONE RENDER OF IT. It used to be a prop on the page's own
// Shell (`reading`, `learn`, `rail`), which meant every branch of that page — the loading one, the
// not-found one, and the Suspense fallback standing in for a lazy chunk — had to remember to pass it
// too. The ones that did not drew a full-width placeholder that snapped to a 72ch column the instant
// the answer arrived, which is a page that jumps for no reason a reader can see. Read from the
// address it is right before the page has rendered anything at all, and a branch cannot forget it.
//
//   fluid    browse pages, running to --content-max
//   reading  a 72ch measure (a post)
//   learn    the Learn pages' shared wider column (Get started, the FAQ, the changelog, credits)
//   rail     the guide folds to its icon rail whatever the reader chose (the watch page)
//
// A PATTERN HERE IS App.tsx's OWN SPELLING of that route. A renamed route is a rename in both.

import { matchPath } from 'react-router-dom'

export type Layout = 'fluid' | 'reading' | 'learn' | 'rail'

const BY_ROUTE: [string, Layout][] = [
  ['/matches/:id', 'rail'],
  ['/blog/:slug', 'reading'],
  ['/start', 'learn'],
  ['/faq', 'learn'],
  ['/changelog', 'learn'],
  ['/credits', 'learn'],
]

/** The layout for an address. Anything not listed runs fluid, the not-found page included: a
 *  `Message` carries its own 580px measure and centres itself, so it needs no column. */
export function layoutFor(pathname: string): Layout {
  for (const [pattern, layout] of BY_ROUTE) if (matchPath(pattern, pathname)) return layout
  return 'fluid'
}
