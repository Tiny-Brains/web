# Contributing

A useful contribution makes competition easier to understand, enter, run or verify. Start by
finding the [repository](repositories.md) that owns the behavior, then read its README, its source
and the relevant tests. The application repositories are separate Git checkouts, even when you
develop them under one parent directory.

## Where things are written

| Where | What it holds |
|---|---|
| This section | How the platform is built, at the level of its parts and their contracts |
| A repository's `README.md` | How to run, configure, operate and release it; its layout, its invariants and its known gaps |
| A repository's `CLAUDE.md` | The checks to run after a change, and the rules and pitfalls the code does not state |
| The source | Everything else: statements, workflow descriptions and comments are the specification |

The platform keeps no decision log and no status log. A repository's **Known gaps** section is its
open work: keep it current in the change that opens or closes a gap. Verify a claim against the
current producer and consumer before you copy it into code or docs. For a user-visible change,
describe what the competitor does and what they then see, as well as the internal component
involved.

Every repository commits straight to `main`; there are no feature branches.

## Source conventions

**Soma's and Kalam's packages are committed whole**, and you edit the committed files: there is no
generator and nothing to regenerate. The built plugins and Ants' artifacts stay out of git and ship
in each repository's image, or, for Ants, its GitHub release.

**Publishing an Ants release updates the engine Kalam plays**: Kalam's image takes the component
from Ants' latest release, or the tag `ANTS_RELEASE` names, and vendors no copy. A local rebuild
reaches a Kalam image only when you build it with `--build-context ants=<an ants dist/>`. Any source
edit to the component changes its digest, comments included. Prove a refactor with artifact diffs
and per-turn output hashes, since the wasm itself changes, and re-sign the plugins after.

Put schema changes in Soma's two migration files, and rewrite them in place while the schema is
pre-release; then check every consuming package. Keep deployment addresses and credentials in
configuration. Lint definitions with the pinned Orion version, because another version can report
misleading compatibility failures.

## Checks that matter

Run the checks for the repository and the boundary you changed:

| Area | Existing checks, from that repository's root |
|---|---|
| Docs | `mdbook build`; `tutorials/build.sh`, whose digest check refuses a replay the vendored viewer would draw wrong |
| Ants | `./build.sh`: the determinism check, `cargo test` in `engine/`, then every artifact into `dist/`; `viz/build.sh` for the viewer |
| Soma plugins | `cargo test --manifest-path plugins/Cargo.toml`, both crates |
| Soma, Kalam definitions | `./scripts/check-defs.sh` in both, which runs `./scripts/check-names.sh`; Soma's `./scripts/check-sql.sh` and `./scripts/verify/run.sh` |
| Web | `npm run lint` and `npm run build` |
| The stack | web's `./scripts/check/configs.sh`, and a representative end-to-end flow on web's compose stack with a Kalam runner (`scripts/dev/submission-storm.py`) |
| CLI | `cargo fmt --check`, `cargo clippy --locked --release -- -D warnings`, and the starter kit's match played with the build; `tinybrains conform` on a ladder replay after a change to the match loop |

`check/configs.sh` spans repositories: it asserts the constants that must be equal on both sides of
a boundary (the engine digest against what the season and each replica name, the model prefix, the
adapter budget and the Orion version).

The SQL checks create disposable scratch databases and verify shipped statements; they prove
nothing about live scheduling or concurrency. The configuration checks can skip runtime parsing when
the required image is missing. `tinybrains conform` keeps the CLI's match loop and Kalam's workflow
in agreement, and it needs a replay to run against. Report what ran, including those limits.

Exercise an API contract change through the HTTP workflow. A game or adapter change needs
behavioral examples. A replay change needs a reconstruction from a real stored envelope; an
engine-internal fixture is not enough. Use a local stack for integration evidence where unit checks
cannot establish the result.

## Writing documentation

Address competitors first: what they need to build, what the platform checks, what they can observe,
and what to do next. Keep architecture in this platform section unless it explains a practical
limitation, and keep it at the level of parts and contracts: the source is the specification. Label
planned tools as planned, and never describe a design proposal as a working endpoint. Write what is
true now, and leave out what used to be.

Use relative links within the book, and keep `src/SUMMARY.md` aligned with the pages. A replay
placeholder states the behavior it will illustrate and keeps a text explanation. Record real replay
and engine identities once you have the assets, and never invent a game result to fill an example
slot.

## Opening a change

Explain the concrete problem and the behavior after the change, list the contracts it touches, and
give the checks that support it. Include generated or vendored output where the change needs it,
and update the competitor-facing documentation in the same change. For a cross-repository change,
name the companion revisions it needs and the deployment order, so reviewers can assess a
consistent set of artifacts.

A report gives the relevant version or match ID, the expected and the observed behavior, and steps
to reproduce it. Leave out session cookies and deployment credentials. Keep the failing input or
replay where you can, so whoever fixes it can verify the fix against the original problem.
