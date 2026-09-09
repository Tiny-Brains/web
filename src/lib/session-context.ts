// The session's context and the hook that reads it, apart from the provider that
// fills it -- so a file that only consumes the session imports no component, and
// fast refresh keeps working on the provider.

import { createContext, use } from 'react'
import type { ApiError, Me } from '../api'

export type SessionState =
  | { state: 'loading' }
  | { state: 'anonymous' }
  | { state: 'signed-in'; me: Me }
  | { state: 'error'; error: ApiError }

export type SessionValue = {
  session: SessionState
  me: Me | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const v = use(SessionContext)
  if (!v) throw new Error('useSession outside SessionProvider')
  return v
}
