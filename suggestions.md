# Web — suggestions for attracting more developers

Brainstorm list, 11 September 2026. Read against the running stack at 1440 wide in both themes
(anonymous, plus `/submit` and `/models` gated views). Phone width was not captured — Chrome would
not resize below ~1000px. Each line is a seed for a later discussion, not a spec.

## 0. Fix first — the site currently tells a newcomer things that are not true

All five landed on 11 September 2026, one commit each (`3fd4bfd`, `afc9588`, `356a0ff`, `d066030`).

- [x] `/start` step 1 clones `github.com/Tiny-Brains/ants-starter`, which does not exist (GitHub answers 404). The first command a developer copies fails. — **Done:** step 1 is drill's own four-clone quickstart ending in `tinybrains matches/baselines.json`, run before it was written down. A real starter repo is still §2's item.
- [x] `/start` steps 4–5 and `/submit` use `drill play` and `drill hash`. Neither command exists; the CLI is `tinybrains` (`tinybrains matches/quick.json`, `tinybrains check`, `tinybrains view`) and hashes come from `sha256sum`/`shasum`. The book's quickstart already says this — the site contradicts it. — **Done:** `tinybrains check` + a drill match on `/start`; `shasum -a 256` / `sha256sum` on `/start`, the submit hint and the `hashes_required` refusal. `/docs/drill` links go to `/docs/models/testing`.
- [x] `/start` step 2's `python train.py --steps 200000` and step 3's adapter snippet (`"kind": "per_ant_move"`) are placeholders that match nothing in `ants-baselines` or the dialect docs. Every code block on the first page a visitor reads should be copy-paste real, or say it is a sketch. — **Done:** ants-baselines' own collect / train.bc / export for the nano class, and the book's complete minimal adapter, labelled as such.
- [x] `/docs` answers the SPA's 404 ("That page is not part of this site") when the book is not mounted. The nav's Docs link, all four footer "Build" links and every "→ Quickstart" on `/start` dead-end. Either serve a fallback page from the app or make the compose default mount a built book. — **Done, the first way:** a `/docs/*` page that links the chapter's source on GitHub, reached only when no book is mounted (nginx falls through to `index.html` in that case; the Vite server now serves `../docs/book` with nginx's rule, so localhost matches the container). Mounting a built book by default in compose is blocked on the docs re-capture (tracker §6).
- [x] `index.html` has no `<meta name="description">`, no Open Graph / Twitter card, and the title is `tinybrains` on every route. A link pasted into Discord, HN, X or Slack unfurls to nothing, and every tab reads the same. Per-route titles ("nano-bc v1 · Leaderboard · TinyBrains") and one OG image are cheap and high-leverage. — **Done:** description, OG and Twitter cards, `public/og.png` from `scripts/og-image.sh`, nginx making the image URL absolute per request, and `Shell`'s `title` on every route (`nano-bc v1 · Ants season 1 · TinyBrains`).

## 1. Home — answer "why should I spend a weekend on this?" above the fold

- [ ] The hero says *what* (build a small brain) but never *why*: no prize, no recognition, no what-you-learn, no deadline pressure beyond "364 days left". Add one line of stakes (recognition on a public profile, season standings kept forever, learning quantisation/distillation on a real benchmark).
- [ ] Hero stats are low-signal ("5 weight classes", "1 game, so far" reads as empty). Swap for numbers a developer cares about: competitors entered, smallest model on the board (5.9 KiB / 2,930 params), time to first entry ("~30 min with the starter"), next season date.
- [ ] The replay in the hero is a dark board with a handful of dots and no legend. A first-time viewer cannot tell what is happening. Options: a one-line caption under it ("orange ants raze the blue hill at turn 96"), a slower/zoomed cut, or a hover legend (ant, food, hill, water) as a `mount()` option.
- [ ] "Get started" and "Watch a match" are equal-weight. Add a third, lower-friction door: "Clone the starter" straight to a repo, since most developers would rather read code than a page.
- [ ] The leaderboard card shows three baselines and nothing else. An empty ladder looks like a dead site. Turn it into an invitation: a ghost row "your model here", or "Beat nano-bc (5.9 KiB, rating 17.0) to take #2", or highlight the baseline that is currently easiest to pass.
- [ ] "Recent matches" is three near-identical baseline draws (1–1, cell, 8h ago). Consider showing the *most interesting* recent match (decisive, upset, biggest rating move) rather than the newest three.
- [ ] The story section is three dense paragraphs of prose. Cut to a three-column strip (2011 game → trained nets → measured into a class) with the same links; keep the long copy in the book.
- [ ] "Build small. Aim for the top." band repeats the hero's CTA. Use that slot for something new: a size-vs-rating scatter of the ladder, which is the contest's whole thesis in one picture.
- [ ] No social proof / community anywhere: no GitHub org link, no discussions/Discord, no "N developers entered". Add a footer column and a small "Community" line on the home page once there is one.

## 2. Start — make it a 30-minute path, not a five-step summary

