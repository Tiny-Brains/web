// One open-and-close behaviour for every popover in the shell: the scope switcher, the account
// menu, the notifications bell and the phone menu. It closes on a pointer down outside `root`, on
// Escape (returning the focus to `button`, or the focus is left inside a panel that is gone), and
// on navigation, since following a link is the end of a menu's job. The caller owns the refs.

import { useCallback, useEffect, useState, type RefObject } from 'react'
import { useLocation } from 'react-router-dom'

export function usePopover(root: RefObject<HTMLElement | null>, button: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState('')
  const location = useLocation()
  const here = `${location.pathname}${location.search}`

  // Closed by navigation: an open popover remembers where it was opened, and is shut anywhere else.
  const shown = open && at === here

  useEffect(() => {
    if (!shown) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [shown, root, button])

  const toggle = useCallback(() => {
    setAt(here)
    setOpen((o) => !(o && at === here))
  }, [here, at])

  return { open: shown, toggle }
}
