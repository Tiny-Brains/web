# Running the platform locally

The local stack lets you exercise submission, admission, trials, matches, and
rankings together. It is not how you play an entry locally — `tinybrains` does that with no
Compose, no database and no season, and [Testing before you submit](../models/testing.md) is the
page for it. Bring the stack up when you want the *loop*: a submission that is admitted, given a
trial, promoted, paired and rated.

## What you need

Install **Docker Engine 28 or newer with Compose v2.32 or newer** — earlier versions cannot mount
a volume from an image, which is how every package reaches the node that runs it — and a POSIX
shell.

**No checkout of any package is required.** Each one ships as an **artifact image** that Compose
mounts read-only, `type: image`, with no copy in between: `<PKG>_REF` pointed at published tags is a
complete stack. Sibling checkouts are only where those images are built from by default:

```text
tinybrains/
  soma/     kalam/    ants/
  web/      devops/
```

Add `-f docker-compose.dev.yml` to bind a checkout back over its image mount when you want to edit
a package in place.

The stack uses the pinned Orion **1.8.1** runtime, Postgres 16, Redis, MinIO, and the browser
application. **There is no inference sidecar**: each node runs models itself. Python 3 is needed for
supplementary SQL checks; host Rust is not required.

## Configure the stack

From `devops/`, one command does every credential:

```sh
./scripts/setup/init.sh
```

It creates `.env`, mints `POSTGRES_PASSWORD`, `SOMA_SESSION_SECRET` and `ORION_ADMIN_KEY`,
generates the Ed25519 plugin trust root for this machine, builds or pulls the two package images
that ship plugins, and signs their components. It is idempotent, so it is also the repair command
after a plugin or engine rebuild — an unsigned component comes up quarantined, not broken in a way
that names itself. `.env.example` is the contract it fills; keep local credentials in the ignored
`.env`.

Register a GitHub OAuth App with homepage `http://localhost:5173` and callback
`http://localhost:5173/v1/auth/github/callback`. Set `APP_URL` and
`OAUTH_REDIRECT_URI` consistently. Plain HTTP development uses a non-Secure cookie;
HTTPS deployments require their corresponding cookie policy.

## Bring it up

The one thing `init.sh` cannot do is register a GitHub OAuth App; set `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET` yourself, as below. Then build the package images from the checkouts and
start the stack:

```sh
docker compose --profile build build   # skip this when <PKG>_REF pins published tags
docker compose up -d
./scripts/check/configs.sh
docker compose ps -a
docker compose logs loader
```

**`--profile build` is not optional and `up --build` is not a substitute.** The package images sit
on their own profile, so an ordinary `up` neither builds nor rebuilds them; it mounts whatever
`<PKG>_REF` already names.

Two one-shots run before the servers. **`db-bootstrap`** creates the Orion state database, applies
Soma's migrations when the platform database is empty, and applies the seed on every run — it
records a digest of the migrations it applied and refuses a schema rewrite it cannot apply, naming
the command that fixes it. **`loader`** then registers the game, reference data, engine identity,
storage and the Orion packages. Check that both finished and that no channel or plugin was
quarantined. A healthy server before package loading is not yet a working competition.

Open `http://localhost:5173`, or verify the proxy:

```sh
curl --fail --silent --show-error http://localhost:5173/v1/games
```

Local host ports include Soma at 8080, the first Kalam at 8082, Web at 5173, the Orion console at
8081, and MinIO at 9000/9001. They bind to loopback. For application requests and sign-in, use the
browser origin consistently.

For a second replica, add the fleet overlay — `docker compose -f docker-compose.yml -f
docker-compose.fleet.yml up -d`, which brings up `kalam-2` and gives the loader its admin URL in the
same file. Use the same `-f` pair for every later command in that stack, because a replica the
loader does not know about receives no package and is invisible capacity.

## Sign in and make a match happen

Sign in with GitHub at `http://localhost:5173`, then submit through the site's own `/submit` form —
it creates the model if you have none, and hands you the two upload commands after the `201`. A
game needs an open local season, an eligible account, and at least one runnable opponent for the
trial and regular matches.

The development fixture script can populate baseline assets:

```sh
./scripts/dev/seed-baselines.sh
```

It reads the trained artifacts from `baselines/` in an `ants` checkout and puts both the rows and the
bytes in place. **The seed alone is not enough**: `compose/bootstrap/seed.sql` creates each baseline
with a placeholder hash, and a node re-hashes what it fetches and refuses a mismatch, so until this
script runs every match seating a baseline is released unplayed — which is also the answer when a
candidate sits in `verified` for ever, because a trial needs a baseline.

Season creation requires an administrator account; signing in as a competitor does not grant that
role. `scripts/dev/grant-admin.sh` is the local way to get one.

Follow the submitted model's phase, its trial ID, then its finished match history
and leaderboard entry. This is stronger evidence of a working stack than a
successful health probe alone.

## Reloading and stopping

After editing package definitions, reload them:

```sh
docker compose --profile build build     # rebuild the package image you edited
docker compose run --rm loader           # install it into the node that runs it
```

**Rebuild the image, then reload.** There is no volume between a package and the loader any more —
it is mounted straight from the image — so a reload with no rebuild installs the previous build and
fails like a bug in your change. Rebuild after editing a plugin or the engine and re-run
`./scripts/setup/init.sh` to re-sign, or the node comes up `degraded` with the channel quarantined.

Reloading packages does not apply schema migrations. `db-bootstrap` applies them only when the
platform database is **empty** — the schema is pre-release and `0001_init.sql` is rewritten in place
rather than extended, and re-running it over an existing schema is an error rather than an upgrade —
so it refuses a rewrite and names `scripts/dev/resync-dev-schema.sh`, which drops the schema, lets
bootstrap apply and seed it afresh, and puts `users` and `sessions` back so your sign-in survives.

Stop services with `docker compose stop`. Match workers are configured to drain,
but a forced shutdown can still require claim recovery. Avoid deleting volumes
unless you intend to discard local history. The resync script above is guarded
development repair, not a production migration mechanism, and it refuses populated
ladder data.

## When nothing plays

| Symptom | Check |
|---|---|
| Sign-in loops or returns unauthenticated | Browser origin, OAuth callback, cookie policy, and session secret |
| Candidate stays testing | Whether both objects are actually in the models bucket, registered reference observations, the admission clock |
| Rejected `ARTIFACT_MISSING` | The upload step. Nothing fetches from a release — the competitor PUTs to a presigned URL |
| Candidate stays verified | Latest trial status, available opponent, pairing clock |
| Pending matches never run | Loaded `tb-match-N` channels and engine; queued engine digest matches the replica's |
| Every match is released without playing | The replica's `tb-roster` clock, and whether its node has the seat's model `active`. `model_prefix` must agree across both templates |
| Models cannot load | The bucket's TWO endpoints — an upload is signed for the public one and a node dials the internal one — plus store credentials |
| Matches play but cannot finish | Replay bucket, upload connectivity, current claim and lease |
| Results exist but ratings do not move | Counting clock; confirm the match is not an unrated trial |
| A channel or plugin is quarantined | The component's Ed25519 signature. Re-run `./scripts/setup/init.sh` after any plugin or engine rebuild |
| A package edit had no effect | Whether you rebuilt its image. The loader mounts the image, not your checkout — unless `docker-compose.dev.yml` is in the `-f` list |

Use `docker compose logs` for the relevant service and keep model/match IDs in
reports. A cloud deployment, TLS ingress, live R2 verification, and autoscaling
are separate work from this local setup.