- [ ] Lead with a checklist of what you need (GitHub account, Python + ONNX export, the `tinybrains` binary) and an honest time estimate, before the five steps.
- [ ] Ship a real starter: a repo with a trained `model.onnx` + `adapter.json` that admits unchanged, a `train.py`, and the drill CI workflow already copied in. Step 1 should be *that* clone. `ants-baselines` already has the training code; a trimmed fork of its nano entry is the starter.
- [ ] Every step should end with "how you know it worked" (a command and its expected output), not only a link to the book.
- [ ] The five steps are a wall of equal-weight rows. Mark which steps are the hard ones (adapter, class measurement) and which are one command.
- [ ] The adapter is the concept newcomers will not know. Give it a diagram: board → observation planes → your tensor → per-ant move. The book's "a real adapter, piece by piece" chapter is good; surface its first figure here.
- [ ] "Your class is measured, not chosen" section is strong. Move it *above* the steps: it is the hook, and it currently sits under the fold.
- [ ] Add "what your model sees / answers" as a tiny visual (the observation planes and the five moves). Nothing on the site shows the model's input or output.
- [ ] Link the baselines as worked examples ("here is a 5.9 KiB model and the notebook that trained it") — it is the most convincing "you can do this" on the platform and it is not linked from anywhere in the app.

## 3. Leaderboard — show the contest's thesis, not just a table

- [ ] The rating table hides the point: strongest play per byte. Add a size-vs-rating scatter (log-x bytes, y rating, colour by class) above or beside the table. Also the natural OG image.
- [ ] Per-class winners are a switch away and invisible on Open. A compact "class champions" strip (nano · micro · mini · small · large, one row each) above the table gives five people something to be proud of instead of one.
- [ ] Baseline rows dominate. Consider a "hide baselines" toggle, or visually de-emphasise them, so a human's #1 reads as #1.
- [ ] Empty class ladders say "Nothing has been rated on nano yet." Turn each into a CTA: "Be the first in nano — anything under 8 KiB qualifies."
- [ ] Row has no trend history. A tiny sparkline of rating over the last N matches is the difference between a table and a race.
- [ ] Add a "size headroom" column or bar (the version page's cap bar, miniaturised): 5.9 / 8 KiB tells a story that 5.9 KiB alone does not.

## 4. Matches and the match page

- [ ] Match rows: the giant score dominates while the useful bits (preset, reason like `idle_food`, turns, whether a rating moved) are 10px pills or absent. Rebalance: name the outcome in words ("draw, both idle at turn 150"; "orange razed blue's hill at turn 96").
- [ ] `/matches` is a flat 25-row list with no shape. Add a summary strip above (matches today, decisive vs drawn, average length) and group by day.
- [ ] The match page's control hint sits under the board in muted text. Fold it into the viewer's hover tray, and add a "share this turn" link (`?turn=96`) so a match can be pointed at.
- [ ] A match has no "what happened" summary. Even one line built from data the API already has (reason, turns, hills razed, ants lost) makes the replay skimmable.
- [ ] The result card and rating card are two boxes of the same size; the rating delta is the interesting one and could be the header line.

## 5. Version and profile pages — make them worth linking to

- [ ] The version page is a record card (hashes take a third of the height). Reorder for the reader: rating + rank, size against cap, param count and inference at the top; hashes and digests collapsed under "Provenance".
- [ ] "GitHub release · printed, not linked" and `v0-placeholder` on baselines look broken to an outsider. Baselines should link to their training recipe in `ants-baselines` instead.
- [ ] Profile pages are the developer's public trophy. Add a header stat line (best rank, best class, matches played, since) and make the page unfurl well (OG). This is what people will share.
- [ ] Nothing on a profile links to the person's model repository. The entry's repo is the most useful outbound link on the site.

## 6. Shell, navigation and docs

- [ ] The top nav is Leaderboard · Matches · Docs. "Get started" is only reachable from the hero and the footer; give it a nav slot — it is the conversion page.
- [ ] Docs are a separate mdBook with different chrome. Clicking Docs feels like leaving the site. At minimum give the book the same bar (or a "← tinybrains" link) and the same tokens; better, surface the quickstart inside the app.
- [ ] The context strip (game · season · deadline) is on every selector page but the deadline ("364 days left") is not urgency. Show what *is* time-bound: next season, or a "submissions this week" count.
- [ ] Footer lacks: source on GitHub, licence, contact, contributing, changelog. Add a "Project" column.
- [ ] `/models` and `/submit` anonymous views are correct but terse. `/models` (401 page) could preview what a signed-in view looks like so the sign-in has a visible payoff.

## 7. Content that does not exist yet and would pull developers in

- [ ] A "What's new" / changelog page: seasons opening, engine cutovers, new baselines. Developers return to sites that change.
- [ ] A FAQ: "Can I use PyTorch?", "What ops are allowed?", "How is size measured?", "Can I enter more than one model?" — the answers are in the book but scattered.
- [ ] A gallery of replays worth watching (best comeback, fastest raze, smallest winner) — curated, not newest.
- [ ] A per-season "results" page once season 1 closes: podium per class, the size/rating curve, a short write-up. The permanent link people cite.
- [ ] Notify-me: an email or RSS for season openings and closings. Nothing on the site lets a visitor come back later.

## 8. Not verified in this pass

- [ ] Phone-width layout (Chrome would not resize below ~1000px; CLAUDE.md says pages were read at 400 wide).
- [ ] Signed-in home panel, admission steps and the submit success path (need a minted session).
- [ ] Load time and bundle size of the viewer (`viz.js` + `.wasm`) on first visit.
