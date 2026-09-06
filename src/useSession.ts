import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, type Me } from './api'

export type Session =
  | { state: 'loading' }
  | { state: 'anonymous' }
  | { state: 'signed-in'; me: Me }
  | { state: 'error'; error: ApiError | Error }

/**
 * The session is whatever /v1/me says it is. A 401 is not an error here — it is
 * the ordinary answer for a visitor who has not signed in, and the only way to
 * learn it, since the cookie is HttpOnly. It is also the answer for a session
 * that has been revoked, which is why the server goes to the trouble of shaping
 * a 401 rather than letting the workflow halt at 400: anything but 401 lands in
 * the error branch below and renders a fault instead of a sign-in button.
 */
export function useSession() {
  const [session, setSession] = useState<Session>({ state: 'loading' })

  const refresh = useCallback(async () => {
    try {
      const me = await api.me()
      setSession({ state: 'signed-in', me })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSession({ state: 'anonymous' })
      } else {
        setSession({ state: 'error', error: err as Error })
      }
    }
  }, [])

  useEffect(() => {
    // Fetching the session is exactly the "synchronise with an external system" the
    // rule carves out; every setState in `refresh` happens after an await, which the
    // linter cannot see through.
    // eslint-disable-next-line react/set-state-in-effect
    void refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    await api.signOut()
    setSession({ state: 'anonymous' })
  }, [])

  return { session, refresh, signOut }
}
