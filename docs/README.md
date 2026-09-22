# docs

The TinyBrains competitor guide: an mdBook that takes a reader from the rules of the game to a
submitted model and a rating. Its rules pages play real matches through the cartridge the ladder
runs, replayed by the cartridge's own viewer, and every adapter example opens in DataLogic Studio.
It is served at `/docs` by web's image and nowhere else; `src/platform/` is the high-level design
overview for contributors. `../README.md` is the application's guide and [`CLAUDE.md`](CLAUDE.md)
this directory's rules.

## Build and preview

You need **mdBook 0.5.4** and Python 3 (`studio/studio.py` is a preprocessor, so every build runs
it). Regenerating the lessons also needs the `tinybrains` CLI on `PATH` and an ants `dist/` (a
checkout's or an unpacked release) at `$ANTS_DIST`, default `../../../ants/dist` from `tutorials/`.

```sh
tutorials/build.sh            # boards -> replays -> src/tutorials, and copy the viewer into src/viz
mdbook build                  # the check: fails on a SUMMARY entry without a file, or a bad {{#studio}}
(cd .. && npm run dev)        # the real preview, at localhost:5173/docs/ (it serves ./book)
mdbook serve                  # chapters only: it forces site-url to "/" and has no app stylesheet
python3 studio/studio.py link src/models/adapters/studio/<name>.json   # one example's Studio URL
```

`src/viz/` and `src/tutorials/` are generated and gitignored, so a fresh checkout cannot
`mdbook build` until `tutorials/build.sh` has run; `npm run vendor:book` in `..` takes the rendered
book out of the docs image instead. `Dockerfile` does the whole build from releases: the cartridge
and viewer from the latest ants release (`ANTS_RELEASE` names a tag), the CLI from the release
pinned as `CLI_VERSION`, and publishes `/artifacts/book`, which web's `Dockerfile` copies to `/docs`.

`tutorials/build.sh` refuses when a spec's inline board differs from its drawing, when a page's
`data-turn` is past the end of its replay, and when any replay's `engine_digest` differs from the
viewer's. Captions, links, values and what an example evaluates to are checked by reading.

## Serving rules

The book is static files with no runtime configuration. The serving layer (web's `nginx.conf`, and
the `book()` plugin in `vite.config.ts` for the dev loop) must get these right:

| Setting | Owner | If it is wrong |
|---|---|---|
| `site-url = "/docs/"` | `book.toml` | mdBook writes `<base href>` into `404.html` alone; that page loads no stylesheet |
| `$uri.html` before `$uri` | the serving layer | `models/adapters` is both a page and a section; matching the directory first hides the chapter |
| 404 with a 404 status | the serving layer | a `try_files` fallback answers 200 and tells a crawler the page exists |
| `application/wasm` for `.wasm` | the MIME table | `WebAssembly.compileStreaming` refuses the response and no replay draws |
| No SPA fallback over `/docs/viz/` | the serving layer | a missing module answered with HTML leaves every replay on its fallback sentence |
| A rebuilt `book/` | `mdbook build` | a running `mdbook serve` overwrites `book/` with a preview whose `site-url` is `/` |
| `goplasmatic.github.io` reachable | the reader's network, any CSP | Studio embeds show their fallback; the links under examples still work |

## The theme

The book wears the application's design system, so crossing from `/leaderboard` to `/docs` is not
a visual seam. There is no colour in this directory. `book.toml` wires it up, and the order of
`additional-css` is the mechanism: mdBook appends these after its own stylesheets, so no rule needs
`!important`.

| File | What it is |
|---|---|
| `theme/tokens.css` | an `@import` of `/design-system/tokens.css`, the application's own stylesheet off the shared origin. It adds only what the import cannot: `--bg` re-asserted from `--bg-base` for a reader with JavaScript off, where mdBook's `.light, html:not(.js)` block would otherwise force a white page |
| `theme/tinybrains.css` | mdBook's variables answered in the app's roles, then the bar, brand, sidebar, notes, tables and code restated for mdBook's markup. Tokens only |
| `theme/index.hbs` | mdBook 0.5.4's template, vendored; every change is marked `TINYBRAINS`: the logo, the brand, `{{ chapter_title }}` as the page's `<h1>` in the bar, the sun/moon theme button, and two themes (`navy`, `light`) instead of five. It mirrors mdBook's theme class onto `data-theme` before first paint and reads the app's stored `tb.theme` |
| `theme/tb-site.js` | the theme button: it clicks mdBook's own hidden theme buttons and writes `tb.theme`, so one stored choice serves the whole site |
| `theme/tb-replay.js`, `.css` | the embedded replay viewer and its frame |
| `theme/tb-studio.js`, `.css` | DataLogic Studio in a page, fetched from the Studio's site when a slot scrolls into view, and the link under every example |
| `theme/fonts/fonts.css` | empty on purpose: the book is set in the reader's interface font |
| *(no logo, no favicon)* | the application's `/logo-circuit.svg` and `/logo-circuit-light.svg`, linked root-relative. `Dockerfile` deletes the `favicon*` files mdBook writes, which are mdBook's own logo |

The bar carries the search, the page's title (centred, and the page's only `<h1>`), the theme
button, a house linking to `/`, the Discord invite and the source link. The book has no navigation or footer of its own.

