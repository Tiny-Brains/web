# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this directory.

## What this directory is

`web/docs/` is the TinyBrains competitor guide: an mdBook served at **`tinybrains.dev/docs`**, which
is the only place it is served. It was `Tiny-Brains/docs`, its own repository, until 16 September
2026; it is a subdirectory of `web/` because the book has no host of its own and is not going to get
one, so the application that serves it and the book it serves now ship together. `../CLAUDE.md` is
web's guide and `../../CLAUDE.md` the platform's.

Nothing here runs in the platform, but the book *restates* numbers and behaviour other repos own,
and it *embeds real engine output*.

**This directory keeps its own toolchain and its own artifact.** mdBook, python3 and the
`tinybrains` binary build it; `Dockerfile` publishes the rendered book as `DOCS_REF` and web's
`Dockerfile` copies it in. Nothing here is part of the node build next door — `../.dockerignore`
excludes `docs/`, and `../.github/workflows/check.yml` does not run mdBook.

`README.md` is this directory's map, in the same shape as every repo's (Scope / Where it sits /
Interface / Run it, test it / What a deployment owes it / Layout / What must stay true / Status).
Read its **What must stay true** before touching `theme/` or a replay, and update its **Status**
when work lands. The page inventory lives in `src/SUMMARY.md` and nowhere else; the replay-slot
inventory is `grep -rn 'replay-visualiser:' src`.

## Commands

```sh
mdbook build                  # the whole check: create-missing = false, so a SUMMARY entry
                              # without a file is an error, not a new stub
mdbook serve                  # chapters only -- it overrides site-url with "/", and the palette
                              # comes from the app's origin, so this is NOT how a reader sees it
(cd .. && npm run dev)        # THE REAL PREVIEW, at localhost:5173/docs/ -- it serves ./book,
                              # which `npm run vendor:book` fills from the image on a fresh
                              # checkout and which `mdbook build` overwrites once you can run it
tutorials/build.sh            # regenerate the teaching replays and re-vendor the viewer
python3 studio/studio.py link src/models/adapters/studio/<name>.json   # one example's Studio URL
```

There is no test suite and no linter. **Nothing generated is committed**: `book/`, `src/viz/`,
`src/tutorials/`, `tutorials/boards/*.json` and the scenario replays under `tutorials/replays/` are
all gitignored. `Dockerfile` rebuilds them, taking the viewer from the cartridge's artifact image
and the `tinybrains` binary from devops', so building the book needs neither a sibling checkout nor
a Rust toolchain.

The one exception is `tutorials/replays/real-match.json`, which is **source**: a real match captured
from a running stack, which nothing here can reproduce.

`tutorials/build.sh` still runs by hand — it needs `tinybrains` on PATH and a viewer at
`$ANTS_DIST/viz` (an ants checkout's `dist/`, or the ants image's `/artifacts/`); both can come out
of the images with `docker cp`.

> **GREEN since 15 September 2026.** `real-match.json` was re-captured from a running stack's
> replay bucket on the current engine (`185a2845…`) and all eight replays agree with the viewer. It
> stays **source** — the build copies it and checks its digest rather than regenerating it — but
> `tutorials/README.md` now records what is in it and the two commands that read another out of the
> bucket, so a re-capture is a recipe. That digest check is the whole guarantee: a viewer
> re-simulating with a different engine does not fail, it draws a plausible match that never
> happened.

## How a page shows a rule

The rules chapters do not draw diagrams of rules — they play them. A lesson is a real match through
the real cartridge, so the page cannot be wrong about the rule in a way the engine is not:

```
tutorials/boards/*.txt  --make-map.py-->  boards/*.json  ─┐
tutorials/<lesson>.json (seat scripts, vars) ─────────────┴-- tinybrains --> replays/*.json
                                                                                  │  cp
ants artifact image ─────────────── COPY ──────────────> src/viz/ <── digest check ┴─> src/tutorials/
```

