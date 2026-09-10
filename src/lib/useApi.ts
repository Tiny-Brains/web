// One way to call the API from a component: a request, three states, and a way to
// ask again. Not a cache — data several pages want is held in a context above them.

import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api'

export type Async<T> =
  | { state: 'loading'; data: null; error: null }
  | { state: 'ready'; data: T; error: null }
  | { state: 'error'; data: null; error: ApiError }

export type AsyncResult<T> = Async<T> & { reload: () => void }

const LOADING = { state: 'loading', data: null, error: null } as const

/**
 * `key` identifies the request and is the only thing that decides when to fetch
 * again. `run` is deliberately NOT a dependency: pages build it inline, so
 * depending on it would re-fetch on every render. It is read through a ref
 * written from an effect, so the fetch always runs the current closure.
 */
export function useApi<T>(key: string, run: () => Promise<T>, enabled = true): AsyncResult<T> {
  const [result, setResult] = useState<Async<T>>(LOADING)
  const [nonce, setNonce] = useState(0)

  const latest = useRef(run)
  useEffect(() => {
    latest.current = run
  })

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
