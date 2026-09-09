# web

Web is the TinyBrains browser application. It is a React 19 and TypeScript SPA built with Vite 8,
currently providing GitHub sign-in, session display, sign-out, and a table of API probes.
The production image serves the bundle through nginx and proxies API traffic to Soma.

## The name

**Web** is a descriptive name for the browser-facing part of the platform.

## Scope

**It owns**

- The sign-in and sign-out experience, including the current session display.
- The typed Soma client in src/api.ts and the session hook that consumes it.
- The API probe UI used to inspect public and authenticated responses.
- Development and image-serving proxies for /v1, plus static asset and SPA serving.

**It does not**

- Issue or validate sessions; [Soma](https://github.com/Tiny-Brains/soma) authenticates requests.
- Store OAuth credentials or read the HttpOnly session cookie.
- Decide admission or rankings; [Jodi](https://github.com/Tiny-Brains/jodi) maintains that state.
- Run games or models; [Kalam](https://github.com/Tiny-Brains/kalam) and [Axon](https://github.com/Tiny-Brains/axon) do that work.
- Render Ants replays; the browser cartridge viewer is not implemented yet.

## Where it sits

```text
[Browser] --> [Vite or nginx: page origin] -- /v1 proxy --> [Soma]
    |
    +-- full-page OAuth navigation --> [GitHub] -- callback --> [page origin]
```

| Direction | Party | Over | What moves |
|---|---|---|---|
| calls | Soma | Same-origin /v1 requests | User, game, model, and leaderboard data; session revocation |
| calls | Soma sign-in route | Browser navigation | OAuth start and final callback |
| called by | Browser | Static HTTP | SPA HTML, JavaScript, styles, and assets |

The [system map](https://github.com/Tiny-Brains/devops#where-it-sits) covers the services behind Soma.
UI state lives in React; durable application data and session validity come from the API.

## Interface

This repository exposes no application API. [src/api.ts](src/api.ts) defines the calls it consumes,
the response types, and ApiError with HTTP status, error code, and optional request id.

| Client entry point | Soma request | Current use or contract |
|---|---|---|
| api.me() | GET /v1/me | Current user; a 401 means no valid session |
| api.games() | GET /v1/games | Registered games |
| api.leaderboard(game, ladder) | GET /v1/games/{game}/leaderboard?ladder= | Standings; the client defaults ladder to open |
| api.myModels(game) | GET /v1/models?game= | Signed-in user's submission history |
| api.signOut() | DELETE /v1/session | Requests revocation and cookie clearing |
| startGitHubSignIn() | GET /v1/auth/github | Full-page navigation rather than fetch |

The client covers only part of Soma's surface. Its TypeScript types are compile-time assertions,
not response validation, and signOut currently does not turn non-success HTTP responses into ApiError.

The cookie belongs to the browser-facing host because Soma does not set a Domain attribute.
Both proxies preserve /v1, redirects, and Set-Cookie so the browser uses the same origin throughout.

| Proxy contract | Development | Built image |
|---|---|---|
| Configuration | vite.config.ts | nginx.conf |
| Upstream | Configured target http://127.0.0.1:8080 | Configured service http://soma:8080 |
| Redirect handling | followRedirects: false | proxy_redirect off; proxy_intercept_errors off |
| Address resolution | Vite proxy target | Docker DNS resolver with a variable upstream |
| Static serving | Vite development server | SPA fallback; immutable hashed assets; uncached index.html |

With either server running and Soma reachable, check the proxy from a terminal:

```sh
curl --fail --silent --show-error http://localhost:5173/v1/games
```

## Run it, test it

The page can start alone, but API and sign-in behavior require Soma. Follow the
[DevOps setup](https://github.com/Tiny-Brains/devops#run-it-test-it) to provision its dependencies.
All commands here run from this repository's root.

- Node 22.12 or newer on the Node 22 line and npm; the image uses Node 22.
- A Soma instance available at the target configured in vite.config.ts.
- A GitHub OAuth App configured on Soma for the browser origin.

Install the locked dependencies and start the development server:

```sh
npm ci
npm run dev
```

Vite's configured port is 5173 with strictPort enabled, so it fails if that port is occupied.
If the DevOps web container already uses it, stop that container from the DevOps checkout before
starting Vite; leave the backend services running.

Check the source and build the production bundle:

```sh
npm run lint
npm run build
```

A pass is clean oxlint output and a successful TypeScript/Vite build. There is no automated test
suite; the production Dockerfile runs the same build, but build success does not validate OAuth.
Use the probe table to inspect responses before and after sign-in, then confirm sign-out returns
the session view to its unauthenticated state.

## What a deployment owes it

The bundle has no runtime environment-variable interface. Set infrastructure values around it,
and keep the two proxy configurations aligned when changing the API location.

| Setting | Owner | Missing or inconsistent value |
|---|---|---|
| /v1 upstream | vite.config.ts or nginx.conf | API requests fail, commonly with a proxy 502 |
| Browser origin | Deployment listener or ingress | OAuth may return to a different page or host |
| app_url and oauth_redirect_uri | Soma's Orion vars | Redirects do not complete the intended browser flow |
| GitHub callback registration | OAuth App | Must exactly match Soma's redirect URI |
| cookie_secure | Soma's Orion vars | Use false for local HTTP and true for HTTPS deployment |
| Docker DNS resolver | nginx.conf | The shipped image assumes Docker's resolver; other environments need a matching resolver |

For the shipped local setup, the OAuth homepage is `http://localhost:5173` and its callback is
`http://localhost:5173/v1/auth/github/callback`. GITHUB_CLIENT_ID and the secret
GITHUB_CLIENT_SECRET belong to Soma's environment, never to a Vite build variable.
There are no browser-side secrets. Ports, origins, DNS, and upstreams are deployment settings.

## Layout

```text
src/App.tsx        session shell and page composition
src/useSession.ts  session query and refresh behavior
src/api.ts         typed same-origin API client
src/Probes.tsx     endpoint inspection UI
src/GitHubMark.tsx sign-in icon component
src/App.css        shell and probe styling
src/index.css      global styling
src/main.tsx       React entry point
vite.config.ts     development listener and API proxy
nginx.conf         image proxy, caching, and SPA fallback
Dockerfile         Node build stage and nginx serving stage
package.json       dependencies and lint/build commands
```

## What must stay true

- **API calls use the page's /v1 origin.** src/api.ts and both proxies define this contract; there is no automated proxy regression test yet.
- **Soma decides whether the session is valid.** useSession queries /v1/me rather than treating a stored client token as authority.
- **Sign-in is browser navigation.** startGitHubSignIn lets the OAuth redirect reach the browser and its cookie jar.
- **Secrets never enter the bundle.** Build-time values are public to the browser, so credential handling belongs on Soma.
- **Both proxies preserve the OAuth response.** Redirect and Set-Cookie behavior must be checked when either proxy changes.
- **API types track the server.** TypeScript alone cannot detect a stale response declaration; compare Soma's contract when expanding the client.

## Status

**8 September 2026.** The session shell, GitHub navigation, sign-out action, typed client subset,
and probe table are implemented; `npm run lint` and `npm run build` pass. Browser OAuth requires
a configured stack and was not exercised during this rewrite. Product screens for standings,
versions, submissions, seasons, and replay viewing, plus broader API coverage and automated UI
tests, remain to be built.

## More

- Local references: [API client](src/api.ts), [development proxy](vite.config.ts), and [image proxy](nginx.conf).
- [The competitor guide](https://github.com/Tiny-Brains/docs) — the reader-facing half: the rules, the model format, the adapter dialect, submitting, ranking and seasons. The platform section is the high-level design for someone new to the codebase.
- Related repositories: [Soma](https://github.com/Tiny-Brains/soma), [Jodi](https://github.com/Tiny-Brains/jodi), [Kalam](https://github.com/Tiny-Brains/kalam), [Axon](https://github.com/Tiny-Brains/axon), [DevOps](https://github.com/Tiny-Brains/devops).
- Apache-2.0: see [LICENSE](LICENSE).
