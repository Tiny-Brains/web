# docs

The TinyBrains competitor guide: an mdBook that takes a reader from the rules of the game to a
submitted model and a rating. Its rules pages play real matches through the cartridge the ladder
runs, replayed by the cartridge's own viewer, and every adapter example opens in DataLogic Studio.
It is served at `/docs` by web's image and nowhere else; `src/platform/` is the high-level design
overview for contributors. It speaks the languages the site speaks: the English chapters are the
source, and a catalogue per language under `po/` translates them (*Languages* below).
`../README.md` is the application's guide and [`CLAUDE.md`](CLAUDE.md) this directory's rules.

## Build and preview

You need **mdBook 0.5.4** and Python 3 (`studio/studio.py` is a preprocessor, so every build runs
it), and for the language trees **mdbook-i18n-helpers** (`cargo install --locked
mdbook-i18n-helpers`, which puts `mdbook-gettext` and `mdbook-xgettext` on `PATH`). Regenerating
the lessons also needs the `tinybrains` CLI on `PATH` and an ants `dist/` (a checkout's or an
unpacked release) at `$ANTS_DIST`, default `../../../ants/dist` from `tutorials/`.

```sh
tutorials/build.sh            # boards -> replays -> src/tutorials, and copy the viewer into src/viz
./build.sh                    # the whole book: book/ in English, book/<tag>/ for each po/<tag>.po
mdbook build                  # English only: fails on a SUMMARY entry without a file, or a bad {{#studio}}
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
| `site-url = "/docs/<tag>/"` for a language's tree | `build.sh` | that tree's `404.html` looks for its assets one level too high |
| a miss inside `/docs/<tag>/` answers that tree's `404.html` | the serving layer (`$docs_404` in nginx, the `book()` plugin) | a Chinese reader is told in English that the page does not exist |
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
| `theme/head.hbs` | mdBook's head partial, and ours rather than upstream's: the table of the languages the book is built in, and the forward from the English tree to the reader's language (their stored `tb.lang`, else the browser's) before the first paint |
| `theme/tb-words.js` | every sentence the chrome says, per language: the bar's labels, the keyboard help, the picker, and the fallback sentences of the two scripts below |
| `theme/tb-site.js` | the bar's words laid over the template's English, the language picker, and the theme button: it clicks mdBook's own hidden theme buttons and writes `tb.theme`, so one stored choice serves the whole site |
| `theme/tb-replay.js`, `.css` | the embedded replay viewer and its frame; the caption is the paragraph after the slot |
| `theme/tb-studio.js`, `.css` | DataLogic Studio in a page, fetched from the Studio's site when a slot scrolls into view, and the link under every example |
| `theme/fonts/fonts.css` | empty on purpose: the book is set in the reader's interface font |
| *(no logo, no favicon)* | the application's `/logo-circuit.svg` and `/logo-circuit-light.svg`, linked root-relative. `Dockerfile` deletes the `favicon*` files mdBook writes, which are mdBook's own logo |

The bar carries the search, the page's title (centred, and the page's only `<h1>`), the theme
button, a house linking to `/`, the Discord invite and the source link. The book has no navigation or footer of its own.

## A replay slot

```html
<div class="tb-replay" data-src="tutorials/2-fight.json" data-turn="1"></div>

What this replay shows, in a sentence.

