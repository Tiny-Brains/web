# Running the platform locally

The local stack runs submission, admission, trials, matches and rankings together. To play an entry
on your machine, use `tinybrains`, which needs no Compose, no database and no season;
[Testing before you submit](../models/testing.md) covers it. Bring the stack up when you want the
*loop*: a submission that is admitted, given a trial, promoted, paired and rated.

## What you need

Install **Docker Engine with Compose v2.21 or newer** and a POSIX shell. You need two checkouts,
each running one compose file:

```text
web/      the platform: Postgres, Redis, MinIO, Soma, the Orion console and the site
kalam/    a runner: the one container that plays matches for a Soma
```

**Every service is an image its own repository publishes.** Soma is `ghcr.io/tiny-brains/soma`:
orion-server with the Soma package inside, which applies the schema and loads its own package.
Kalam is `ghcr.io/tiny-brains/kalam`, a runner that loads its own. The cartridge has no image: each
of these images, and the site's viewer, takes it from an [Ants release](https://github.com/Tiny-Brains/ants/releases).
To try a Soma change, build that checkout and set `SOMA_IMAGE`; to try a Kalam or web change, run
with `--build` in its own checkout.

The stack uses the pinned Orion **1.9.0** runtime, Postgres 16, Redis, MinIO and the browser
application. **There is no inference sidecar**: each node runs models itself. You do not need Rust
on the host.

## Configure the platform

From `web/`, one command sets up every credential:

```sh
./scripts/setup/init.sh
```

It creates `.env`, mints `POSTGRES_PASSWORD`, `SOMA_SESSION_SECRET`, `RUNNER_TOKEN_SECRET`, the
models read key and `ORION_ADMIN_KEY`, generates the Ed25519 plugin trust root for this machine, and
signs the plugins in the Soma image (and in a Kalam image, when one is here). It is idempotent, so
it is also the repair command after a new image: an unsigned component comes up quarantined, with
no error that names the cause. `.env.example` is the contract it fills.

Register a GitHub OAuth App with homepage `http://localhost:5173` and callback
`http://localhost:5173/v1/auth/github/callback`, and set `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET` in `.env`. Plain HTTP development uses a non-Secure cookie; an HTTPS
deployment needs the matching cookie policy.

## Bring it up

```sh
docker compose up -d --build
docker compose ps -a
docker compose logs soma-bootstrap soma
```

Two one-shots run before Soma. **`buckets`** makes the replay and models buckets, the models read
key and `models/*`'s public read. **`soma-bootstrap`** creates the Orion state database, applies
Soma's migrations when the platform database is empty, and registers the game, the cartridge and the
engine digest its image carries. It records a digest of the migrations it applied, and refuses a
schema rewrite it cannot apply. **`soma`** then loads its own package and stops if a plugin fails to
verify, so any `soma` node that is up is serving.

Open `http://localhost:5173`, or verify the proxy:

```sh
curl --fail --silent --show-error http://localhost:5173/v1/games
```

The local ports are Web at 5173, Soma at 8080, the Orion console at 8081 and MinIO at 9000/9001,
all bound to loopback. Use one browser origin for application requests and sign-in.

## Start a runner

The platform plays no match itself. A runner from Kalam's checkout plays them, and reaches the
platform only through Soma. Make yourself an administrator before you sign in:

```sh
./scripts/setup/admin-user.sh <your-github-login>     # from web/; then docker compose up -d soma
```

It writes your numeric GitHub id into `SOMA_ADMIN_GITHUB_IDS` in `.env` (never the login, which
GitHub hands on after a rename), and signing in makes that account an administrator. Then mint the
runner a key on the admin **Runners** page, which shows the key once.

In `kalam/`, copy `.env.example` to `.env` and uncomment its local block (every address is
`host.docker.internal`). Fill in the key, `TB_TRUST_PUBLIC_KEY` and the `MODELS_READ_*` pair from
web's `.env`, and set `RUNNER_SIG_DIR=../web/keys/signatures`. Then:

```sh
docker compose --profile admit up -d --build
docker compose logs -f runner     # "loaded: tb.ants is live and 3 channels are active"
docker compose logs -f admit      # "loaded: tb.ants is live and 1 channels are active"
```

