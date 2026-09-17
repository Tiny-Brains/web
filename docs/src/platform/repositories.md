# The repositories

TinyBrains is developed as sibling repositories. For ordinary model competition,
your own model repository is separate from all of these. Use this map when you
need to inspect implementation behavior or contribute a platform change.

## The five application repositories

These are the parts of the running platform.

| Repository | Owns | Start reading |
|---|---|---|
| [Soma](https://github.com/Tiny-Brains/soma) | API, authentication, schema, season administration — and admission, pairing, rating, and the version lifecycle; ships the Soma node image | `channels/`, `workflows/`, `migrations/`, `scripts/gen-clocks.py`, `plugins/`, `docker/` |
| [Kalam](https://github.com/Tiny-Brains/kalam) | Match execution, claims, strikes, and replay upload; ships the runner image and its compose file | `scripts/gen-kalam.py`, `docker-compose.yml` |
| [Ants](https://github.com/Tiny-Brains/ants) | Game rules, generation, observations, replay reconstruction — **and the platform's trained entries**, in its `baselines/` | `engine/src/turn.rs`, `engine/src/observe.rs`, `engine/src/maps.rs`, `engine/src/replay.rs`, `viz/`, `baselines/` |
| [Web](https://github.com/Tiny-Brains/web) | Browser application and typed API client — **and this book**, in its `docs/`, and the local stack's compose file | `src/api.ts`, application components, proxy configuration, `docs/`, `docker-compose.yml` |
| [DevOps](https://github.com/Tiny-Brains/devops) | The design record and the cross-repository checks, until they are retired | `docs/decisions.md`, `scripts/check/configs.sh` |

## The three you can read as a competitor

Nothing here runs in the platform, and all three are written for you rather than about you.

| Where | What it is |
|---|---|
| [cli](https://github.com/Tiny-Brains/cli) | **The `tinybrains` binary** — matches, admission's checks, `conform`, and the training environment — released for macOS and Linux and installed with Homebrew. `src/wave.rs` is its copy of Kalam's match loop, and `src/matchfile.rs` the match-file format |
| [ants-starter](https://github.com/Tiny-Brains/ants-starter) | **The Ants starter kit** — a working nano entry that admits unchanged, `train.py`, the one command that retrains it, and two match files. The place to start, and the one repository to clone; every game gets a `<game>-starter` |
| [ants/baselines](https://github.com/Tiny-Brains/ants/tree/main/baselines) | The platform's own trained entries and how they were trained — competitor entries the platform happens to own, kept beside the rules they encode. The starter's `train.py` installs it as a library. `src/tb_baselines/planes.py` is where the [walkthrough](../models/adapters/walkthrough.md) reads its manifest from |

> **There is no model-runner repository.** `axon` was one until 15 September 2026; Orion's own
> `models` entity replaced it whole, so ONNX loading, the expression language and the operation
> budget are the *server's* now rather than a service this platform maintains.
> [The archived repository](https://github.com/Tiny-Brains/axon) maps each call it answered to what
> answers it today.
>
> **There is no match-maker repository either.** `jodi` held the admission, pairing, counting and
> withdraw clocks and the rating and pairing plugins until 16 September 2026; they always ran in
> Soma's server, and they are Soma's now. [Its repository](https://github.com/Tiny-Brains/jodi) is
> history only.
>
> **The baselines are not a repository any more.** They were `ants-baselines` until 16 September
> 2026 and are `baselines/` inside Ants now, because what a baseline encodes is what the cartridge
> sends, and a change to one was a commit in each.
>
> **There is no practice repository.** `drill` held match files, untrained fixtures and a copy of
> the board catalogue until 17 September 2026. A competitor needs the starter and this book: the
> match-file format is in [Testing](../models/testing.md#match-files), the boards come with the
> cartridge, and what the fixtures taught is in [What your model answers](../models/actions.md) and
> [Model format](../models/format.md). [The archived repository](https://github.com/Tiny-Brains/drill)
> is history only.

## Which repository owns a change?

A rule or observation change belongs in Ants, with matching competitor docs and adapter
compatibility checks. **An evaluator operator or operation-count change belongs upstream**, in
datalogic — it is not this platform's to make, which is why the operator reference points at what
the engine has rather than at a list somebody here maintains. A submission check can span Soma's
request contract, the admission clock's verdict, and the facts the node reports; identify each responsibility
before editing.

Match execution and result persistence belong in Kalam; rating math and opponent
selection belong in Soma's clocks and plugins. Database definitions always originate in
Soma, whichever package consumes them. Deployment addresses and secret wiring belong
in DevOps rather than embedded in package definitions.

## Generated artifacts ship as releases and images, not as commits

**Nothing generated is committed.** Since 10 September 2026 each repository's build output — Ants'
`tb-ants.wasm`, `cartridge.json` and viewer bundle; Kalam's generated channels and workflows; and
the wasm plugins — ships from that repository, and a consumer names what it takes rather than
reading a sibling checkout. **Ants publishes a GitHub release**: its `build` workflow runs the gate
on every push, and on request packs every artifact into one archive tagged after the engine it
carries. The packages ship as **artifact images** their `Dockerfile`s build. Kalam still keeps a readable Python
generator, and that is still what you run while working in it; it is simply no longer what ships.
**One exception:** Soma's clock channels and workflows are generated by `scripts/gen-clocks.py`
*and committed*, beside the routes they share a package with, and `--check` fails a hand edit.

**Kalam does not vendor the cartridge.** It used to hold a committed copy, so two copies of one
component existed and could drift silently — and did. Kalam's image now fetches the component from
Ants' latest release when it builds, so publishing an Ants release *is* what moves the engine the
ladder plays. A deployment under a live season should pin `ANTS_RELEASE` to a tag: a digest that
moves under a live season leaves every queued match unclaimable.

Every plugin also needs a valid Ed25519 signature over its digest, which the deployment mints
because it holds the trust key. Re-sign after any plugin or engine rebuild or the node comes up
degraded with its channels quarantined.

**No checkout is required to run the stack.** [Running locally](running-locally.md) gives the
commands; sibling checkouts are only where the images are built from by default.

## What is not supplied yet

A cloud autoscaler and a finished production rollout pipeline are not in these repositories;
Compose is the implemented deployment path.

Three things this section used to list as missing now exist, and are worth knowing about: the
standalone match runner is [`tinybrains`](../models/testing.md), which plays a model against a
model with no server; the replay viewer is the cartridge's own and is what plays every match on
this page and on the site; and a training loop can drive the real engine through
[`tinybrains env`](../models/testing.md#train-against-the-real-engine) instead of a second
implementation in Python.
