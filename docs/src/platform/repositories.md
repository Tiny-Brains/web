# The repositories

TinyBrains is developed as sibling repositories. For ordinary model competition,
your own model repository is separate from all of these. Use this map when you
need to inspect implementation behavior or contribute a platform change.

## The four application repositories

These are the parts of the running platform.

| Repository | Owns | Start reading |
|---|---|---|
| [Soma](https://github.com/Tiny-Brains/soma) | API, authentication, schema, season administration, the runner gate — and admission, pairing, rating, and the version lifecycle; ships the Soma node image | `channels/`, `workflows/`, `sql/`, `migrations/`, `plugins/`, `docker/` |
| [Kalam](https://github.com/Tiny-Brains/kalam) | Match execution, claims, strikes, and replay upload; ships the runner image and its compose file | `workflows/`, `channels/`, `sql/`, `docker-compose.yml` |
| [Ants](https://github.com/Tiny-Brains/ants) | Game rules, observations, replay reconstruction and the viewer — **and how the platform's entries are trained**, in its `baselines/` | `engine/src/turn.rs`, `engine/src/observe.rs`, `engine/src/maps.rs`, `engine/src/replay.rs`, `viz/`, `baselines/` |
| [Web](https://github.com/Tiny-Brains/web) | Browser application and typed API client — **and this book**, in its `docs/`, and the local stack's compose file | `src/api/client.ts`, application components, proxy configuration, `docs/`, `docker-compose.yml` |

## The three you can read as a competitor

Nothing here runs in the platform, and all three are written for you rather than about you.

| Where | What it is |
|---|---|
| [cli](https://github.com/Tiny-Brains/cli) | **The `tinybrains` binary** — matches, admission's checks, `conform`, and the training environment — released for macOS, Linux and Windows and installed with Homebrew. `src/wave.rs` is its copy of Kalam's match loop, and `src/matchfile.rs` the match-file format |
| [ants-starter](https://github.com/Tiny-Brains/ants-starter) | **The Ants starter kit** — a working nano entry that admits unchanged, `train.py`, the one command that retrains it, three trained opponents in `models/` and two match files. The place to start, and the one repository to clone; every game gets a `<game>-starter` |
| [ants/baselines](https://github.com/Tiny-Brains/ants/tree/main/baselines) | How the platform's entries are trained — the encoding, the teacher, the learners and the export, kept beside the rules they encode. It commits no model: the trained ones live in the starter, and a season's baselines are uploaded into it. The starter's `train.py` installs it as a library. `src/tb_baselines/planes.py` is where the [walkthrough](../models/adapters/walkthrough.md) reads its manifest from |

There is no model-runner repository — ONNX loading, the expression language and the operation
budget are Orion's own `models` entity — and no match-maker repository: admission, pairing,
counting and withdrawal are Soma's clocks.

## Which repository owns a change?

A rule or observation change belongs in Ants, with matching competitor docs and adapter
compatibility checks. **An evaluator operator or operation-count change belongs upstream**, in
datalogic — it is not this platform's to make, which is why the operator reference points at what
the engine has rather than at a list somebody here maintains. A submission check can span Soma's
request contract, the admission clock's verdict, and the facts the node reports; identify each
responsibility before editing.

Match execution and result persistence belong in Kalam; rating math and opponent
selection belong in Soma's clocks and plugins. Database definitions always originate in
Soma, whichever package consumes them. Deployment addresses and secrets belong in each
image's environment rather than embedded in package definitions.

## Generated artifacts ship as releases and images, not as commits

**Nothing generated is committed.** Each repository's build output — Ants' `tb-ants.wasm`,
`cartridge.json` and viewer bundle; and the wasm plugins — ships from that repository, and a consumer names what it takes rather than reading a
sibling checkout. **Ants publishes a GitHub release**: its `build` workflow runs the gate on every
push, and on request packs every artifact into one archive tagged after the engine it carries.
Soma, Kalam and Web ship images their `Dockerfile`s build. Soma's and Kalam's packages are
**authored JSON, committed whole** — channels, workflows, connectors, and in Soma the `sql/`
files its workflows name; Kalam ships no SQL, because every statement a runner needs is a call to
Soma's gate. Neither has a generator: `orion-server compile` resolves the authoring forms
(`$from`, `$use`, `$each`, `$sql`) into what the admin API accepts.

**Kalam does not vendor the cartridge.** Its image fetches the component from Ants' latest release
when it builds, so publishing an Ants release *is* what moves the engine the ladder plays. A
deployment under a live season should pin `ANTS_RELEASE` to a tag: a digest that moves under a live
season leaves every queued match unclaimable.

Every plugin also needs a valid Ed25519 signature over its digest, which the deployment mints
because it holds the trust key. Re-sign after any plugin or engine rebuild or the node comes up
degraded with its channels quarantined.

**No checkout is required to run the stack.** [Running locally](running-locally.md) gives the
commands; sibling checkouts are only where the images are built from by default.

## What is not supplied yet

A cloud autoscaler and a finished production rollout pipeline are not in these repositories;
Compose is the implemented deployment path.
