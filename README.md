# web

The TinyBrains shell. Today it is exactly the auth loop: sign in with GitHub, read
the competitor back from `GET /v1/me`, sign out — plus a probe table that shows the
session-gated endpoints flipping from `401` to `200` across a sign-in.

It talks to Soma and holds no state of its own.

---

## The one thing to understand: the proxy

`vite.config.ts` proxies `/v1` to `127.0.0.1:8080`. That is not a convenience, it is
what makes the flow work at all.

Soma sets `soma_session` as an **HttpOnly** cookie with no `Domain` attribute, so it
belongs to whichever host the browser believes answered. Proxying means the browser
only ever sees origin `localhost:5173`:

- the cookie is set on `localhost` and sent back on every `/v1` call;
- nothing is cross-origin, so no CORS is involved. Calling `localhost:8080` directly
  would need CORS *with credentials*, and Orion answers
  `access-control-allow-origin: *`, which browsers refuse to combine with them;
- the callback URL registered with GitHub is a `localhost:5173` URL — the one place
  GitHub's redirect target and the cookie's host have to agree.

Because the cookie is HttpOnly, JS cannot read it. "Are we signed in?" is answered by
calling `/v1/me` and looking at `200` vs `401` (`useSession.ts`). There is no token in
`localStorage` to go stale and nothing to attach by hand.

---

## Running it

Soma has to be up first. The compose stack in the workspace's `devops/` directory brings up
Postgres, Soma and a production build of this app together; to develop against it, leave that stack
running and start Vite on top:

```bash
npm install
npm run dev          # http://localhost:5173
```

### The GitHub OAuth App

Create one at **github.com/settings/developers → New OAuth App**:

| Field | Value |
|---|---|
| Application name | `TinyBrains (local)` |
| Homepage URL | `http://localhost:5173` |
| Authorization callback URL | `http://localhost:5173/v1/auth/github/callback` |

Then generate a client secret and put the two values where they belong — the id is
traced and non-secret, the secret is engine-held and never appears in a response:

Both values are deployment configuration and live outside this repo, in the workspace's `devops/`
directory — the client id is non-secret and traced, the secret is engine-held and never appears in
a response:

| Value | Goes in | As |
|---|---|---|
| Client ID | `devops/.env` | `GITHUB_CLIENT_ID` |
| Client secret | `devops/.env` | `GITHUB_CLIENT_SECRET` |

`devops/.env` is gitignored; `devops/.env.example` is the template. Restart Soma after editing
either — `[vars]` and `[secrets]` are read at boot.

---

## Browser note

Whether the session and oauth-state cookies carry `Secure` is Soma's instance config
(`[vars] cookie_secure`), not the shell's concern — but it is the first thing to check
when sign-in "does nothing". Browsers refuse to store a `Secure` cookie from an
`http://` origin; Chrome and Firefox exempt `localhost`, **Safari does not**. The
compose stack and the host config both declare `false`, so every browser works
locally. Behind TLS it must be `true`.

The sign-in itself is Orion's: `/v1/auth/github` and its callback are one channel
with an `oauth2_login` block, and the shell only navigates to the first. A refused
callback — an expired or forged state, a cancelled consent screen — lands the browser
on a JSON `401` at the callback URL rather than back on the app; that is the channel
answering, before any Soma workflow runs.

---

## Layout

```
src/api.ts         typed client for the Soma surface; ApiError carries status + code
src/useSession.ts  the session is whatever /v1/me says it is
src/Probes.tsx     calls each endpoint and reports what came back
src/App.tsx        the shell
vite.config.ts     the dev proxy
nginx.conf         the same proxy for the built image
Dockerfile         build the SPA, serve it from nginx
```

Deployment configuration — the compose file, the environment template — is not here; it is in the
workspace's `devops/` directory.

## What is not here

The four other M1 screens — leaderboard, model detail, match replay, submit — and the
cartridge visualizer. `api.ts` already types `leaderboard()` and `myModels()`, which
is where those start.
