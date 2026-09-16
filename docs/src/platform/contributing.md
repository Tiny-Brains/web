# Contributing

A useful contribution makes competition easier to understand, enter, run, or
verify. Start by identifying the [repository](repositories.md) that owns the
behavior and reading its README, source, and relevant tests. The application
repositories are separate Git checkouts even when developed under one parent.

## Choosing work

Each repository carries its own design documents under `docs/`, and DevOps carries
the whole-system map, the decision log, the deployment design, and the Orion notes.
Verify claims against the current producer and consumer before copying them into
code or docs.

Each repository's open work is the **Status** block of its own `README.md`, which is the list to
read before starting — the browser replay viewer, the envelope integration and the cartridge-owned
reference observation set were all on this page as open areas and are all shipped. Production
rollout verification and the cloud autoscaler are still open. For a user-visible change, describe
the competitor's trigger and resulting behavior rather than only the internal component involved.

Every repository commits straight to `main`; there are no feature branches.

## Source conventions

Edit Jodi and Kalam workflows in their Python generators and regenerate — but **do not commit the
output**. Generated JSON, built plugins and Ants' artifacts are gitignored and ship in each
repository's artifact image instead, so what a change carries is the generator edit; the image is
rebuilt from it. `gen-jodi.py --check` guards the generated workflows against a hand edit.

**Rebuilding Ants is what updates the engine Kalam plays**, because Kalam's image takes the
component from Ants' rather than vendoring a copy. A rebuild changes the digest even when no
behaviour changed, so prove a refactor with artifact diffs and per-turn output hashes rather than
with the wasm, and re-sign the plugins afterwards.

Put schema changes in Soma migrations and check every consuming package. Keep
deployment addresses and credentials in configuration. Use the pinned Orion
version when linting definitions; a different version can report misleading
compatibility failures.

## Checks that matter

Run checks appropriate to the repository and changed boundary:

| Area | Existing checks, from that repository's root |
|---|---|
| Docs | `mdbook build`; `tutorials/build.sh`, whose digest check refuses a replay the vendored viewer cannot faithfully draw |
| Ants | `./deny.sh`, `cargo test`, and `./build.sh` for regenerated artifacts |
| Jodi plugins | `cargo test --manifest-path plugins/tb-rating/Cargo.toml` and the corresponding pairing manifest |
| Soma, Jodi, Kalam definitions | `orion-server lint . --deny-warnings`, `./scripts/check-defs.sh`, and `./scripts/check-sql.sh` |
| Web | `npm run lint` and `npm run build` |
| DevOps | `./scripts/check/configs.sh`, loader output, `cargo build` in `cli/`, and a representative end-to-end flow |

`check/configs.sh` is the one that spans repositories: it asserts the constants that must be equal
on both sides of a boundary — Kalam's strike ceiling against Jodi's forfeit count, the priors Soma
and Jodi share, the engine digest against what the season and each replica name, the model prefix,
the adapter budget and the Orion version.

SQL checks create disposable scratch databases and verify shipped statements; they do not prove
live scheduling or concurrency. Configuration checks can skip runtime parsing when the required
image is missing. `tinybrains conform` is the check that keeps the CLI's match loop and Kalam's
workflow telling the same story, and it needs a replay to run against. Report what actually ran,
including those limits.

An API contract change should be exercised through the HTTP workflow. A game or
adapter change needs behavioral examples. A replay change needs reconstruction
from an actual stored envelope, not only an engine-internal fixture. Use a local
stack for integration evidence where unit checks cannot establish the result.

## Writing documentation

Address competitors first: what they need to build, what the platform checks,
what they can observe, and what to do next. Keep architecture details in this
platform section unless they explain a practical limitation. Label planned tools
clearly and avoid describing a design proposal as a working endpoint.

Use relative links within the book and keep `src/SUMMARY.md` aligned with pages.
A replay placeholder should state the behavior to illustrate and retain a text
explanation. Record real replay/engine identities when assets become available;
do not invent a game result to fill an example slot.

## Opening a change

Explain the concrete problem and resulting behavior, list affected contracts,
and give the checks that support the change. Include generated or vendored output
where needed and update the competitor-facing documentation in the same work.
For cross-repository changes, name the required companion revisions and deployment
order so reviewers can assess a consistent set of artifacts.

A report should include the relevant version or match ID, expected and actual
behavior, and reproducible steps. Do not include session cookies or deployment
credentials. Preserve the failing input or replay where possible so a fix can be
verified against the original problem.