## A replay slot

```html
<div class="tb-replay" data-src="tutorials/2-fight.json" data-turn="3" data-zoom="6"></div>
<p class="tb-replay-caption">What this replay shows, in a sentence.</p>
<!-- replay-visualiser: turn-focus-combat — filled. -->
```

| Attribute | Viewer option | Default |
|---|---|---|
| `data-src` | the replay, resolved against the book's root | required |
| `data-view="map"` | draw the replay's board alone with the viewer's `mountMap`: turn zero, its name, player count and size; no seats, transport or zoom, and it sizes itself | the full player |
| `data-turn` | open on this frame (frame N is the board after N turns) | 0 |
| `data-from`, `data-to` | limit the scrubber to a range | the whole match |
| `data-zoom` | cell size in pixels | fits the board |
| `data-centre` | `"row,col"` to centre on | the board's centre |
| `data-speed`, `data-autoplay` | playback rate, and whether it starts | paused |
| `data-height` | slot height in pixels | 360 |

`theme/tb-replay.js` imports `src/viz/viz.js` once, and only on a page that has a slot. The marker
comment is the inventory: `grep -rn 'replay-visualiser:' src` lists every slot as `filled`, planned
(naming what a recording must show) or `BLOCKED` with the reason.

## A Studio example

A page never holds a Studio link. It holds a directive naming an example file relative to the page,
and `studio/studio.py` writes the code and a link encoding that same file on every build:

```text
{{#studio studio/foe-positions.json}}          the example's logic as a JSON block, then its link
{{#studio studio/own-hills.json nocode}}       the link alone, when the prose already shows the code
{{#studio studio/baseline-in.json embed}}      the code, the Studio itself in the page, then the link
```

An example is `{"about", "templating", "logic", "data"}` under `src/models/adapters/studio/`;
`about` is the link's caption and `templating` stays `true`. The link is the Studio's own share
format: `{l, d, t}` as MessagePack, raw DEFLATE, base64url in `?s=`.

## Layout

```text
src/                 the pages; src/SUMMARY.md is the chapter order and the page list
src/platform/        the high-level design overview for contributors
src/models/adapters/studio/   the adapter examples
src/tutorials/, src/viz/      generated: lesson replays and the viewer (gitignored)
studio/studio.py     the {{#studio}} preprocessor, and `link FILE`
tutorials/           lesson sources: boards/*.txt, seat scripts, build.sh, make-map.py; see tutorials/README.md
tutorials/replays/real-match.json   a match captured from a running stack; the one committed replay
theme/               the book wearing the application's design system
book.toml            the wiring, with the reasoning in comments
Dockerfile           the book built from releases, published as /artifacts/book
```

## Invariants

- **A lesson is engine output, not a drawing.** Every replay is played through the real cartridge
  from a written script, and `build.sh` checks its digest against the viewer's.
- **`real-match.json` is captured, not generated**, so it is the file that goes stale silently; the
  digest check catches it. [`tutorials/README.md`](tutorials/README.md) says how to take another.
- **The prose teaches the rule without the replay.** A viewer that fails to load leaves a sentence.
- **`world-fog` and `observation-payload` stay empty until there is a seat view.** A replay frame is
  the referee's view, and ground truth in either slot would teach the opposite of the point.
- **No invented result.** A planned example states what a recording must show; it never names a
  match, asset or digest that does not exist.
- **The Studio is not the referee**, although it runs the same engine: it treats a multi-key object
  as a literal, does not count operations, and shows tensors unevaluated. Every claim about the arena
  comes from `tinybrains adapt` or `tinybrains check`.
- **The numbers belong to whoever computes them.** `src/reference/limits.md` dates its snapshot and
  names each owner; verify against the producer before changing a value.
- **No season's board appears in the book.** Pages draw the five basic boards the release ships.
- **`theme/index.hbs` is pinned to mdBook 0.5.4.** `book.js` finds `.menu-title`,
  `#mdbook-theme-toggle` and `#mdbook-theme-list` by name, and `navy`/`light` are read by `book.js`
  and `tb-replay.js`. On an upgrade, re-diff against `mdbook init --theme` and re-apply the marked
  blocks; nothing at build time notices a stale template.
- **Which brand and which theme glyph show is CSS, not script**, so both are right on first paint
  and with JavaScript off.
- **One `<h1>` per page, in the bar.** CSS hides `.content main > h1:first-child`, so every page
  must open with exactly one `#` heading; it comes back under `@media print`.
- **Nothing generated is committed** except `real-match.json`, which is input.
