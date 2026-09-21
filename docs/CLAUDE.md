# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this directory.

## What this directory is

`web/docs/` is the TinyBrains competitor guide: an mdBook served at **`tinybrains.dev/docs`**, and
only there, from inside web's image. `../CLAUDE.md` is web's guide and `../../CLAUDE.md` the
platform's. `README.md` is this directory's human guide; read its **Invariants** before touching
`theme/` or a replay. The page inventory lives in `src/SUMMARY.md` and nowhere else; the replay-slot
inventory is `grep -rn 'replay-visualiser:' src`.

Nothing here runs in the platform, but the book *restates* numbers and behaviour other repos own,
and it *embeds real engine output*.

**This directory keeps its own toolchain and its own artifact.** mdBook, python3 and the
`tinybrains` binary build it; `Dockerfile` publishes the rendered book and web's `Dockerfile`
copies it in. Nothing here is part of the node build next door: `../.dockerignore` excludes
`docs/`, and `../.github/workflows/check.yml` does not run mdBook.

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
all gitignored. `Dockerfile` rebuilds them, taking the cartridge and its viewer from the latest ants
release (`ANTS_RELEASE` names a tag) and the `tinybrains` binary from the CLI release pinned as
`CLI_VERSION`, so building the book needs neither a sibling checkout nor a Rust toolchain.

`tutorials/build.sh` runs by hand: it needs `tinybrains` on `PATH` and a viewer at
`$ANTS_DIST/viz` (an ants checkout's `dist/`, or an unpacked ants release).

**`tutorials/replays/real-match.json` is source**: a real match captured from a running stack,
which nothing here can reproduce. The build copies it and checks its digest rather than
regenerating it. It must be re-captured whenever the engine digest changes, including when a
release builds the engine into other bytes than a local build; `tutorials/README.md` records what is
in it and the commands that read another out of the bucket. That digest check is the whole
guarantee: a viewer re-simulating with a different engine does not fail, it draws a plausible match
that never happened.

**No season's board is ever in this book.** A season's boards are uploaded to it, not shipped and
not committed, so a page describes the limits every board is inside and draws the five basic boards
the release carries (`tutorials/board-*.json`, each naming one by id), and a captured match is taken
on a basic board. A board named after a season's is a leak, not an example.

## How a page shows a rule

The rules chapters do not draw diagrams of rules; they play them. A lesson is a real match through
the real cartridge, so the page cannot be wrong about the rule in a way the engine is not:

```
tutorials/boards/*.txt  --make-map.py-->  boards/*.json  ─┐
tutorials/<lesson>.json (seat scripts, vars) ─────────────┴-- tinybrains --> replays/*.json
                                                                                  │  cp
ants release ────────────────────── COPY ──────────────> src/viz/ <── digest check ┴─> src/tutorials/
```

- Half a board is drawn (`.` land, `#` water, `H` hill, `*` food); `make-map.py` translates it into
  the symmetric whole, because the cartridge refuses a board that is not closed under its orbit.
  The spec carries its own inline copy of that board (the CLI takes a map inline), and `build.sh`
  refuses when the two differ, since otherwise an edited drawing regenerates a board nothing reads.
- **`data-turn` is a frame index, and frame N is the board after N turns.** Frame 0 is the opening,
  so a caption written in delta indices is one turn early everywhere.
- **A board's `food` is turn-zero food only.** Every match has a hidden food rate drawn from its
  seed, so a long lesson grows ants it was not written to have unless its seed is chosen against
  that. Read the frames the engine produced (`tinybrains view`) rather than the script.
- Seats are **scripted**, not modelled: a scripted seat needs no ONNX, no model store and no
  inference, and still goes through the engine's `step`.
- `tutorials/replays/real-match.json` is the one committed file under `tutorials/replays/`, because
  it is the only input rather than output.
- `build.sh` fails if any replay's `engine_digest` differs from `src/viz/engine.json`, and if any
  page's `data-turn` is past the end of the replay it names.
- **Nothing checks that a caption describes the frames.** A new or re-scripted lesson is verified by
  reading its frames, not its script.

A page embeds one with a slot, a caption, and a marker comment:

```html
<div class="tb-replay" data-src="tutorials/2-fight.json" data-turn="3" data-zoom="6"></div>
<p class="tb-replay-caption">…what this replay shows…</p>
<!-- replay-visualiser: turn-focus-combat — filled. -->
```

`data-view="map"` on a slot draws the board alone with the viewer's `mountMap`. `theme/tb-replay.js`
imports the viewer module only on pages that have a slot (the cartridge is a quarter of a megabyte),
resolving `path_to_root` against `document.baseURI`. Keep the prose above the slot self-sufficient:
the fallback for a viewer that fails to load is a sentence, and a page must still teach its rule
without playback.

`world-fog` and `observation-payload` are **deliberately empty**, and their comments say why: a
replay frame is the referee's view, so ground truth in either slot would teach the reader the
opposite of the point. Filling them needs a seat view from `replay-decode`, an ABI change in Ants,
so a decision rather than a task.

## How a page shows an adapter

The adapter chapter shows programs, and every example opens in DataLogic Studio, datalogic-rs's
playground at `goplasmatic.github.io/datalogic-rs/playground/`. **A page never holds a Studio link.**
It holds `{{#studio studio/<name>.json}}` (flags: `nocode`, `embed`), and `studio/studio.py`, an
mdBook preprocessor, writes the example's code and a link whose URL encodes that same file on every
build. A pasted link is a second copy of the example, and drifts.

- An example is `{about, templating, logic, data}` in `src/models/adapters/studio/`. Keep
  `templating: true`: it is the Studio mode an adapter is read under.
- The link format is the Studio's own `ui/src/utils/url-share.ts` in the datalogic-rs checkout:
  `{l, d, t}` as MessagePack, raw DEFLATE, base64url in `?s=`. If upstream changes it, every link
  in the book opens something else and nothing here notices.
- **The Studio, the node and `tinybrains` all run datalogic-rs, in templating mode.** The node
  evaluates an adapter on the datalogic engine its dataflow-rs engine holds, and `tinybrains`
  borrows its evaluator the same way (`cli/src/model.rs`), so both read a multi-key object as an
  output template, a single key that names no operator as data, and `{"$key": …}` as the data
  `{"key": …}`. The Studio does the first two with Templating on. What differs:
  - `tinybrains` warns about an unknown single key, and the node says nothing.
  - `tinybrains` refuses Orion's own operators (`join` and the `base64`, `base64url`, `hex` and
    `url` codecs), which only the node has, and both refuse `secret`, `now` and `random`.
  - The book's `CLI_VERSION` must be a CLI that behaves this way, or the book describes a binary
    competitors do not have.

  The accumulator examples are arrays because an array has no key an operator could claim. An
  example must evaluate in the Studio to what its page says, and anything a page claims about the
  arena (a cost, a tensor, a trap) must come from `tinybrains adapt` or `tinybrains check`.
  `models/adapters/studio.md` is the reader's copy of that list; keep the two in step.