- Half a board is drawn (`.` land, `#` water, `H` hill, `*` food); `make-map.py` translates it into
  the symmetric whole, because the cartridge refuses a board that is not closed under its orbit.
  The spec carries its own inline copy of that board (the CLI takes a map inline), and `build.sh`
  refuses when the two differ — otherwise an edited drawing regenerates a board nothing reads.
- **`data-turn` is a frame index, and frame N is the board after N turns.** Frame 0 is the opening,
  so a caption written in delta indices is one turn early everywhere; three of them were.
- **A board's `food` is turn-zero food only.** Every match has a hidden food rate drawn from its
  seed, so a long lesson grows ants it was not written to have unless its seed is chosen against
  that. Read the frames the engine produced — `tinybrains view` — rather than the script.
- Seats are **scripted**, not modelled — a scripted seat never reaches the loader, so a lesson needs
  no ONNX, no model store and no inference, and still goes through the engine's `step`.
- `tutorials/replays/real-match.json` is **captured from a running stack, not generated**;
  `build.sh` copies it and never rebuilds it. It is the one file under `tutorials/replays/` that is
  committed, because it is the only one that is an input rather than an output — and it is exactly
  the file that goes stale without anyone noticing, which is what the check below is for.
- `build.sh` fails if any replay's `engine_digest` differs from `src/viz/engine.json`. That check is
  load-bearing: a viewer re-simulating with the wrong engine does not error, it draws a plausible
  match that never happened.
- Nothing checks that a caption describes the frames, which is the failure that actually happened:
  a lesson whose script was written to reach a hill ended four turns early in a trade, and two
  pages described the raze it never made. A new or re-scripted lesson is verified by reading its
  frames, not by reading its script.

A page embeds one with a slot, a caption, and a marker comment:

```html
<div class="tb-replay" data-src="tutorials/2-fight.json" data-turn="3" data-zoom="6"></div>
<p class="tb-replay-caption">…what this replay shows…</p>
<!-- replay-visualiser: turn-focus-combat — filled. -->
```

`theme/tb-replay.js` imports the viewer module only on pages that have a slot (the cartridge is a
quarter of a megabyte), resolving `path_to_root` against `document.baseURI`. Keep the prose above
the slot self-sufficient: the fallback for a viewer that fails to load is a sentence, and a page
must still teach its rule without playback.

`world-fog` and `observation-payload` are **deliberately empty**, and their comments say why: a
replay frame is the referee's view, so ground truth in either slot would teach the reader the
opposite of the point. Filling them needs a seat view from `replay-decode` — an ABI change in Ants,
i.e. a decision, not a task.

## How a page shows an adapter

The adapter chapter shows programs, and every example opens in DataLogic Studio — datalogic-rs's
playground, `goplasmatic.github.io/datalogic-rs/playground/`. **A page never holds a Studio link.**
It holds `{{#studio studio/<name>.json}}` (flags: `nocode`, `embed`), and `studio/studio.py`, an
mdBook preprocessor, writes the example's code and a link whose URL encodes that same file on every
build. A pasted link is a second copy of the example, and drifts.

- An example is `{about, templating, logic, data}` in `src/models/adapters/studio/`. Keep
  `templating: true`: it is the Studio mode an adapter is read under.
- The link format is the Studio's own `ui/src/utils/url-share.ts` in the datalogic-rs checkout:
  `{l, d, t}` as MessagePack, raw DEFLATE, base64url in `?s=`. If upstream changes it, every link
  in the book opens something else and nothing here notices.
- **The Studio runs datalogic-rs, and so does the arena** — since the 1.8.1 rebuild an adapter is
  evaluated by the same engine, so most of the old differences are gone: `{"==": [0, null]}` is now
  `true` on both sides. What still differs is **objects**: with Templating on the Studio treats a
  multi-key object as a literal, and the arena refuses one — every object is an operation, and an
  unknown key fails at *evaluation*, not at compile. That was measured with `tinybrains adapt`, not
  assumed, and the accumulator examples are arrays because of it. An example must evaluate in the
  Studio to what its page says, and anything a page claims about the arena — a cost, a tensor, a
  trap — must come from `tinybrains adapt` or `tinybrains check`, which link the node's own two
  libraries. `models/adapters/studio.md` is the reader's copy of that list; keep the two in step.
