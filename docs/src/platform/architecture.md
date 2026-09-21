# How TinyBrains is built

A competitor's loop is submit, verify, trial, compete and review. The platform splits accepting
requests, deciding which games to play, playing them and running models into separate parts, so
each part scales to its own load.

This chapter is for contributors and local operators. You can enter a hosted competition without
deploying any of it.

## The parts

| Part | Responsibility |
|---|---|
| Web | The browser application: sign-in, the leaderboard, matches and replays, submission and upload, and the season's own pages |
| Soma | Public HTTP API, sessions, submissions, seasons, the runner gate and the shared schema, plus four clocks: admit, pair, count and withdraw |
| Kalam | Claims matches, plays turns, records results and replays. An admitting runner also runs each submission's admission for Soma to judge |
| Ants | Deterministic game cartridge, and its replay viewer |
| Orion's `models` entity | Adapter evaluation and ONNX inference, **inside whichever node needs it** |
| `tinybrains` (the CLI) | The same match loop on a laptop, with no server: for competitors, and for checking the ladder's |
| `ants-starter` | The one repository a competitor clones: a working entry, its training script and the trained opponents |

**Soma and Kalam ship no server code.** Each is a package for [Orion](https://github.com/GoPlasmatic/Orion)
(channel and workflow definitions, SQL, connectors and small wasm plugins) and ships as an image of
the Orion server, which loads the package at boot.

**There is no model-runner service.** A model is a governed entity of the Orion server itself: a
row holding a manifest and an artifact reference (a storage connector, an object key and a
`sha256:` digest). The node fetches the object, re-hashes it, reads the graph and serves it from an
LRU session cache under `tract`. Only Kalam runs models: an admitting runner to admit them, every
other replica to play them. The Soma node serves the site and holds the database owner, and never
parses a competitor's model.

Postgres stores versions, seasons, match rows, seats and rating events. Object storage holds the
two submitted files and the replay blobs. The [repository map](repositories.md) names the code for
each component.

## One match table between scheduling and execution

Soma's pair clock inserts a pending match and its seats. Kalam claims that row, plays it, and
finishes it with results and a replay key. Soma's count clock then counts the result and marks the
row rated. The row serves as both the queue item and the durable history: the platform has no
message broker, and no clock calls Kalam to dispatch a match.

Claims carry leases and tokens, so the platform can recover a lost worker's match, and a stale
worker cannot finish someone else's attempt. The clocks fence their writes with run fences and a
roster epoch, so stale scheduling or rating work cannot change the field. Together they keep a
competitor's history free of duplicate or misattributed results.

## The clocks

Soma's four cron clocks make every competitive decision, and no other part of the platform makes
one. Each clock runs as a single instance across Soma's nodes.

| Clock | Every | Decides |
|---|---|---|
| admit | 20 s | Whether to admit an uploaded submission (or an admin's baseline): check the upload and the manifest and queue it for an admitting runner, then apply the platform's policy to what that runner reports |
| pair | 15 s | Which matches to queue: a waiting candidate's trial first, then what the ladder's demand asks for, on the season's boards in play |
| count | 10 s | Folds each finished match into ratings, and decides each finished trial: promote or reject |
| withdraw | 60 s | Cancels queued matches nobody can play any more, and closes a season once it has settled |

A clock does its work in SQL against the shared schema. Two wasm plugins hold the arithmetic SQL
is poor at, `tb.rating` (TrueSkill) and `tb.pairing` (who plays whom), and decide nothing the
clock does not write. [The life of a version](../competing/version-life.md) follows a version
through the clocks as a competitor sees it. `disabled` is a baseline's state alone: the baseline
stays out of play until an administrator enables it.

## Seasons

An administrator creates a season for one game, with a window and its rules, and the platform
addresses it by its slug everywhere. Its window sets its state (scheduled, open, then settling
after submissions close), and the withdraw clock closes it once every score has settled, or when an
administrator asks. Standings stay readable after the close.

**An administrator uploads a season's boards and baselines into it, and no release ships them.**
Soma checks a board file with the season's own engine, and the admit clock admits a baseline's two
files like any submission. Both land switched off, and the administrator turns each on or off until
the close. Every season's board must fit inside the envelope of the five basic boards in the Ants
release, so a model admitted today can play any board an administrator adds later.

[Seasons](../competing/seasons.md), [The trial](../competing/trial.md) and
[Ranking](../competing/ranking.md) set out the rules competitors play under.

## Runners and the runner gate

A Kalam **runner** is one Orion node playing four matches at once, one per lane. It holds no
database password and no bucket secret: it exchanges a runner key for a short-lived token, then
claims, renews, finishes and releases matches through Soma's **runner gate** (`/v1/runner/*`). The
gate's routes are the claim statements themselves and hold no state, and Soma grants its database
role only the execution columns. You can put a runner on a desk anywhere, and a compromised one can
at worst play poor moves. The claim carries every term the match is played under (the board, the
turn deadline, the turn limit, how many refusals a seat may make), taken from the season that owns
the match.

## What one entry touches

1. Web or an authenticated client asks Soma to record two hashes. Soma answers with two presigned
   `PUT` URLs, and **the competitor uploads**: nothing on the platform fetches from the internet.
2. Soma's admission clock checks that both files arrived and that the manifest hashes to what the
   competitor declared, rebuilds the registration from it, and queues the version for an admitting
   runner.
3. An admitting Kalam runner claims it through the runner gate, registers it on its own node, runs
   the node's admission (fetch, re-hash, read the graph, probe it), plays it over the game's
   reference observations, deletes it and reports what it measured. The admission clock applies the
   platform's policy to that report and verifies the candidate, and the pair clock queues its trial.
4. Each Kalam replica's roster clock registers, admits and activates the version **on its own
   node**, from the database. No clock ever calls a replica.
5. Kalam claims one match row and confirms its node can serve every seat's model.
6. Ants produces observations; one `model_infer` per seat adapts, runs and returns tensors; Kalam
   reads the policy head and hands Ants the actions. Kalam repeats the turn until the match ends.
7. Kalam uploads the replay and records the result under its claim token.
8. Soma's count clock counts the result or decides the trial. A trial pass promotes the version;
   later ordinary matches update its ratings.
9. Soma exposes version status, match results, standings, and signed replay reads.

Outside the cartridge, game state is opaque. An adapter is submitted data that the node's
expression engine evaluates; a competitor uploads no workflow. **Tensors never leave the model
call**, with one exception: the policy head. A result expression's document holds only the output
tensors, so it cannot gather at a unit's cells. The gather is a rule of the game: Kalam performs it,
and no competitor writes it.

## Releases and the engine digest

Every repository publishes its own artifact and commits nothing generated. **Ants publishes a
GitHub release**: the component, its manifests, the basic boards and the viewer, in one archive
named after the component's digest. Soma, Kalam and Web publish images from a version tag; the CLI
publishes binaries and a Homebrew formula.

**One Ants release is the ladder's engine.** Soma's image declares its digest and judges boards with
it, each runner plays it, the site's viewer and this book re-simulate replays with it, and the
starter kit pins it for competitors. They must agree. A runner on another digest claims nothing,
and a viewer built from another engine draws a plausible match that never happened. Publishing an
Ants release deploys it, so a deployment under a live season pins the release its images came from.

## Deployment and scaling

The local stack hosts Soma (its routes and its clocks) on one Orion instance using shared Postgres
runtime state and Redis. **Each Kalam replica is its own Orion**: a single instance with local state
and no cluster block. The stack runs no sidecars.

Shared scheduler state coordinates Soma's clocks across hosts. Each Kalam replica keeps its own
state, so several replicas play matches at once without contending for one global lock. For the
same reason, each replica's own clock registers a model on it, and nothing pushes a model to a
replica. A model is a per-node entity, and the database keeps the fleet in agreement.

**One bucket, two addresses.** Soma signs a competitor's upload for the public endpoint, and every
node fetches by the internal one. SigV4 signs the host, so a single variable for both gives a URL
only one side can use.

Every plugin and cartridge component carries an Ed25519 signature over its digest. Whoever holds
the deployment's trust key mints it, and a node quarantines the channels that need a component it
cannot verify.

Compose is the one deployment path; a cloud autoscaler and a production rollout pipeline are future
work.

## Boundaries to preserve

Only Soma's count clock writes competitive rating updates. Kalam's database role reaches only
execution fields, plus a column-level read of the roster that cannot see a verdict or a rating.
Nodes fetch an artifact by digest, so you can prove that what plays is what Soma admitted. The
platform can withdraw queued matches, but a match already running stays attributed to the versions
it paired. Replays and match records keep the engine digest and the Orion version you need to
investigate an outcome.

If you change a boundary, test its producer and consumer together. A package that loads and a
health endpoint that answers prove nothing about the admission, match or replay loop.
