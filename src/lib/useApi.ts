// One way to call the API from a component.
//
// Deliberately small: a request, three states, and a way to ask again. It is not
// a cache -- data that several pages want (the session, the game list) is held in
// a context above them instead, so this hook never has to decide whether two
// components asked the same question.

import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api'

export type Async<T> =
  | { state: 'loading'; data: null; error: null }
  | { state: 'ready'; data: T; error: null }
  | { state: 'error'; data: null; error: ApiError }

export type AsyncResult<T> = Async<T> & { reload: () => void }

const LOADING = { state: 'loading', data: null, error: null } as const

/**
 * `key` identifies the request -- a URL, or the parts of one joined -- and is the
 * only thing that decides when to fetch again. The callback deliberately is NOT a
 * dependency: pages build it inline, so treating it as one would re-fetch on every
 * render. It is read through a ref so the fetch always runs the current closure.
 */
export function useApi<T>(key: string, run: () => Promise<T>, enabled = true): AsyncResult<T> {
  const [result, setResult] = useState<Async<T>>(LOADING)
  const [nonce, setNonce] = useState(0)

  // The callback is captured in a ref rather than depended on, because pages build
  // it inline and a new function every render would re-fetch forever. Written from
  // an effect, not during render: effects run in order, so by the time the fetch
  // below runs on the same commit the ref already holds this render's closure.
  const latest = useRef(run)
  useEffect(() => {
    latest.current = run
  })

  // Fetching is exactly the "synchronise with an external system" an effect is
  // for. Every setState here happens after an await, which the rule cannot see
  // through, and the synchronous one resets the state the new key is loading in.
  useEffect(() => {
    if (!enabled) return
    let live = true
    // oxlint-disable-next-line react/set-state-in-effect
    setResult(LOADING)
    latest.current().then(
      (data) => {
        if (live) setResult({ state: 'ready', data, error: null })
      },
      (err: unknown) => {
        if (!live) return
        setResult({
          state: 'error',
          data: null,
          error:
            err instanceof ApiError
              ? err
              : new ApiError(0, 'unknown', err instanceof Error ? err.message : String(err)),
        })
      },
    )
    return () => {
      live = false
    }
  }, [key, nonce, enabled])

  return { ...result, reload: () => setNonce((n) => n + 1) }
}