- `theme/tb-studio.js` mounts an `embed` slot with datalogic-rs's mdBook widget, fetched from the
  Studio's site when the slot scrolls into view. It is unpinned — the bundle is whatever that site
  last deployed, so a breaking change there surfaces as the slot's fallback sentence and never as a
  red build. Vendoring it would pin the bundle but not the Studio links the chapters open.

## The theme

`README.md` §The theme documents each file and what must stay true. The load-bearing parts:

- `theme/index.hbs` is **mdBook 0.5.4's template, vendored**, with every edit marked `TINYBRAINS`.
  book.js reaches for `.menu-title`, `#mdbook-theme-toggle` and `#mdbook-theme-list` by name, and
  the theme names `navy`/`light` are read by book.js and `tb-replay.js`. On an mdBook upgrade,
  re-diff and re-apply the marked blocks — nothing at build time notices a stale template.
- `theme/tokens.css` **imports `/design-system/tokens.css`** — the application's own stylesheet,
  off the application's own origin, which the book is served from. It is no longer a copy: it was
  one for as long as the book was its own repository, and by the time the book moved in here it had
  drifted, carrying four aliases the application had deleted. **There is no colour in this
  directory**, and there must not be one.
  - That import costs two mechanisms. The application keys its palettes on `data-theme`, so
    `index.hbs` mirrors mdBook's theme class onto that attribute in the pre-paint script, and
    `tb-site.js` keeps them in step on every switch after. And a reader with **JavaScript off** gets
    neither class nor attribute, where mdBook's own `.light, html:not(.js)` block — specificity
    (0,1,1), against the imported `:root`'s (0,1,0) — would force `--bg` to white under Cobalt's
    near-white ink. `tokens.css` re-asserts that one name from `--bg-base`, which exists in the
    application's tokens for exactly this. `--bg` is the only name this book and mdBook share.
  - The switch also writes the application's `tb.theme`, so one stored choice serves the whole site.
- **The logo and the favicon are the application's files too** — `/logo-circuit.svg` and
  `/logo-circuit-light.svg`, root-relative off the shared origin. Nothing is drawn in `theme/`.
  The book used to carry an inline `<symbol>`, and it had already gone stale: the application
  moved to the circuit mark and the book kept drawing the old network one. **Two files, because a
  standalone SVG cannot read the page's custom properties**, so the theme swap is CSS picking one
  of two `<img>`s (`tinybrains.css` §4, the sun/moon pattern) rather than tokens on strokes. The
  favicon is the one thing keyed to `prefers-color-scheme` instead of the theme class — a browser
  chooses a tab icon outside the document. `Dockerfile` deletes the `favicon*` files mdBook writes,
  which are **mdBook's own logo** and referenced by nothing.
- The `additional-css` order in `book.toml` is the mechanism that avoids `!important`; the comments
  there explain it, as does the one on `site-url = "/docs/"` (it is what makes `404.html` find its
  assets, and it is the address the book is actually served at).
- **One `<h1>` per page, and it lives in the bar.** CSS hides `.content main > h1:first-child`, so
  every page in `src/` must open with exactly one `#` heading; a page that opens some other way
  shows its title twice.

## Writing pages

- Competitors first: what to build, what the platform checks, what they can observe, what to do
  next. Architecture belongs in the platform chapters unless it explains a practical limitation.
- **The book duplicates values it does not own.** `src/reference/limits.md` dates its snapshot and
  names the owner of each number (Ants' `cartridge.json`, Soma's admission judging, the DevOps Orion
  templates, the season's rules in the database). Verify against the current producer before
  changing a number here, and
  never invent a match result or a replay identity to fill an example.
- Relative links only, and `src/SUMMARY.md` must stay aligned with the files on disk — `mdbook
  build` fails otherwise.
- Label planned tooling as planned; do not describe a proposal as a working endpoint.
