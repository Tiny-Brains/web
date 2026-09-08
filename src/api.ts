// Typed client for the Soma REST surface (soma/the API reference §2).
//
// Every call is same-origin and relies on the session cookie, which is HttpOnly:
// JS cannot read it, so "are we signed in?" is answered by calling /v1/me and
// seeing whether it is a 200 or a 401. There is no token in localStorage to go
// stale, and nothing to attach by hand.

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

type OrionError = {
  error?: { code?: string; message?: string; request_id?: string }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    // Same-origin through the dev proxy, but stated so a future cross-origin
    // deployment sends the cookie rather than silently dropping it.
    credentials: 'include',
    headers: { accept: 'application/json' },
  })

  const text = await res.text()
  const parsed: unknown = text ? JSON.parse(text) : null

  if (!res.ok) {
    const e = (parsed as OrionError)?.error
    throw new ApiError(
      res.status,
      e?.code ?? 'UNKNOWN',
      e?.message ?? res.statusText,
      e?.request_id,
    )
  }
  return parsed as T
}

// ---- shapes, from the API reference §2 ------------------------------------------------

export type Me = {
  id: string
  handle: string
  role: string
}

export type Game = {
  id: string
  name: string
}

export type LeaderboardEntry = {
  rank: number
  model_id: string
  owner: string
  version: number
  class: string
  size_bytes: number | null
  rating: number
  provisional: boolean
  matches: number
}

export type Leaderboard = {
  entries: LeaderboardEntry[]
  next_cursor: string | null
}

export type Model = {
  id: string
  owner: string
  game: string
  version: number
  repo: string
  release_tag: string
  status: 'testing' | 'active' | 'superseded' | 'rejected'
}

// ---- endpoints ---------------------------------------------------------------

export const api = {
  /** 200 when the session cookie is good, 401 when it is absent or expired. */
  me: () => get<Me>('/v1/me'),

  games: () => get<Game[]>('/v1/games'),

  leaderboard: (game: string, ladder = 'open') =>
    get<Leaderboard>(`/v1/games/${encodeURIComponent(game)}/leaderboard?ladder=${encodeURIComponent(ladder)}`),

  /** Session-authed: the competitor's own submission history. */
  myModels: (game: string) =>
    get<Model[]>(`/v1/models?game=${encodeURIComponent(game)}`),

  /**
   * Ends the session: the server marks its row revoked, so the token stops
   * authenticating even though it has not expired, and the cookie is cleared.
   */
  signOut: async () => {
    await fetch('/v1/session', { method: 'DELETE', credentials: 'include' })
  },
}

/**
 * Full-page navigation, not fetch. The endpoint is Orion's own OAuth2 sign-in
 * channel: it answers 302 to github.com with a PKCE challenge and sets the
 * oauth-state cookie. Following it in JS would neither store the cookie against
 * the document nor leave the address bar somewhere GitHub can return to.
 *
 * GitHub sends the browser back to /v1/auth/github/callback, which the same
 * channel serves. A completed sign-in lands on the app with the session cookie
 * set; a refused one (forged or expired state, a cancelled consent screen) is a
 * JSON 401 from the channel at that URL, and the workflow never runs.
 */
export function startGitHubSignIn(): void {
  window.location.href = '/v1/auth/github'
}
