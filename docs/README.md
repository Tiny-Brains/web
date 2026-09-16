# docs

Docs is the TinyBrains competitor guide: an mdBook of thirty-six pages that carries a reader from
the rules of the game to a submitted model and a rating that means something. It is the only part of
the platform whose pages *play* what they describe — the rules chapters embed real matches, produced
by the same cartridge the ladder runs and replayed by the cartridge's own viewer, and every adapter
example opens in DataLogic Studio, already evaluated.

It is served at **`tinybrains.dev/docs`**, which is the only place it is served, and it lives in
`web/` for that reason: the application that serves the book and the book it serves ship together.
It was `Tiny-Brains/docs`, a repository of its own, until 16 September 2026.

## The name

**Docs** is the book, and only the book. Each application repository keeps its own design documents
under its own `docs/`; this one is the reader-facing half, written for someone who has not seen the
source and is not going to. `../README.md` is the application's map, and `../CLAUDE.md` its guide.

## Scope

**It owns**

- The thirty-six pages, their chapter order in `src/SUMMARY.md`, and the words each uses.
- The teaching replays: hand-drawn boards, written seat scripts, and the build that plays them.
- The adapter examples under `src/models/adapters/studio/`, and `studio/studio.py`, which turns each
  into the code a page shows and a DataLogic Studio link that encodes the same file.
- The book's theme — the application's design system restated for the elements mdBook emits.
- The vendored replay viewer under `src/viz/`, and the slot that mounts one in a page.

**It does not**

