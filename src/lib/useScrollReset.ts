// Where the reader lands after a navigation.
//
// THE SHELL NO LONGER TEARS ITSELF DOWN BETWEEN PAGES, so nothing resets the scroll offset for us
// any more: without this, following a match from halfway down /matches opened the watch page halfway
// down, and the reader's first act on every page was to scroll back up. This puts a new page at its
// top and Back and Forward at the offset they were left at.
//
// A QUERY STRING IS NOT A NEW PAGE. The selection (game, season), a ladder tab, a filter and every
// admin desk's open row live there, so only a change of PATHNAME scrolls; a desk that re-reads on a
// keystroke stays where the admin was reading. A POP is the exception either way: Back to the same
// page under a different query is still a place the reader has been, and is restored.
//
// IT RUNS IN A LAYOUT EFFECT, before the browser paints, so the offset is never painted twice.
// `history.scrollRestoration` is handed to us for the same reason: left on `auto`, the browser
// restores its own idea of the offset on a POP a frame later and the page visibly jumps twice.

import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/** Offsets by history entry, for this document's lifetime. A reload starts a fresh document with a
 *  fresh map, which is the same answer the browser's own restoration gives once it is off. */
const offsets = new Map<string, number>()

export function useScrollReset() {
  const { key, pathname, hash } = useLocation()
  const action = useNavigationType()
  const lastPath = useRef<string | null>(null)

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
  }, [])

  useLayoutEffect(() => {
    const first = lastPath.current === null
    const moved = lastPath.current !== pathname
    lastPath.current = pathname

    if (action === 'POP') window.scrollTo(0, offsets.get(key) ?? 0)
    // An address carrying a fragment is asking for a place inside the page, and the browser puts
    // the reader there itself. The first render is the browser's landing, not a navigation.
    else if (moved && !first && !hash) window.scrollTo(0, 0)

    // On the way out of this entry, remember where it was left. The cleanup runs before the next
    // entry's effect, so the offset recorded is this page's own.
    const leaving = key
    return () => {
      offsets.set(leaving, window.scrollY)
    }
  }, [key, pathname, hash, action])
}
