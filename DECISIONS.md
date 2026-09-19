# Decisions — web and its local stack

Why web and its local stack is shaped the way it is: the part of TinyBrains' decision record about this
repository. One line per decision, with the reasoning kept and the cost of flipping it named where
that was worked out.

> **The record was one file until 17 September 2026**, `devops/docs/decisions.md`. When devops
> stopped running anything (N25) it was split, so each decision lives in the repository it is
> about. **The numbers are the record's, not this file's**: they were assigned once across the
> platform and are never reused, so a citation of `41` or `N24` names one decision wherever it now
> lives, and a section number below is the one the whole record gave it.
>
> **Four numbering series.** The **A-series** is the twenty-one architectural decisions taken
> before anything was built. The **plain series** is the build decisions the layers took, numbering
> from 1 again, so `A5` and `5` are different decisions and a bare number in a code comment means
> the plain series. The **R-series** is the Orion 1.8.1 rebuild and the **N-series** the runner, the
> submission path and where each repository's artifacts come from.

## Where the rest of the record is

| Decisions | Where they live |
|---|---|
| **A1–A21**, §2's review findings and the Orion changes asked for | [soma](https://github.com/Tiny-Brains/soma/blob/main/docs/decisions.md) |
| Plain series: the match table (2, 3, 7, 7c, 7d, 18, 21, 22), the clocks (1, 7–13, 23, 24, 28, 51–59), admission (20, 35–40), the retired loader (6, 34, 46, the adapter cap) and deployment 43, 44, 48 | [soma](https://github.com/Tiny-Brains/soma/blob/main/docs/decisions.md) |
| Plain series: the wave (19, 33) and deployment 5, 25, 41, 42, 45 | [kalam](https://github.com/Tiny-Brains/kalam/blob/main/docs/decisions.md) |
| Plain series: the game and the protocol (4, 14–16), the baselines (49, 50 of the loader's) | [ants](https://github.com/Tiny-Brains/ants/blob/main/DECISIONS.md) |
| Plain series: the training environment (47, 48 of the loader's) | [cli](https://github.com/Tiny-Brains/cli/blob/main/DECISIONS.md) |
| Plain series: deployment 47 and 49 (the compose file's) | [web](https://github.com/Tiny-Brains/web/blob/main/DECISIONS.md) |
| **R1, R2, R4, R6, R9, R10, R11** · **R3, R7, R8** · **R5** | soma · kalam · ants |
| **N3, N6–N8, N12, N13, N15–N19, N28** · **N1, N2, N4, N5, N9** · **N20–N22, N24, N27** · **N23** · **N25** | soma · kalam · ants · cli · web |
| Still open | the repository each is forced in: 30, 31, N14 and three unnumbered in soma; N10 and a runner on another network in kalam; 32 in ants; 26, 27, N11 and the orchestrator in web |

The plain series collides with itself once: the retired loader's **47, 48, 49** and deployment's
**47, 48, 49** are different decisions, told apart above by where each lives.

---

## 3. Build decisions

Numbered as the build numbered them. Each names the repository it now lives in.

### Deployment — decided in `devops`, which runs nothing since N25

| # | Decision | Taken as | Why |
|---|---|---|---|
| 47 | How a package reaches a node | **mounted from its artifact image** — `type: image`, `image: {subpath: artifacts}` — never copied into a volume | a volume is a MUTABLE snapshot of an immutable image, so it can be older than its source with nothing erroring; that produced the 10 September unsigned-plugin load, a check in `configs.sh` whose only job was catching it, and a rule to re-run four one-shots. Mounting deletes the thing that can be stale. Compose tracks the source image ID, so a rebuild recreates every consumer on a plain `up -d` — including a replica, which re-derives `KALAM_ENGINE_DIGEST`. Cost: Compose will not BUILD an image it only mounts, so build definitions live in a never-started `build` profile |
| 49 | How the second replica is added | **an overlay file, `docker-compose.fleet.yml`**, not a profile | a profile can add a service but cannot touch another service's environment, so `--profile fleet` needed a second hand edit putting kalam-2 into `KALAM_ORION_ADMINS` — and half-applied, that is a replica that is READY, carries no wave channel, claims nothing and counts as capacity. One file makes the halves inseparable. The replica `extends` a `scale: 0` base service: `scale` and not a profile, because `extends` copies profiles and a sequence merge appends rather than replaces |

---

## 4b. The N-series — a runner leaves the deployment, and GitHub leaves the submission path

Taken and built 16 September 2026, as two tracks decided together because each removed a dependency
that was not earning its place. They shared one thread — the models bucket, which lets a runner read
artifacts without a secret and is the submission path's audit trail — and no file. The proposal and
its phased plan (`docs/design.md`, `docs/design-plan.md`) were deleted once they were all record;
what they argued is here and in [`architecture.md`](https://github.com/Tiny-Brains/soma/blob/main/docs/architecture.md) §3a, the statements and routes
are `soma/docs/schema.md` §3.8a, §4 and §4a, the operator's page is [`deployment.md`](https://github.com/Tiny-Brains/kalam/blob/main/docs/deployment.md)
§11, and what each phase turned up is in the Status blocks of `soma`, `kalam`, `devops` and `web`.
N10, N11 and N14 are still open, in §5.

### Each repository runs itself

| # | Question | Decision | What it overturns, and what it cost |
|---|---|---|---|
| N25 | Does a deployment repository assemble the platform? | **No. Every repository releases its own image on a `v*` tag, and the compose files live with the images they run.** Soma's image is a **node** — orion-server, `docker/soma.toml.tmpl`, the package and the cartridge of one ants release — whose `serve` loads its own package at boot (and stops on a plugin that did not verify) and whose `bootstrap` does the loader's database work: `orion_state`, the migrations under a recorded digest, a mounted seed, the `runner_gate` password, the engine digest and the cartridge registration. Kalam's image is a **runner** — `docker/runner.toml.tmpl`, the package and the engine — and its `docker-compose.yml` is one service needing a Soma URL, a key and the trust key. Web's `docker-compose.yml` is the local platform: Postgres, Redis, MinIO with a `buckets` one-shot (buckets, public read, the models read key), `soma-bootstrap`, `soma`, orion-ui and web, the book built by a `docs` service handed in as `service:docs`; `scripts/setup/` and two dev scripts came with it. Each release workflow runs on arm64, builds every compiling or fetching stage on the build platform so amd64 and arm64 carry identical packages, checks that with a diff, resolves the latest ants release once (or the repository variable `ANTS_RELEASE`) and labels the image with it, and pushes `ghcr.io/tiny-brains/<repo>` only for a tag on main. The Orion image, the loader, the fleet and dev overlays and `models-read-key.sh` are deleted; `kalam.toml.tmpl` stays here, run by nothing, for `configs.sh` | Decisions **41**'s in-cluster `db`-mode replicas, **47**'s packages mounted from carrier images into a devops-built Orion, and the loader as the one writer of deployment facts. **Cost:** no Kalam runs inside the local stack — matches need a runner started from kalam's checkout against `host.docker.internal`, with a key minted after an admin has signed in; the engine now agrees by BUILD, so a Soma and a runner built on either side of an ants release are two engines and the runner claims nothing; each Soma node applies its package itself, so a cluster of N does it N times (idempotent by content); every release image needs GitHub reachable at build; `configs.sh` and three dev scripts stay here reading sibling paths and web's container names; and until the first tags are pushed, `ghcr.io/tiny-brains/*:latest` does not exist and a fresh machine builds Soma and Kalam locally |

---

## 5. Still open

| # | Decision | Forced at | Note |
|---|---|---|---|
| 26 | Session mechanism | web | — |
| 27 | The front-page ladder | web | open is fullest and most legible to a newcomer; a weight class is where the thesis lives |
| N11 | Multi-arch images: both, or arm64 only? | CI | *(answered by N25: every release publishes one tag for amd64 and arm64.)* **A distribution question now, not a portability one**: a runner on arm64 derived the same `engine_digest` as the amd64 declaration, because the cartridge is `wasm32` (`configs.sh` §1j asserts it), and the Orion image is `TARGETARCH`-aware. What is missing is a CI that publishes a manifest list so one tag serves both — and **no repository but `web` has CI at all**. Until then `ORION_REF` and `KALAM_REF` must name images built for the runner's architecture |
| — | The orchestrator | deployment | Kubernetes and Cloudflare Containers behind a Worker are both viable; everything in the deployment layer is expressed as *the orchestrator's grace period*, *the scaler's target*, *an init step* and *a secret store* so that it stays that way |
