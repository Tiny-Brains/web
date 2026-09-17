# Teaching replays

The rules pages show the rules *happening*, rather than describing them and hoping. Each lesson is
a real match: a hand-drawn board and a written script, played through the same cartridge the ladder
runs, producing the same replay envelope the platform stores. A diagram of a rule can be wrong
about the rule. This cannot.

```sh
tutorials/build.sh          # boards -> replays -> src/tutorials, and vendors the viewer
```

`tinybrains` takes a map inline, so each spec carries its own copy of the board it plays. `build.sh`
regenerates `boards/*.json` from the drawings and **refuses when a spec's copy differs**: without
that check an edited `.txt` regenerates a board nothing reads while the lesson goes on playing the
old one.

## Writing a lesson

**Draw half the board.** A board has to be symmetric or the cartridge refuses it, and for two
players the top half is a fundamental domain — every cell in it has exactly one image below.
`make-map.py` translates your drawing, so symmetry is by construction rather than by luck.

```text
boards/fight.txt        . land   # water   H hill   * food
............
.H..........
............
............
```

**Write what each seat does.** A scripted seat's orders are read, not inferred, because "two ants
walk into the same square" has to happen exactly and no model can be relied on to do it. An entry
is one order for every ant (`"E"`) or one per ant in `mine` order (`["E", "W"]`); past the end of
the script a seat holds.

```json
"seats": [
  { "seat": 0, "label": "red",  "script": ["S", "S", "E", "E", "E", "E"] },
  { "seat": 1, "label": "blue", "script": ["N", "N", "W", "W", "W", "W"] }
]
```

A scripted seat never reaches the loader, so a lesson needs no ONNX, no model store and no
inference — and still goes through `step`, which is the whole point.

**Two things will make a lesson show something other than what you wrote.**

*A string order goes to every ant, and an array goes by position.* `"S"` moves all of them; `["S",
"-"]` addresses `mine` order, which is row-major by square — so the ant that just spawned on a hill
is entry 0, ahead of the one that walked south off it. `7-collide` uses that on purpose; it is also
what made an earlier lesson collide by accident.

*The board's `food` is turn-zero food only.* Every match has a hidden food rate drawn from its
**seed**, so food keeps appearing whatever the map says, and an ant that ends a turn beside a new
food square gathers it and grows the colony a turn later. A lesson that must not grow needs a seed
where that does not happen: play it, read the frames, and try another seed. `5-focus` is on seed 2
for that reason, `3-raze` carries no food at all, and every other lesson here was checked frame by
frame for ants it was not written to have.

*A defended hill cannot be walked into, and a dead defender can be replaced the same turn.* An ant
on its own hill has an attacker in range two squares out, and spawning runs after the fighting, so
a colony with food in the hive puts a new ant on the hill in the turn the old one dies. A lesson
about razing needs the defender gone (`3-raze`); a lesson about support needs a defender whose
colony never gathered (`5-focus`).

**Then read the frames, not the script.** The engine is the authority on what the replay shows, and
`data-turn` is a frame index: frame N is the board *after* N turns, so frame 0 is the opening and a
caption written in delta indices is one turn early everywhere. `tinybrains view replays/<lesson>.json`
steps through them.
**Put it in a page.**

```html
<div class="tb-replay" data-src="tutorials/2-fight.json" data-turn="3" data-zoom="6"></div>
```

`data-turn`, `data-from`, `data-to`, `data-zoom`, `data-centre` (`"r,c"`), `data-speed`,
`data-autoplay` and `data-height` all map to the viewer's options. Keep the prose above the slot
explaining what the replay shows: a page whose viewer fails to load is still a page that teaches
the rule, and that is why the fallback is a sentence rather than a broken frame.

## The lessons

One lesson per rule, and each one is cut for the section that embeds it: a page that has to explain
two rules gets two replays, not one replay described twice.

