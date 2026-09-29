// One way to call the API from a component: a request, three states, and a way to
// ask again. Not a cache — data several pages want is held in a context above them.

import { useCallback, useEffect, useRef, useState } from 'react'
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
 *
 * A RESULT IS TAGGED WITH THE KEY IT WAS FETCHED UNDER, and a result whose tag is not the key being
 * rendered reads as `loading`. The effect below can only clear to LOADING one commit AFTER the key
 * changes, so on the render where a page navigates, the state still held the PREVIOUS key's data
 * and `state` still said `ready` — and anything that trusted that pair served one entity's data
 * under another's identity. `useSteady` (pages/Profile.tsx) did exactly that: it stored
 * `{ key: <new>, data: <old> }` and then served it for the whole new fetch. Nothing visible came of
 * it only because RouteErrorBoundary is keyed on the location and remounted the page on every
 * navigation — so this tag is what has to be right BEFORE that key is relaxed, or `/profile/alice`
 * → `/profile/bob` draws Alice's models under Bob's URL with the owner's actions on them.
 */
export function useApi<T>(key: string, run: () => Promise<T>, enabled = true): AsyncResult<T> {
  const [result, setResult] = useState<Async<T> & { key: string }>({ ...LOADING, key })
  const [nonce, setNonce] = useState(0)

  const latest = useRef(run)
  useEffect(() => {
    latest.current = run
  })

  useEffect(() => {
    if (!enabled) return
    let live = true
    // oxlint-disable-next-line react/set-state-in-effect
    setResult({ ...LOADING, key })
    latest.current().then(
      (data) => {
        if (live) setResult({ state: 'ready', data, error: null, key })
      },
      (err: unknown) => {
        if (!live) return
        setResult({
          state: 'error',
          data: null,
          key,
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

  // STABLE ACROSS RENDERS. A fresh closure here is a fresh identity, and a consumer that lists
  // `reload` in a useMemo or useEffect dependency array -- providers/platform.tsx does -- then
  // recomputes on every render, which is the memo doing nothing at all.
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  // The tag, applied. A result from another key is not this key's answer, whatever it holds.
  const current: Async<T> = result.key === key ? result : LOADING
  return { ...current, reload }
}