`--profile admit` starts the **admitting runner** beside the runner. Soma runs no model, so the
admitting runner admits every submission and baseline; while none is up, they wait in `testing`.

Build the runner and Soma from the same Ants release. A runner whose engine digest differs from the
one Soma declared claims nothing, for ever, and looks healthy doing it.

## Sign in and make a match happen

Sign in with GitHub at `http://localhost:5173`. Use `localhost` and never `127.0.0.1`: the sign-in
cookie is host-only. Then submit through the site's own `/submit` form. It creates the model if you
have none, hashes both files and uploads them itself, and shows the upload commands only if a
transfer fails. A game needs an open local season **with a board in play**, an eligible account, a
runner, and at least one runnable opponent for the trial and regular matches.

**A fresh stack has no season.** An administrator creates one on the admin pages, as in production;
the stack seeds nothing.

**It has no boards either.** No release ships a season's boards: an administrator uploads them on
the season's page and puts each in play. Any board file will do. `tinybrains maps export ants <dir>`
writes the five basic boards the release ships, and `tinybrains maps check` tells you whether Soma
would accept a board of your own. Until one is in play, the pair clock pairs nothing and a candidate
waits in `verified`.

**It has no baselines either.** The platform ships no model: an administrator uploads a season's
baselines on the season's page, each a name and its two files, and `ants-starter/models` holds
three. The admit clock admits a baseline as it admits a submission, and the baseline lands switched
off until the administrator switches it on there. A candidate stuck in `verified` has no baseline
its trial can seat: check the season's page for a baseline in play. The same files under a second
name make a second opponent, and that is how a trial on a board of many seats finds enough of them.

Only an administrator can create a season, and an administrator promotes or demotes anyone else on
the admin **Users** page. Follow the submitted model's phase, its trial ID, then its finished match
history and leaderboard entry. That proves a working stack better than a successful health probe.

## Reloading and stopping

A package edit is a new image: rebuild it, and the node loads it on start.

```sh
docker build -t tinybrains/soma:dev ../soma && SOMA_IMAGE=tinybrains/soma:dev docker compose up -d
./scripts/setup/sign-plugins.sh     # after any new Soma or Kalam image
```

Loading a package applies no schema migrations. `soma-bootstrap` applies them only when the platform
database is **empty**. The schema is pre-release, and a change rewrites `0001_init.sql` in place, so
bootstrap refuses a rewritten schema at once; you never meet it later as a missing relation.
`./scripts/dev/resync-dev-schema.sh` rebuilds a local database on the new schema and keeps the
accounts and sessions.

Stop services with `docker compose stop`. A runner drains before it stops, but a forced shutdown can
still leave claims for the platform to recover. Delete volumes only when you mean to discard local
history.

## When nothing plays

| Symptom | Check |
|---|---|
| Sign-in loops or returns unauthenticated | Browser origin, OAuth callback, cookie policy, and session secret |
| Candidate stays testing | Whether both objects are in the models bucket, the registered reference observations, the admission clock |
| Rejected `ARTIFACT_MISSING` | The upload step. Nothing fetches from a release: the competitor PUTs to a presigned URL |
| Candidate stays verified | Whether the season has a board in play that its baselines can seat, then the latest trial status and the pairing clock |
| Pending matches never run | A runner is up and its key is live; its engine digest equals the one `soma-bootstrap` declared |
| The runner logs `invalid_key` | The key comes from another database: mint one on this one |
| The runner releases every match without playing it | The runner's `kalam-roster` clock, and whether its node has the seat's model `active` |
| Models cannot load | The bucket's addresses (Soma signs an upload for the public one and dials the internal one, and a runner uses `host.docker.internal`), plus the read key |
| Matches play but cannot finish | The runner's `RUNNER_BLOB_ENDPOINT` must equal Soma's, character for character |
| Results exist but ratings do not move | The count clock; check whether the match was an unrated trial |
| A node stops with a quarantined channel | The component's Ed25519 signature. Re-run `./scripts/setup/sign-plugins.sh` after any new image |

Read `docker compose logs` for the relevant service, and keep model and match IDs in reports. A
cloud deployment, TLS ingress, live R2 verification and autoscaling lie outside this local setup.