| | Shows | Ends | Embedded by |
|---|---|---|---|
| `1-movement` | Five valid orders and five outcomes nobody asked for: food refusing a move (and being gathered anyway), an ant appearing on the vacated hill, one string moving every ant, water refusing one of them and not the other | `turn_limit` 1&ndash;1 | *What your model answers* |
| `2-fight` | One against one: they close from four columns apart to squared distance 4 on turn 4, equal focus, both die | `extermination` 1&ndash;1 | *A turn*, *The trial* |
| `3-raze` | A defender walking off its hill and an attacker standing on it on turn 10: +2 to the razer, −1 to the owner | `rank_stabilized` 3&ndash;0 | *A turn*, *Ending and scoring* |
| `4-growth` | Food gathered on turn 1 becoming an ant on turn 2, both ants kept to the end — and the other colony blocking its own spawn by standing on its hill | `turn_limit` 1&ndash;1 | *A turn* |
| `5-focus` | Two against one, arriving in range on the same turn: the defender dies and both attackers live | `lone_survivor` 3&ndash;0 | *A turn* |
| `6-wrap` | One ant off the top edge and off the left edge — both axes in one walk — ending in the far corner, six steps out and six steps from home | `turn_limit` 1&ndash;1 | *The world* |
| `7-collide` | A colony walking its own two ants onto one square on purpose, through entry 0 of the order array | `lone_survivor` 0&ndash;3 | *A turn* |
| `8-idle` | A seat that answers every turn and never moves, beside one that gathers, spawns and walks to three ants | `turn_limit` 1&ndash;1 | *Testing before you submit* |
| `preset-*` | One turn on a real catalogue board, so a page can show the terrain a preset is played on | `turn_limit` 1&ndash;1 | *The maps* |
| `real-match.json` | **Captured, not generated.** A real ladder match, pulled out of the replay bucket of a running stack. `build.sh` does not regenerate it — the digest check is what catches it going stale. See below for how it was taken | `rank_stabilized` 3&ndash;0 | four pages |

## Re-taking `real-match.json`

It is the one file here that is source rather than output: a match the **ladder** played, which is
what makes it worth showing and also what stops `build.sh` regenerating it. When the engine moves it
has to be re-captured by hand. It should not be a mystery file while it waits, so:

**What is in it now.** A real ladder match on `open-5-03`, taken from a local stack's replay
bucket on 17 September 2026 — five seats: two jittered copies of `micro-bc` from
`devops/scripts/dev/submission-storm.py` (seats 0 and 2) and the three baselines, 367 turns,
`rank_stabilized` at 12, 3, 2, 0, 0 to seat 2, which razes seat 3's hills by turn 42, seat 1's by
turn 99 and seat 4's last on the final turn. No seat struck: seats 1 and 3 were emptied early and
were not asked for moves after (132 and 37 seat-turns). Played on engine `df312c04…`, the first
with sixteen presets. The previous capture was a two-seat `open-2` match on `85a89b42…`; the
first candidate on the new engine was passed over because its loser stood one ant still for 300
turns and lost by walking its own two ants into each other, which teaches nothing.

**How to take another.** Run the stack until it has rated some matches, then read a replay out of
the bucket. `matches.replay_key` says which object belongs to which row:

```sh
# the rated matches and where their replays are
docker exec tinybrains-db-1 psql -U soma -d soma -c \
  "select id, reason, turns, replay_key from matches where status='rated'"

# pull the bucket out; pick a replay whose map_id and turn count suit the four pages below
docker exec tinybrains-minio-1 mc alias set loc http://127.0.0.1:9000 tinybrains tinybrains-dev-secret
docker exec tinybrains-minio-1 mc cp --recursive loc/tinybrains-replays /tmp/rp
docker cp tinybrains-minio-1:/tmp/rp ./capture
```

No bucket credentials are needed for one match: `GET /v1/matches/{id}` answers a presigned
`replay_url` that plain `curl` downloads. Copy the chosen file to `tutorials/replays/real-match.json` **verbatim** — the bytes the platform
wrote are the point, so do not reformat it or rename its `match_id`.

**Pick a match that teaches something.** The capture this replaced ran two smoke fixtures that never
moved, to a scoreless `idle_food` draw after 161 turns — a poor thing to open the book with. Prefer
a decisive one, long enough that every `data-turn` below still lands inside it.

**Then check the four pages that embed it.** `src/introduction.md` (turn 1), `src/games/ants.md`
(turn 240, chosen because the match reads as decided there), `src/competing/replays.md` (turn 20) and
`src/competing/matches.md` (its LAST turn, which is `turns` itself — the decoder yields frames
0..`turns`). Every `data-turn` must still fall inside
the new match, and the captions on the last two describe *this* match — ants.md names the result and
matches.md says "its last turn" — so both move when the capture does.

## What the viewer cannot show

**Fog.** A replay frame carries the board as the *referee* sees it — every ant, all the water —
because that is what re-simulating an action stream reconstructs. What a seat *knew* at a turn is a
different question and `replay-decode` does not answer it. So `world-fog` and `observation-payload`
are deliberately empty, with a note saying why: a ground-truth replay in either place would teach
the reader the opposite of the point.

Filling them needs a **seat view** — `replay-decode` answering "what did seat N see on turn T",
which is `observe` applied to a re-simulated state. It is cheap (one optional argument, decoded for
the shown turn only) and it is an ABI change, so it is a decision rather than a task.

## What can go stale

A replay is engine output, so it goes stale when the engine changes. `build.sh` refuses when the
vendored viewer and the replays name different engine digests — a viewer re-simulating with the
wrong engine does not fail, it draws a plausible match that never happened, which is the one
failure a teaching page must not have.