- `theme/tb-studio.js` mounts an `embed` slot with datalogic-rs's mdBook widget, fetched from the
  Studio's site when the slot scrolls into view. It is unpinned: a breaking change there surfaces as
  the slot's fallback sentence and never as a red build. Vendoring it would pin the bundle but not
  the Studio links the chapters open.

## The theme

`README.md` §The theme documents each file. The load-bearing parts:

- `theme/index.hbs` is **mdBook 0.5.4's template, vendored**, with every edit marked `TINYBRAINS`.
  book.js reaches for `.menu-title`, `#mdbook-theme-toggle` and `#mdbook-theme-list` by name, and
  the theme names `navy`/`light` are read by book.js and `tb-replay.js`. On an mdBook upgrade,
  re-diff and re-apply the marked blocks; nothing at build time notices a stale template.
- `theme/tokens.css` **imports `/design-system/tokens.css`**, the application's own stylesheet off
  the origin the book is served from. **There is no colour in this directory**, and there must not
  be one.
  - That import costs two mechanisms. The application keys its palettes on `data-theme`, so
    `index.hbs` mirrors mdBook's theme class onto that attribute in the pre-paint script, and
    `tb-site.js` keeps them in step on every switch after. And a reader with **JavaScript off** gets
    neither class nor attribute, where mdBook's own `.light, html:not(.js)` block (specificity
    (0,1,1), against the imported `:root`'s (0,1,0)) would force `--bg` to white under the app's
    near-white ink. `tokens.css` re-asserts that one name from `--bg-base`, which exists in the
    application's tokens for exactly this. `--bg` is the only name this book and mdBook share.
  - The switch also writes the application's `tb.theme`, so one stored choice serves the whole site.
- **The logo and the favicon are the application's files too**: `/logo-circuit.svg` and
  `/logo-circuit-light.svg`, root-relative off the shared origin. Nothing is drawn in `theme/`.
  **Two files, because a standalone SVG cannot read the page's custom properties**, so the theme
  swap is CSS picking one of two `<img>`s (`tinybrains.css` §4, the sun/moon pattern). The favicon
  is the one thing keyed to `prefers-color-scheme` instead of the theme class, because a browser
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
  next. Architecture belongs in the platform chapters unless it explains a practical limitation,
  and the platform chapters stay very high level.
- **Write the current state, not its history.** No "changed on", "used to" or "earlier seasons";
  a dated measurement ("measured on an M2 Pro on …") is provenance and stays.
- **The book duplicates values it does not own.** `src/reference/limits.md` dates its snapshot and
  names the owner of each number (Ants' `cartridge.json`, Soma's admission judging, the Orion
  templates in Soma's and Kalam's `docker/`, the season's rules in the database). Verify against the
  current producer before changing a number here, and never invent a match result or a replay
  identity to fill an example.
- Relative links only, and `src/SUMMARY.md` must stay aligned with the files on disk; `mdbook
  build` fails otherwise. Page paths are link targets from the app and from other repos: do not
  rename one.
- Label planned tooling as planned; do not describe a proposal as a working endpoint.
