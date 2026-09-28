// A read that KEEPS WHAT IT HAD while it asks again, for the admin desks.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api'

/**
 * `useApi` goes back to loading on a reload, which is right for a page and wrong for a list polled
 * every few seconds or flipped a row at a time: the table would blank to skeletons on every tick.
 * The answer is keyed, so switching season never shows the last season's rows under the new one's
 * name.
 */
export function useKept<T>(key: string, run: () => Promise<T>) {
  const [kept, setKept] = useState<{ key: string; data: T | null; error: ApiError | null } | null>(null)
  const [nonce, setNonce] = useState(0)
  const latest = useRef(run)
  useEffect(() => {
    latest.current = run
  })
  useEffect(() => {
    let live = true
    latest.current().then(
      (data) => {
        if (live) setKept({ key, data, error: null })
      },
      (err: unknown) => {
        if (!live) return
        const error = err instanceof ApiError ? err : new ApiError(0, 'unknown', err instanceof Error ? err.message : String(err))
        setKept((was) => ({ key, data: was?.key === key ? was.data : null, error }))
      },
    )
    return () => {
      live = false
    }
  }, [key, nonce])
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const mine = kept?.key === key ? kept : null
  return { data: mine?.data ?? null, error: mine?.error ?? null, loading: mine === null, reload }
}
