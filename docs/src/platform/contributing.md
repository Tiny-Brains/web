# Contributing

A useful contribution makes competition easier to understand, enter, run, or
verify. Start by identifying the [repository](repositories.md) that owns the
behavior and reading its README, source, and relevant tests. The application
repositories are separate Git checkouts even when developed under one parent.

## Where things are written

| Where | What it holds |
|---|---|
| This section | How the platform is built, at the level of its parts and their contracts |
| A repository's `README.md` | How to run, configure, operate and release it; its layout, its invariants and its known gaps |
| A repository's `CLAUDE.md` | The checks to run after a change, and the rules and pitfalls the code does not state |
| The source | Everything else: statements, workflow descriptions and comments are the specification |

There is no decision log and no status log. A repository's **Known gaps** section is its open
work; keep it current in the change that opens or closes a gap. Verify claims against the current
producer and consumer before copying them into code or docs. For a user-visible change, describe
the competitor's trigger and resulting behavior rather than only the internal component involved.

Every repository commits straight to `main`; there are no feature branches.

## Source conventions

**Soma's and Kalam's packages are committed whole** and edited directly — there is no generator
and nothing to regenerate. The built plugins and Ants' artifacts are gitignored and ship in each
repository's image or, for Ants, its GitHub release.

**Rebuilding Ants is what updates the engine Kalam plays**, because Kalam's image takes the
component from Ants' release rather than vendoring a copy. Any source edit to the component,
comments included, changes its digest, so prove a refactor with artifact diffs and per-turn output
hashes rather than with the wasm, and re-sign the plugins afterwards.

Put schema changes in Soma's two migration files, rewritten in place while the schema is
pre-release, and check every consuming package. Keep deployment addresses and credentials in
configuration. Use the pinned Orion version when linting definitions; a different version can
report misleading compatibility failures.

## Checks that matter

Run checks appropriate to the repository and changed boundary:

| Area | Existing checks, from that repository's root |
|---|---|
| Docs | `mdbook build`; `tutorials/build.sh`, whose digest check refuses a replay the vendored viewer cannot faithfully draw |
| Ants | `./build.sh` — the determinism check, `cargo test` in `engine/`, then every artifact into `dist/`; `viz/build.sh` for the viewer |
| Soma plugins | `cargo test --manifest-path plugins/Cargo.toml`, both crates |
| Soma, Kalam definitions | `./scripts/check-defs.sh` and `./scripts/check-sql.sh`; Soma's `./scripts/verify/run.sh` |
| Web | `npm run lint` and `npm run build` |
| The stack | web's `./scripts/check/configs.sh`, and a representative end-to-end flow on web's compose stack with a Kalam runner (`scripts/dev/submission-storm.py`) |
| CLI | `cargo fmt --check`, `cargo clippy --locked --release -- -D warnings`, and the starter kit's match played with the build; `tinybrains conform` on a ladder replay after a change to the match loop |

`check/configs.sh` is the one that spans repositories: it asserts the constants that must be equal
on both sides of a boundary — the engine digest against what the season and each replica name,
the model prefix, the adapter budget and the Orion version.

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
platform section unless they explain a practical limitation, and keep them at the
level of parts and contracts — the source is the specification. Label planned tools
clearly and avoid describing a design proposal as a working endpoint. Write what is
true now; a page does not record what used to be.

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
