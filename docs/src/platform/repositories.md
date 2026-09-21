# The repositories

TinyBrains lives in sibling repositories. To compete, you keep your model in a repository of your
own, apart from all of these. Use this map to inspect how the platform behaves or to contribute a
change to it.

## The four application repositories

These four make up the running platform.

| Repository | Owns | Start reading |
|---|---|---|
| [Soma](https://github.com/Tiny-Brains/soma) | API, authentication, schema, season administration and the runner gate, plus admission, pairing, rating and the version lifecycle; ships the Soma node image | `channels/`, `workflows/`, `sql/`, `migrations/`, `plugins/`, `docker/` |
| [Kalam](https://github.com/Tiny-Brains/kalam) | Match execution, claims, strikes, and replay upload; ships the runner image and its compose file | `workflows/`, `channels/`, `docker/`, `docker-compose.yml` |
| [Ants](https://github.com/Tiny-Brains/ants) | Game rules, observations, replay reconstruction and the viewer, plus **how the platform's entries are trained**, in its `baselines/` | `engine/src/turn.rs`, `engine/src/observe.rs`, `engine/src/maps.rs`, `engine/src/replay.rs`, `viz/`, `baselines/` |
| [Web](https://github.com/Tiny-Brains/web) | Browser application and typed API client, plus **this book** in its `docs/`, and the local stack's compose file | `src/api/client.ts`, application components, proxy configuration, `docs/`, `docker-compose.yml` |

## The three you can read as a competitor

None of these runs in the platform, and all three are written for you.

| Where | What it is |
|---|---|
| [cli](https://github.com/Tiny-Brains/cli) | **The `tinybrains` binary**: matches, admission's checks, `conform` and the training environment, released for macOS, Linux and Windows and installed with Homebrew. `src/wave.rs` is its copy of Kalam's match loop, and `src/matchfile.rs` the match-file format |
| [ants-starter](https://github.com/Tiny-Brains/ants-starter) | **The Ants starter kit**: a working nano entry that admits unchanged, `train.py` (the one command that retrains it), three trained opponents in `models/` and two match files. Start here: it is the one repository to clone, and every game gets a `<game>-starter` |
| [ants/baselines](https://github.com/Tiny-Brains/ants/tree/main/baselines) | How the platform's entries are trained: the encoding, the teacher, the learners and the export, beside the rules they encode. It commits no model: the trained ones live in the starter, and an administrator uploads a season's baselines into the season. The starter's `train.py` installs it as a library. The [walkthrough](../models/adapters/walkthrough.md) reads its manifest from `src/tb_baselines/planes.py` |

Orion's own `models` entity does ONNX loading, the expression language and the operation budget, so
there is no model-runner repository. Soma's clocks do admission, pairing, counting, withdrawal and
lease reaping, so there is no match-maker repository either.

## Which repository owns a change?

A rule or observation change belongs in Ants, with matching competitor docs and adapter
compatibility checks. **An evaluator operator or operation-count change belongs upstream**, in
datalogic. This platform cannot make it, so the operator reference points at what the engine has
and keeps no list of its own. A submission check can span Soma's request contract, the admission
clock's verdict and the facts the node reports: identify each responsibility before you edit.

Match execution and result persistence belong in Kalam; rating math and opponent selection belong
in Soma's clocks and plugins. Soma owns every database definition, whichever package consumes it.
Deployment addresses and secrets belong in each image's environment, and never in package
definitions.

## Generated artifacts ship as releases and images, not as commits

**No repository commits what it generates.** Each ships its own build output (Ants' `tb-ants.wasm`,
`cartridge.json` and viewer bundle, and the wasm plugins), and a consumer names the artifact it
takes and reads no sibling checkout. **Ants publishes a GitHub release**: its `build` workflow runs
the gate on every push, and on request packs every artifact into one archive tagged after the
engine it carries. Soma, Kalam and Web ship images their `Dockerfile`s build. Soma's and Kalam's
packages are **authored JSON, committed whole**: channels, workflows, connectors, and in Soma the
`sql/` files its workflows name. Kalam ships no SQL, because every statement a runner needs is a
call to Soma's gate. Neither has a generator: `orion-server compile` resolves the authoring forms
(`$from`, `$use`, `$each`, `$sql`) into what the admin API accepts.

**Kalam does not vendor the cartridge.** Its image build fetches the component from Ants' latest
release, so publishing an Ants release moves the engine the ladder plays. A deployment under a live
season should pin `ANTS_RELEASE` to a tag. If you let the digest move under a live season, runners
can claim none of its queued matches.

Every plugin also needs a valid Ed25519 signature over its digest. The deployment mints it, because
the deployment holds the trust key. Re-sign after any plugin or engine rebuild: a stale signature
quarantines the channels that call the plugin, and the node stops at its boot apply.

**You need no checkout to run the stack.** [Running locally](running-locally.md) gives the
commands. A sibling checkout matters only when you build an image, as the build's default source.

## What is not supplied yet

Compose is the deployment path these repositories implement. None of them holds a cloud autoscaler
or a finished production rollout pipeline.
