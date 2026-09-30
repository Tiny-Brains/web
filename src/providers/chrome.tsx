// The one slot a page declares itself into, which the shell above it reads.
//
// A DECLARATION THAT SAYS THE SAME THING MUST NOT BE A STATE CHANGE. A page re-declares on every
// render of its own — `title` is often built from data the page just read — and a fresh object each
// time would re-render the whole shell, bar and guide and footer, on every keystroke an admin desk
// puts into the query string. The fields are compared and an equal declaration keeps the object
// already held, so the shell re-renders when what it says changes and at no other time.

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ChromeContext, NO_CHROME, sameChrome, type Chrome, type ChromeValue } from './chrome-context'

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<Chrome>(NO_CHROME)

  const declare = useCallback((next: Chrome) => {
    setChrome((held) => (sameChrome(held, next) ? held : next))
  }, [])

  const value = useMemo<ChromeValue>(() => ({ chrome, declare }), [chrome, declare])

  return <ChromeContext value={value}>{children}</ChromeContext>
}