- Own a single value it documents. Presets and budgets come from [Ants](https://github.com/Tiny-Brains/ants)' `cartridge.json`, size boundaries and every quota from the **season's rules in the database**, judged by [Soma](https://github.com/Tiny-Brains/soma)'s admission clock, and opsets, scheduling and the operation budget from [DevOps](https://github.com/Tiny-Brains/devops)' Orion templates.
- Draw a replay or know a rule of one; Ants ships the viewer and this repository vendors it.
- Evaluate an adapter. DataLogic Studio runs the JSON half of an example in the reader's browser,
  on datalogic-rs — which is now the *same* engine the arena uses, so the two agree about the
  language and differ about objects, counting and tensors. Every cost the book quotes comes from
  `tinybrains check` or `tinybrains adapt`, which link the node's own two libraries.
- Serve itself; [Web](https://github.com/Tiny-Brains/web)'s nginx mounts the rendered book today, and its own host will serve it.
- Hold the platform's design documents, decision log, or deployment design; those stay in the repository that owns the behaviour.

## Where it sits

```text
[ants: dist/ incl. viz/] -----+
                               |  tutorials/build.sh
[tutorials/boards + scripts] --+--> src/tutorials/ + src/viz/ --+
                                                                |  mdbook build
[web: /design-system/tokens.css] <-- @import -- theme/tokens.css -+--> book/ --> [reader]
```

| Direction | Party | Over | What moves |
|---|---|---|---|
| reads | Ants | its artifact image, `/artifacts/viz` | The viewer bundle, copied into `src/viz/` so the book builds offline |
| calls | DevOps CLI | `tinybrains <spec>`, from its artifact image | Scripted lessons played through the real cartridge into replay envelopes |
| imports | Web | `/design-system/tokens.css`, at run time, same origin | The palette — one file, not a copy of one |
| restates | Ants, Soma, DevOps, the season | Their configuration | Every number on the limits, weight-class and format pages |
| read by | Web's image, via `DOCS_REF` | `COPY --from=book /artifacts/book/` | The rendered `book/`, baked in at /docs |
| links to, embeds | DataLogic Studio | `goplasmatic.github.io/datalogic-rs/` | Every adapter example as a playground link; the embed bundle `theme/tb-studio.js` mounts in a page |

The [system map](https://github.com/Tiny-Brains/devops#where-it-sits) describes the services the
book documents. Nothing in the platform reads this repository at runtime.

## Interface

There is no API. What this repository publishes is a directory of static files, and what a page
author uses is a slot:

```html
<div class="tb-replay" data-src="tutorials/2-fight.json" data-turn="3" data-zoom="6"></div>
<p class="tb-replay-caption">What this replay shows, in a sentence.</p>
<!-- replay-visualiser: turn-focus-combat — filled. -->
```

| Attribute | Viewer option | Default |
|---|---|---|
| `data-src` | The replay, resolved against the book's root | required |
| `data-turn` | Open on this turn | 0 |
| `data-from`, `data-to` | Limit the scrubber to a range | the whole match |
| `data-zoom` | Cell size in pixels | fits the board |
| `data-centre` | `"row,col"` to centre on | the board's centre |
| `data-speed`, `data-autoplay` | Playback rate, and whether it starts | paused |
| `data-height` | Slot height in pixels | 360 |

`theme/tb-replay.js` imports `src/viz/viz.js` once per page and only when a slot exists — the
component is a quarter of a megabyte and most pages do not want it. The marker comment reserves the
example's identity: `grep -rn 'replay-visualiser:' src` is the inventory, and each says `filled`,
names what a planned recording must show, or says `BLOCKED` and why.

The adapter chapter has a second slot, and a page author never writes its markup: a directive names
an example file, relative to the page, and `studio/studio.py` expands it on every build.

```text
{{#studio studio/foe-positions.json}}          the example's logic as a JSON block, then its link
{{#studio studio/own-hills.json nocode}}       the link alone, when the prose already shows the code
{{#studio studio/baseline-in.json embed}}      the code, the Studio itself in the page, then the link
```

An example is `{"about", "templating", "logic", "data"}`. `about` becomes the link's caption, and
`templating` stays `true` for an adapter: it is the Studio mode that follows the dialect's object
rule and shows a `tb.*` call with its arguments evaluated instead of refusing it. The link is the
Studio's own share format — `{l, d, t}` as MessagePack, raw DEFLATE, base64url in `?s=` — so it
opens that exact example. `theme/tb-studio.js` mounts an `embed` slot with datalogic-rs's own
mdBook widget, fetched from the Studio's site once the slot scrolls into view; without it the slot
takes no space and the code and the link are the whole example.

`src/SUMMARY.md` is the published chapter order and the page list. `create-missing = false`, so an
entry without a file is a build error rather than a new stub.

## Run it, test it

All commands run from this repository's root.

- **mdBook 0.5.4.** `theme/index.hbs` is that version's template, vendored; another version's
  `book.js` may look for elements it does not find.
- Python 3, for `studio/studio.py` — an mdBook preprocessor, so every `mdbook build` runs it — and
  for `tutorials/make-map.py` and the build's digest check.
- The `tinybrains` CLI and a viewer at `$ANTS_DIST/viz` (default `../../ants/dist/viz`), to
  regenerate the lessons. `Dockerfile` takes both from artifact images and needs neither on the
  host; by hand, `docker cp` them out of `tinybrains/cli:dev` and `tinybrains/ants:dev`'s
  `/artifacts/`, or use a built checkout of each.

```sh
mdbook build                # the whole check: no test suite, no linter
mdbook serve                # preview at http://localhost:3000
tutorials/build.sh          # boards -> replays -> src/tutorials, and re-vendor the viewer
python3 studio/studio.py link src/models/adapters/studio/foe-positions.json   # one example's link
```

`mdbook build` fails on a `SUMMARY.md` entry with no file behind it, and on a `{{#studio}}`
directive whose example is missing, is not JSON, or lacks `logic` or `data`; those are the only
automated checks this repository has. Relative links, embedded values, the prose around a replay,
and what an example evaluates to in the Studio are verified by reading.

`tutorials/build.sh` refuses when a replay and the vendored viewer name different engine digests. A
viewer re-simulating with the wrong engine does not fail — it draws a plausible match that never
happened, which is the one failure a teaching page must not have.

## What a deployment owes it

The book is static files with no runtime configuration. What it needs is a serving layer that
answers for them correctly.

| Setting | Owner | Missing or inconsistent value |
|---|---|---|
| `site-url` | book.toml | mdBook writes `<base href>` into `404.html` alone; wrong here, that page loads no stylesheet at any depth |
| `$uri.html` before `$uri` | The serving layer | `models/adapters` is both a page and a section; match the directory first and the chapter becomes unreachable |
| 404 with a 404 status | The serving layer | A `try_files` fallback answers 200, which tells a crawler the page exists and a reader nothing |
| `application/wasm` for `.wasm` | The serving layer's MIME table | `WebAssembly.compileStreaming` refuses the response and no replay draws |
| No SPA fallback above `/viz/` | The serving layer | A wildcard that answers HTML for a missing module leaves every replay showing its fallback sentence |
| A rebuilt `book/` | CI, or `mdbook build` by hand | `mdbook serve` overwrites `book/` with a livereload preview whose `site-url` is forced to `/` — a `serve` left running is what gets served |
| `goplasmatic.github.io` reachable, and allowed | The reader's network, and any Content-Security-Policy the serving layer adds | Every Studio slot shows its fallback sentence; the links under the examples still open the Studio in a tab of its own |

`site-url = "/"` because the book has its own host. The local stack is the one case it is wrong
for: `devops/docker-compose.yml` binds `docs/book` into Web's nginx at `/docs/`, where the
not-found page looks for its stylesheets one level too high. That is the preview, not the
deployment.

## Layout

```text
src/                 the pages -- two openers, then thirty-four chapters in five sections
src/SUMMARY.md       the published chapter order; create-missing = false
src/models/adapters/studio/   the adapter examples: logic, data, and what the data is
studio/studio.py     the {{#studio}} preprocessor, and `link FILE` to print one example's URL
src/tutorials/       generated: the lesson replays (gitignored)
src/viz/             the cartridge's viewer bundle, from its artifact image (gitignored)
tutorials/           the lessons' sources -- boards/*.txt, seat scripts, build.sh, make-map.py
tutorials/README.md  how to write a lesson, and what the viewer cannot show
theme/               the book wearing the application's design system
book.toml            the wiring, with the reasoning in comments
book/                output (gitignored)
```

### The theme

The book wears the application's design system — the same palette, the same type, the same brand —
so a reader crossing from `/leaderboard` to `/docs` does not cross a visual seam. It wears it
literally: `theme/tokens.css` **imports `/design-system/tokens.css`**, the application's own
stylesheet off the application's own origin, rather than restating it. There is no colour in this
directory. Nothing about any of it lives in a page; it is all in `theme/`, and `book.toml` wires it
up.

The book has no navigation of its own and no footer. The bar's right end carries three things and
no more: the theme switch, a **house that goes to `/`** — the application it is served beside, and
the whole of the way back to it — and the source. A copy of the application's nav here would be a
copy that goes stale the first time the application's changes. The bar holds the search,
**the page's title**, the theme button and the way to the source. The title is centred on the bar
and it is the page's `<h1>`: the chapter's own heading is taken out of the content, because the two
said the same words a few lines apart. The bar is sticky, so a page keeps its title on screen the
whole way down. The brand belongs to the sidebar's heading band and moves into the bar, in front of
the title, when the sidebar is away — and then the title follows it rather than centring.

| File | What it is |
|---|---|
| `theme/tokens.css` | **An `@import` of `/design-system/tokens.css`, the application's own stylesheet off its own origin** — not a copy of one, and there is no colour in it. It carries the two things the import cannot: `index.hbs` mirrors mdBook's theme class onto `data-theme` (the attribute the imported palettes are keyed to), and this file re-asserts `--bg` from `--bg-base` for a reader with JavaScript off, where mdBook's `.light, html:not(.js)` block at (0,1,1) would otherwise beat the imported `:root` at (0,1,0) and force a white page under near-white ink |
| `theme/tinybrains.css` | mdBook's own variables answered in Cobalt roles, then the site's components — the bar, the brand, the sidebar, notes, tables, code — restated for the elements mdBook emits. It names no colour, only tokens |
| `theme/index.hbs` | mdBook 0.5.4's template, vendored. Every change carries a `TINYBRAINS` comment: the logo sprite, the brand in the sidebar band and in the bar, `{{ chapter_title }}` as the page's `<h1>` in the bar, the sun/moon theme button beside the source link, and two themes instead of five |
| `theme/tb-site.js` | The bar's theme button. It sets no theme and it does not choose the glyph — it clicks mdBook's own hidden theme buttons, which is where all the work already lives, and keeps the label saying what the click does |
| `theme/tb-replay.js`, `theme/tb-replay.css` | The embedded replay viewer, and the frame around it |
| `theme/tb-studio.js`, `theme/tb-studio.css` | DataLogic Studio in a page — fetched from the Studio's own site when a slot scrolls into view, and mounted again when the reader switches theme — and the link under every adapter example |
| `theme/fonts/fonts.css` | Empty on purpose. The design system is set in the reader's own interface font, so the book ships no webfont |
| *(no logo, no favicon)* | Both are the application's files, linked root-relative: `/logo-circuit.svg` and `/logo-circuit-light.svg`. `index.hbs` links them as the tab icon (the media pair `web/index.html` uses, because a favicon is chosen outside the document and cannot follow the book's theme class) and draws both as the brand mark, with CSS picking one. `mdbook build` would otherwise leave its **own** logo in the output as `favicon*.svg`/`.png`; `Dockerfile` deletes them |

The order of `additional-css` in `book.toml` is the mechanism: mdBook appends these after its own
stylesheets, so `tokens.css` can answer mdBook's palette and `tinybrains.css` can restate the
site's components without an `!important` in sight.

## What must stay true

- **A lesson is engine output, not a drawing.** Every replay is played through the real cartridge
  from a written script, and `build.sh` checks each one's `engine_digest` against the viewer's. A
  diagram of a rule can be wrong about the rule; this cannot.
- **`tutorials/replays/real-match.json` is captured, not generated.** It is a real match copied from
  a running stack, so it is the file that goes stale silently — the digest check is what catches it.
- **The prose teaches the rule without the replay.** A viewer that fails to load falls back to a
  sentence, and a page whose explanation lived in the animation would teach nothing.
- **`world-fog` and `observation-payload` stay empty until there is a seat view.** A replay frame is
  the referee's view; ground truth in either slot would teach the reader the opposite of the point.
  Filling them needs `replay-decode` answering "what did seat N see on turn T" — an Ants ABI change,
  and so a decision rather than a task.
- **No invented result.** A planned example states what a recording must show; it never names a
  match, an asset or a digest that does not exist.
- **A Studio link is written from its example, never pasted.** A link carries its whole expression
  and data, so one pasted beside an example is a second copy that drifts the first time either is
  edited. The page holds a `{{#studio}}` directive; the build writes the code and the link from one
  file.
- **The Studio is not the referee**, although it is now the same engine. What differs is objects
  (it treats a multi-key one as a literal; the arena refuses one), the operation count, and tensors,
  which it shows unevaluated. Every page that links to it can say so without the reader leaving the
  book, and every claim about what the arena does — a cost, a tensor, a trap — is checked with
  `tinybrains adapt` or `tinybrains check`, which link the node's own two libraries.
- **The numbers belong to whoever computes them.** `src/reference/limits.md` dates its snapshot and
  names each owner. Verify against the current producer before changing a value here.
- **The palette is the application's, because it *is* the application's.** `theme/tokens.css`
  imports it off the shared origin; a colour invented here is a colour the site does not have.
- **The logo is the application's file, not a drawing of one.** It used to be an inline `<symbol>`
  whose strokes named the region tokens, which followed the theme but was a second copy of the mark
  — and by the end it was a *different* mark, because the application moved from the network logo to
  the circuit one and nothing told the book. Now `index.hbs` points at `/logo-circuit.svg` and
  `/logo-circuit-light.svg`. **Two files, because a standalone SVG is its own document and cannot
  read the page's custom properties** — `web/src/components/Logo.tsx` says the same of the same pair.
  Both are in the markup at each of the two places it appears, and `tinybrains.css` §4 picks one, the
  way the sun and moon are picked.
- **`theme/index.hbs` is pinned to mdBook 0.5.4.** book.js reaches for `.menu-title`,
  `#mdbook-theme-toggle` and `#mdbook-theme-list` by name and throws without them, and the two theme
  names — `navy` and `light` — are read by book.js (which syntax stylesheet) and by `tb-replay.js`
  (which palette the viewer wears). On an mdBook upgrade, re-diff the template against
  `mdbook init --theme` from the new version and re-apply the marked blocks; nothing at build time
  notices one that has fallen behind.
- **Which brand shows is CSS, not script.** The swap runs off the sidebar toggle's own checkbox, so
  it is right on the first paint and right with JavaScript off. The theme button works the same way:
  both the sun and the moon are in the markup and the theme class picks one, so it never draws the
  wrong glyph first. The icon names where the click goes, not where the reader is.
- **There is one `<h1>` per page and it lives in the bar.** `.page-name` is the heading; its
  container is a `div`, because upstream's `<h1>` wrapper would make two. book.js finds the
  container by class, so the tags are free to be the right ones.
- **The chapter's own heading is hidden, not deleted.** `.content main > h1:first-child` — first
  child only, so a page that opens some other way is untouched, and so is every chapter but the
  first when `print.html` strings them together. It comes back under `@media print`: there is no bar
  on paper, and a printed chapter with no title is worse than one that says its name twice. Every
  page in `src/` opens with exactly one `#` heading today, which is what makes the rule safe; a page
  that stops doing so keeps its heading and shows the title twice.
- **Nothing generated is committed, and `real-match.json` is the exception that proves it.**
  `src/tutorials/`, `src/viz/`, `tutorials/boards/*.json` and the scenario replays are rebuilt by
  `Dockerfile` from artifact images. `tutorials/replays/real-match.json` is committed because it is
  *input*: a real match captured from a running stack, which nothing here can reproduce. It is also
  the file that goes stale without anyone noticing, which is why `build.sh` refuses to finish when
  its `engine_digest` disagrees with the viewer's.

## Status

**16 September 2026 (ants restructure) — the book is where Ants publishes its protocol.** `ants`
deleted its `docs/cartridge.md` and `docs/protocol.md`, so *Adding a game* took what was still true
and not already here — the three shape details found against a real Orion, the wave-state rules,
boards as files, replays that carry their board, the registration manifest by example, building and
signing the component, Orion's plugin ceilings (checked against its config), the viewer's contract,
and what a game must not need — and drops a paragraph about a `state0` gap that was closed long
ago. `ants` builds into one `dist/`, the same tree as its image's `/artifacts/`, so
`tutorials/build.sh` reads the viewer from `$ANTS_DIST/viz` (default `../../ants/dist`) and
`Dockerfile` sets `ANTS_DIST` to the `/artifacts/` it already copies instead of making a second
copy. `repositories.md` names the crate's new `engine/` paths, and `testing.md` builds the cartridge
before a registry can resolve it. **The engine digest moved** (no rule did), so
`tutorials/replays/real-match.json` must be re-captured once the local stack plays the new engine,
or this build refuses it.

**16 September 2026 (baselines) — the baselines are a directory of Ants.** `ants-baselines` moved
into `ants` as `baselines/`, so `repositories.md` lists it under Ants and under what a competitor can
read, with a note beside the axon and jodi ones; `running-locally.md` says where the seeder reads the
artifacts; and the adapter walkthrough links and names `ants/baselines/src/tb_baselines/planes.py`.
The links resolve once the ants commit carrying `baselines/` is pushed.

**16 September 2026 (merge) — the platform chapter has five application repositories.** `jodi`
merged into `soma`, so the architecture, repositories, contributing, running-locally and
adding-a-game pages name Soma's clocks where they named Jodi, the glossary folds Jodi's row into
Soma's, and `limits.md` names Soma's admission clock as the judge of the season's boundaries.
`contributing.md` also stops claiming the generated clock files are uncommitted (Soma commits them)
and stops listing two cross-repo equalities `configs.sh` no longer has: the strike ceiling is
pinned on the match row, and the priors are one `[vars]` value.

**16 September 2026 (later) — the submission page uploads for you, and the book says so.**
`competing/submitting.md` splits into **The short way: the site's form** and **The long way: the
API**; the short way is pick the model, pick two files, press the button, with the browser doing the
hashing and the transfer. `quickstart.md` step 3 is now "Hash the two files — or let the site do
it", because through the site there is nothing to run at that step.

**16 September 2026 — the submission contract lost GitHub.** No repository per entry and no release
per version: `competing/models.md` is now "the name is the key, and it is yours", `submitting.md`
replaces **Prepare the release** with **Prepare the two files** and answers the audit question with
the artifact key (`models/<version_id>/model.onnx`) rather than a release that was never verified,
and `quickstart.md` step 3 is "Hash the two files" instead of "Publish a GitHub release".

`reference/rejection-reasons.md` drops seven codes (`repo_invalid`, `repo_unverified`,
`repo_private`, `repo_not_owned`, `repo_taken`, `repo_taken_by_you` and the `409 duplicate release`
row) and gains `name_required`; `reference/api.md` follows the route change to `/v1/models/{id}`;
`reference/limits.md` loses the `repo.allow_orgs` season rule, which no longer exists.
`competing/admission.md`'s checked list is one stage shorter — the GitHub commit read was stage 1 —
so the list renumbered.

The sentence to keep is still there and is more true than it was: **the platform downloads nothing
from you.**

**16 September 2026 — the book moved into `web/`, and the copy that held the palette is gone.**
`Tiny-Brains/docs` was a repository for a host, `docs.tinybrains.dev`, that is not coming; the book
is served at `tinybrains.dev/docs` and nowhere else. It is `web/docs/` now, with this README, its
own `CLAUDE.md`, its own toolchain and its own `Dockerfile` — one repository, two artifacts, and
`web`'s image copies the rendered book in from `DOCS_REF`.

Three things that were wrong because of the boundary, and are not now:

- **`site-url` was `/`.** mdBook writes `<base href="{site-url}">` into `404.html` alone, so under
  the `/docs/` mount that page looked for its stylesheets one level too high and rendered as bare
  markup — on every deployment there has been, not only in preview. It is `/docs/`; the 404 page's
  four stylesheets answer 200.
- **`theme/tokens.css` was a copy that had drifted**, still carrying `--panel`, `--warn`, `--bad`
  and `--mono` after the application deleted them. It is an `@import` of the application's own
  stylesheet. Measured through CDP, the book and the application compute the same `--bg`, `--ink`
  and `--accent` in both themes.
- **The theme switch stored a key nothing read.** It writes the application's `tb.theme` now, and
  `index.hbs` reads it before the first paint, so one stored choice serves the whole site — and an
  unchosen one follows the reader's system, which the book did not do: its default was dark whatever
  the system said, so a light-mode reader crossed from a light site into a dark book.

`mdbook build` is clean and twelve replays still agree with the viewer on `sha256:185a2845…`.
**`mdbook serve` is no longer the real preview**: `site-url` and the imported stylesheet both assume
the application's origin, so build the book and read it at `localhost:5173/docs/`.

**15 September 2026 — every rules section now has a lesson cut for it, and five that were sharing or
straining one do not.** The round below fixed captions that disagreed with their frames; this one
fixed the replays those captions pointed at, where the movement was not the clearest way to show the
rule. Four lessons are new or rebuilt and three sections stopped borrowing each other's:

- ***The world*** gets **`6-wrap`**: three orders north and three west, so the ant crosses the top
  edge on turn 2 and the left edge on turn 5 and ends in the far corner, three rows and three columns
  from the hill it started on. The page claims both axes wrap; the old replay only ever crossed one,
  and it was `1-movement`, borrowed from another page.
- ***A turn: moving and collisions*** gets **`7-collide`**, which walks a colony's two ants onto one
  square deliberately, through entry 0 of the order array, instead of reporting the accident that
  used to end `4-growth`. The section also now says what no replay can show: **two enemies can never
  collide**, because any two ants that could reach one square were within attack range the turn
  before, and two enemies in range can never both survive a battle — each would need strictly higher
  focus than the other. The exception is an ant that spawned after that battle.
- ***A turn: food and new ants*** keeps `4-growth`, rebuilt so it is about growth: the gather on turn
  1, the ant on turn 2, and both ants alive at the turn limit. The other colony gathers on turn 1 too
  and never spawns, because its own ant is standing on its only hill — the second half of the rule,
  in the same replay, where before the lesson ended with the growing colony exterminating itself.
- ***What your model answers*** gets `1-movement`, re-scripted into five valid orders and five
  outcomes nobody asked for: an order east refused by the food beside the hill (which is gathered
  anyway, from where the ant stands), an ant appearing on the hill the gatherer left, one string
  moving every ant, and then the same order east refused by water for one ant and carried out for the
  other. That last frame is what the slot opens on, which is the section's whole claim.
- ***Testing before you submit*** gets **`8-idle`**: a seat that answers all ten turns and moves
  nothing, beside one that gathers, spawns and walks to three ants. It is the symptom the page
  describes — a hold channel that wins everywhere — and the page's own counter is now **per seat**,
  because folded together one seat's moves cover for the other's and a colony that never moved reads
  as a match that looked busy. Run it on the replay: seat 1 is ten holds and nothing else.

Twelve replays and seventeen slots (plus the two deliberately empty ones and the planned trial
recording), all agreeing with the viewer on `sha256:185a2845…`; `mdbook build` clean. `tutorials/README.md` says which page embeds each lesson, so a lesson that drifts from its
section is visible in the inventory rather than in a caption.

**15 September 2026 — the rules chapters play the rules they claim, and two lessons were rewritten
because they did not.** Every embedded replay was decoded frame by frame with the vendored cartridge
and read against its caption. Five captions described something the frames do not.

**`3-raze` never razed a hill.** Its script walked a lone ant at a *defended* hill, which is a
trade, not a raze: the attacker died at squared distance 5 of the ant sitting on the hill, the match
ended four turns short of the script on `lone_survivor`, and the 3&ndash;0 came from the rule that
hands the last colony with living ants every standing enemy hill. Two pages said "the attacker
reaches the hill", six lines under the sentence saying an attacker killed in battle razes nothing.
The lesson now walks the defender off its hill first and razes it on turn 10, `rank_stabilized`
3&ndash;0, with the attacker standing on it in the frame the pages open.

**The combat section could not show its own rule.** One against one resolves inside the turn the gap
closes, so no frame of `2-fight` ever holds two ants in range — and the prose said they "meet on turn
3", which has them four columns apart at squared distance 16. The prose now says what the frames
show, and a new lesson, **`5-focus`**, plays the table's second row: two ants that cross into range
on the same turn kill a lone defender and both live.

**Three more slots were wrong about their own replay.** `4-growth`'s caption was written in delta
indices and was a turn early in all three clauses (`data-turn` is a frame index: frame N is the board
after N turns). The collisions section illustrated wrapping — its caption said so — and now points at
the friendly collision in `4-growth` turn 3, which is a colony exterminating itself because orders are
positional in `mine` order. And `1-movement` moved to seed 2: a board with `food: []` still grows ants,
because the hidden food rate is drawn from the seed, and on seed 1 the walker picked some up and the
one-ant lesson quietly became two.

**Four rule statements disagreed with the engine.** Food refuses a move exactly as water does
(`move_ants` blocks both) and the book named only water. The ending-condition table claimed to be in
check order with the turn limit third, where the engine checks it last. The two stalemate cutoffs are
one counter watching an 85% share of the whole population — living ants, the hive behind every standing
hill, and loose food — not "85% of living ants" and "no food collected". And razing a hill *does* zero
that counter, where the page said the engine does not implement the reset. Spawning running after the
fighting is now stated too, because it is why a defender killed on its own hill is replaced the same
turn out of the hive, and why `5-focus` needs a defender whose colony never gathered.

**Two mechanical checks, in `build.sh`.** Each spec carries its own inline copy of the board it plays,
so an edit to a drawing could regenerate a board nothing reads while the lesson kept playing the old
one — `4-growth`'s copy had already drifted, and the two are now compared. And every `data-turn` on
every page is checked against the replay it names: the viewer clamps a turn past the end to the last
frame, so a page pointing past a re-captured match shows a different moment and says nothing. Seventeen
slots, nine replays, all agreeing with the viewer on `sha256:185a2845…`. What no check can do is tell
whether a caption describes the frames, which is exactly what went wrong: a lesson is verified by
reading its frames, not its script.

`src/games/ants.md` also moved off turn 40 of the real match, where both colonies are a single ant and
nothing has happened, to turn 240, where fifty ants stand against one; and `src/competing/trial.md`
opens at turn 0, because its caption promises a match from the opening.

**15 September 2026 — the book is audited against the running platform, and nothing in it describes
a shipped thing as unbuilt.** Fourteen pages changed. Three said something the implementation
contradicts: `competing/replays.md` said the browser replay viewer did not exist and that the
decoder wanted a packed `state0` — three lines above an embedded, working viewer, and `state0`
appears nowhere in Ants — so that section is now how to watch one (the site, `tinybrains view`,
`tinybrains conform`) and the envelope's fields are listed in full, including the per-seat strikes
and inference that explain most disappointing results. `competing/matches.md` said an owner-scoped
listing of every other match state was not implemented; `GET /v1/me/matches` is exactly that.
`competing/submitting.md` told a competitor to paste a `fetch()` into the console because the shell
had no form; `/submit` has been a finished form since this morning, upload step included. The
"sign-in and API probes" description of Web is gone from all five places it appeared.

**The platform section was a release behind.** `running-locally.md` still copied packages into
volumes (they are mounted `type: image` now, so there is no volume to repopulate), still said
`docker compose up --build`, which does not build a package image because they sit on the `build`
profile, still hand-rolled `.env` where `scripts/setup/init.sh` now does every credential and
signature, and still described Postgres's init directory where `db-bootstrap` now applies the
migrations and refuses a rewrite it cannot apply. It gains the Docker 28 / Compose v2.32 floor that
image mounts need, the fleet overlay, and two rows in *When nothing plays*. `repositories.md` said
Jodi and Kalam commit their generated JSON and that Kalam vendors the Ants component — neither is
true since 10 September, and the second is backwards: rebuilding Ants is now precisely what moves
the engine Kalam plays. Its table said "seven" over six rows and omitted the four repositories a
competitor can actually read; they have a table of their own now. `contributing.md` carried the same
two wrong conventions, and `adding-a-game.md` said component signing was incomplete when it is
enforced.

**Two capabilities the book never mentioned.** `tinybrains env` — the real cartridge behind a JSON
Lines protocol, so a training loop steps the engine the ladder plays instead of a second
implementation in Python — is documented on the testing page with its handshake, its pool, and the
warning that it is not the referee. And `Tiny-Brains/ants-starter`, a trained nano entry that admits
unchanged, is the quickstart's short path, which is what the site's own onboarding has said since
11 September. `tinybrains games` and `tinybrains maps` are named too; the CLI has nine commands and
the book documented five.

**The API reference was missing nine routes**: the game detail and the submission preflight (both
already cited by other pages), `/v1/me/matches`, `PATCH /v1/me`, the two session routes, the public
profile, `/v1/status`, and the season edit. Three field lists were behind — a leaderboard entry's
`version_id`, `model`, `repo`, `baseline` and the body's `total`; a season's `weight_classes` and
its five counts; a version's `class_max_bytes`, `baseline`, `last_played_at` and `orion_version` by
name. **The nine cached reads are now documented**, because a competitor is told on three pages to
poll a version's status and that read is ten seconds old. `reference/rejection-reasons.md` gains
`HEAD_UNREADABLE` (the policy head must be rank 2 or 4 — the one competitor-facing rejection the
book did not name), `repo_taken_by_you`, `ENGINE_RETIRED`, and the retry-class words; it loses
`CLASS_FULL`, which exists in no repository.

Every value was re-verified against its producer rather than assumed, and all of them were already
right: the adapter budget, turn limits and the three Ants radii against `cartridge.json` and the
engine source, the five class boundaries against the seasons table, opsets 13–19 and all 74
allowlisted operators against the DevOps template, and every rating and scheduling number against
Jodi's `config.md`. `mdbook build` is clean, all 38 internal anchor links resolve, and the eight
replays still agree with the vendored viewer at `sha256:185a2845…`.

**11 September 2026 — a leaderboard entry's `trend` and `history` are in the API reference.**
Soma has carried `trend` since the entry split and gains `history` today, the last twelve ratings
on the ladder for the site's sparkline; neither was in `reference/api.md`'s field list.

**15 September 2026 — the book is on the manifest contract, and nothing in it names a service that
no longer exists.** `adapter.json` is `manifest.json`, the `tb.*` dialect is datalogic's own tensor
operators, and the `out` program is gone: the referee reads the policy head, so
*What your model answers* is now a contract about an output tensor rather than about a program the
entrant writes. The size metric is the two files' bytes and every class cap doubled with it. A
dimension may be a name, so the padding advice went. The observation carries `vis`. Submitting has
a fourth step — **upload**, to two one-shot presigned URLs — because the platform stores no bytes of
its own and downloads nothing from a competitor.

Three things were measured rather than assumed, with `tinybrains adapt` against the real evaluator,
and two of them corrected what this book used to say: **`{"==": [0, null]}` is `true` in the arena**
(it was `false` under the old dialect, and the Studio's disagreement was the book's most-repeated
caveat); **an object literal does not exist** — every object is an operation, a multi-key one is an
error, and an unknown key fails at evaluation rather than at load, which is why the `reduce`
examples now carry arrays; and the baselines' adapter costs 86,051 operations at 64×96 and 229,415
at 128×128, which is the table on the budget page.

**11 September 2026 — the adapter chapter explains the adapter, and every example opens in
DataLogic Studio.** Two new pages: *A real adapter, piece by piece* reads the baselines' adapter
plane by plane, both programs, with its measured cost; *Seeing it in DataLogic Studio* says how to
open your own, what the Studio shows, and the places it and the arena disagree. The overview, the
dialect, the operators, the budget and the testing page are rewritten against Axon's source: the
object rule stated exactly (an unknown key is a silent literal, not an error), the scope trap shown
running, every operator's charge in one table, the defaults and failure cases the operator table
left out, and the `tinybrains check` / `tinybrains adapt` workflow. Four things were wrong and are
not: the testing page said the reference set was one fixture observation and linked to an anchor
that did not exist, and it and the introduction still named a compute cap.

Nine examples live under `src/models/adapters/studio/`. Every link was decoded with the Studio's own
libraries and evaluated with its engine, and every claim about the arena — the costs, the `null`
trap, `split` as a literal, a `null` scatter coordinate landing in column 0 — was run through
`tinybrains adapt` or `tinybrains check`. The embed is datalogic-rs's own mdBook widget, loaded from
its site and unpinned — a breaking change there surfaces as the slot's fallback sentence and never as
a red build, and vendoring it would pin the bundle but not the Studio links the chapters open.

**11 September 2026 — a baseline is described as an entry.** `competing/matches.md` and the
glossary say what the platform now does: a baseline is paired, rated and settled like any entry,
carries a tag, and is the opponent in every trial.

**10 September 2026 — the book builds from artifact images, and the build is RED.** Nothing
generated is committed: `src/viz/`, `src/tutorials/`, `tutorials/boards/*.json` and the scenario
replays are gitignored, and `Dockerfile` rebuilds them — the viewer from the cartridge's artifact
image, the `tinybrains` binary that plays the lessons from devops'. Building the book no longer
needs the platform checked out around it, nor a Rust toolchain.

**15 September 2026 — the build is GREEN, and `real-match.json` is a match worth showing.** The
capture that held it red was played on engine `sha256:d41f863f…` against a cartridge that has since
moved twice, and it was a poor advertisement besides: two smoke fixtures standing still for 161
turns to a scoreless `idle_food` draw. It is replaced by a real ladder match pulled from a running
stack's replay bucket on `sha256:185a2845…` — `micro-bc` against `micro-percell`, both `micro`
class, `standard-01`, 246 turns, `rank_stabilized`, **3&ndash;0** with neither seat struck. All
eight replays now agree with the viewer.

Two captions moved with it, because both described the old match: `src/games/ants.md` said neither
model plays well, and `src/competing/matches.md` asked for turn 161 as "its last turn" — the last
turn is 246 now. The other two embeds (turn 1, turn 20) are generic and did not move.

The capture is still **source, not build output**, and it is no longer a mystery: `tutorials/README.md`
records what is in it, which stack it came from, and the two commands that read another out of the
bucket.

**Decision 46, 10 September 2026 — no compute cap.** Nine pages changed. The weight-class table lost
its FLOP column and says plainly that size is the only thing a class limits, with the turn deadline —
divided among the seats in a call — named as the compute bound. `FLOPS_OVER_CAP` is gone from the
rejection reasons: one fewer way to be refused for something a competitor could not predict locally.

**10 September 2026.** Thirty-three pages across five sections build clean under mdBook 0.5.4 with
`create-missing = false`. The competitor path — rules, model format, weight classes, the adapter
dialect and its budget, testing, submitting, admission, the trial, ranking and seasons — is written
against the current producers, with `src/reference/limits.md` dated and each value's owner named.

Sixteen replays are embedded and play the cartridge's own viewer: four scripted lessons, three
preset boards, and one real match captured from a running stack. `quickstart-first-trial` is still a
planned recording. `world-fog` and `observation-payload` are deliberately empty and say why.

The theme is done. **`docs.tinybrains.dev` is not coming** — the book is served at
`tinybrains.dev/docs` and nowhere else, which is why this directory is part of `web/` and why
`site-url` is `/docs/`. The root-relative `/docs...` links in `web/` stay root-relative.

Owed: a re-diff discipline for the vendored template on any mdBook upgrade, the seat view that
would fill the two blocked slots, and a clone-and-build check from a fresh directory.

## More

- Local references: [`src/SUMMARY.md`](src/SUMMARY.md) (the chapter order), [`tutorials/README.md`](tutorials/README.md) (how to write a lesson), [`book.toml`](book.toml) (the wiring, with the reasoning in comments).
- The platform section — [architecture](src/platform/architecture.md), [the repositories](src/platform/repositories.md), [running locally](src/platform/running-locally.md), [adding a game](src/platform/adding-a-game.md), [contributing](src/platform/contributing.md) — is the orientation for someone new to the codebase.
- Related repositories: [Ants](https://github.com/Tiny-Brains/ants), [Web](https://github.com/Tiny-Brains/web), [DevOps](https://github.com/Tiny-Brains/devops), [Soma](https://github.com/Tiny-Brains/soma), [Kalam](https://github.com/Tiny-Brains/kalam), [Drill](https://github.com/Tiny-Brains/drill).
