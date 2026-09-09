// The session, held once above every page.
//
// Soma decides whether a session is valid -- the cookie is HttpOnly, so the only
// way to learn it is to call /v1/me. A 401 is not an error here: it is the
// ordinary answer for a visitor who has not signed in, and also for one whose
// session was revoked, which is why Soma goes to the trouble of shaping a 401
// rather than letting the workflow halt at 400.
//
// The bar, the submit page and the profile all need this answer, and the profile
// needs it before it can decide whether it is showing "somebody" or "you", so it
// is fetched once here rather than per page.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, api } from '../api'
import { SessionContext, type SessionState, type SessionValue } from './session-context'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ state: 'loading' })

  const refresh = useCallback(async () => {
    try {
      setSession({ state: 'signed-in', me: await api.me() })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setSession({ state: 'anonymous' })
      else setSession({ state: 'error', error: err as ApiError })
    }
  }, [])

  // Asking the server who you are is exactly the "synchronise with an external
  // system" an effect is for. Every setState in refresh happens after an await,
  // which the rule cannot see through.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    // The server marks the row revoked, so the token stops authenticating even
    // though it has not expired, and clears the cookie on the way out.
    await api.signOut()
    setSession({ state: 'anonymous' })
  }, [])

  const value = useMemo<SessionValue>(
    () => ({
      session,
      me: session.state === 'signed-in' ? session.me : null,
      refresh,
      signOut,
    }),
    [session, refresh, signOut],
  )

  return <SessionContext value={value}>{children}</SessionContext>
}