<!-- replay-visualiser: turn-focus-combat — filled. -->
```

The caption is the paragraph after the slot, plain markdown with a blank line on each side: an
HTML block is left as it is by the translations, so a caption written as a `<p>` would be English
in every language.

| Attribute | Viewer option | Default |
|---|---|---|
| `data-src` | the replay, resolved against the book's root | required |
| `data-view="map"` | draw the replay's board alone with the viewer's `mountMap`: turn zero, its name, player count and size; no seats, transport or zoom, and it sizes itself | the full player |
| `data-graph="true"` | mount the viewer's match graph under the slot with `mountGraph`: each seat's ants, hills or score over the match, and hovering it scrubs the player | no graph |
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

## Languages

The book is built in every language the site speaks: `book/` is English and `book/<tag>/` each
other language, served at `/docs/` and `/docs/<tag>/`. The English chapters are the only source.
A language is a **catalogue**, `po/<tag>.po`, with the translation of every paragraph, heading,
list item and table cell keyed by its English; `mdbook-gettext` lays it over the chapters as that
tree is built, and a paragraph the catalogue lacks, or whose English has changed since it was
translated, is said in English rather than not at all. `build.sh` extracts the English into
`po/messages.pot` on every build and `po/check.py` holds each catalogue to it.

A reader lands in their language the way they do on the rest of the site: a page of the English
tree reads the application's stored `tb.lang`, else the browser's languages, and goes to the same
chapter in that tree before it paints (`theme/head.hbs`). A page inside a language's tree is an
explicit address and stays. The picker in the bar links to the same chapter in each other language
and stores the choice, which the application then follows too.

**Translating.** After the English changes, bring the catalogue forward and look at what it marks:

```sh
MDBOOK_OUTPUT='{"xgettext": {}}' mdbook build -d po    # po/messages.pot from the chapters
msgmerge --update po/zh-CN.po po/messages.pot          # new entries empty, changed ones fuzzy
msgfmt --statistics -o /dev/null po/zh-CN.po           # translated / fuzzy / untranslated
```

A fuzzy entry is built as English until it is retranslated and the flag removed. In a translation
the code spans, link targets, inline HTML and placeholders are the English's, and a trailing
newline stays; `po/check.py` fails the build otherwise. Two CommonMark traps for a script without
spaces: a bold is written `**句**。下`, because `**句。**下` has no closer; and an italic is written
`<em>词</em>`, because the build re-serialises `*词*` as `_词_`, which between CJK characters is no
emphasis at all.

**Adding a language** is four places, each named by the language's BCP 47 tag: the catalogue
(`msginit -l zh_CN -i po/messages.pot -o po/zh-CN.po`, then translate), its line in the table in
`theme/head.hbs`, its block of the chrome's words in `theme/tb-words.js`, and the Studio link's
words in `studio/studio.py` with a caption per example under `src/models/adapters/studio/`.
`build.sh` then builds the tree, the picker lists it, and `po/check.py` refuses a catalogue the
table does not name. The application's languages are its own list (`../src/lib/lang.ts`); the
tags must agree for the stored choice to carry across.

**Not translated:** the replay viewer and the lessons' seats and boards (the cartridge's), the
Studio widget (upstream's), and the few sentences mdBook's own scripts write. **Search is off in
every tree but English**: mdBook's index splits on spaces and has no tokens for a language written
without them, so the bar has no search there rather than one that finds nothing.

## Layout

```text
src/                 the pages, in English; src/SUMMARY.md is the chapter order and the page list
po/                  a catalogue per language, po/<tag>.po, and check.py; messages.pot is extracted (gitignored)
build.sh             the whole book: English, then one tree per catalogue; what the Dockerfile runs
src/platform/        the high-level design overview for contributors
src/models/adapters/studio/   the adapter examples
src/tutorials/, src/viz/      generated: lesson replays and the viewer (gitignored)
studio/studio.py     the {{#studio}} preprocessor, and `link FILE`
tutorials/           lesson sources: boards/*.txt, seat scripts, build.sh, make-map.py; see tutorials/README.md
tutorials/replays/real-match.json   a match captured from a running stack; the one committed replay
theme/               the book wearing the application's design system; head.hbs and tb-words.js are the languages
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
- **Nothing generated is committed** except `real-match.json`, which is input; `po/messages.pot`
  is extracted on every build.
- **The English chapters are the only source.** A translation is a catalogue over them, never a
  second copy of a page; a sentence a catalogue lacks is read in English.
- **A caption is the paragraph after its slot**, plain markdown: an HTML block is invisible to the
  translations.
- **A language is named in four places** (`po/`, `theme/head.hbs`, `theme/tb-words.js`,
  `studio/studio.py`), and `po/check.py` holds the first three together.
