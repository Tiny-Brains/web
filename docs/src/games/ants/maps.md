# The maps

Ants has sixteen map presets. A preset names a pool of four boards and how many
seats play them; the seed chooses which board a match is played on, so you
cannot pick one to train against. All sixteen use the same rules, and a name is
the terrain and the seat count: `open-2` is open ground for two.

| Preset | Seats | Board | Hills a seat | Water | Food a seat at turn zero | Food |
|---|---:|---:|---:|---:|---:|---|
| `open-2` | 2 | 104 × 104 | 3 | 12% | 16 | lean |
| `maze-2` | 2 | 128 × 128 | 2 | 34% | 20 | home |
| `rooms-2` | 2 | 80 × 80 | 4 | 38–40% | 44 | rich |
| `cave-2` | 2 | 152 × 152 | 1 | 50–53% | 14 | contested |
| `maze-3` | 3 | 105 × 105 | 4 | 36–38% | 32 | contested |
| `cave-3` | 3 | 81 × 81 | 3 | 46–66% | 26 | home |
| `open-4` | 4 | 128 × 128 | 1 | 30–31% | 20 | rich |
| `rooms-4` | 4 | 152 × 152 | 2 | 34–35% | 12 | lean |
| `open-5` | 5 | 80 × 80 | 2 | 11–12% | 20 | contested |
| `cave-5` | 5 | 130 × 130 | 4 | 43–53% | 20 | lean |
| `maze-6` | 6 | 144 × 144 | 3 | 44% | 36 | rich |
| `rooms-6` | 6 | 102 × 102 | 1 | 33–38% | 14 | home |
| `rooms-7` | 7 | 126 × 126 | 3 | 39–42% | 26 | contested |
| `cave-7` | 7 | 105 × 105 | 2 | 46–67% | 28 | rich |
| `open-8` | 8 | 152 × 152 | 4 | 28–29% | 32 | home |
| `maze-8` | 8 | 80 × 80 | 1 | 31–32% | 8 | lean |

Water is measured on the boards that ship, not a generator input. Food after
turn zero arrives at the match's hidden rate; see [the world](world.md). Every
board in the catalogue is square, but the format is not — the lessons in this
book play on rectangular ones — so an adapter should still never assume
`rows == columns`.

## Why these sixteen

Five things change from preset to preset, and each has four settings:

| | Settings |
|---|---|
| Seats | 2 · 3 or 4 · 5 or 6 · 7 or 8 |
| Terrain | open · maze · rooms · cave |
| Board | small, about 80 a side · medium, about 104 · large, about 128 · huge, about 152 |
| Hills a seat | 1 · 2 · 3 · 4 |
| Food | lean · rich · contested · home |

Every combination would be 1,024 presets. These sixteen are the runs of an
**orthogonal array**, L16(4⁵), laid out so that **every setting of any factor
meets every setting of any other on exactly one preset**. Every terrain is played
at every seat band, on every board size, with every hill count and every food
economy. Nothing in the catalogue ties one factor to another, so nothing in it
teaches a model that mazes are small or that eight seats come with one hill.

It also makes a result readable by factor. The four maze presets hold each seat
band, each board size, each hill count and each food economy exactly once — and
so do the four open ones, the four with two hills, the four lean ones: any four
that share a setting. Compare your entry on those four against the other twelve
and the other factors average out, so a gap is the maze, and not the board size
that happened to come with it.

What the array does not balance is three factors at once — there is no
eight-seat maze on a huge board — or exact seat counts inside a band: two seats
have four presets, and every count from three to eight has two. How crowded a
board is follows from the rest: squares a seat run from 800 on `maze-8` to
11,552 on `cave-2`.

## Food

Every economy puts some food a short walk from each hill — between two and eight
steps — and places the rest by its own rule. With `h` hills a seat:

| Food | Food a seat at turn zero | By each hill | The rest |
|---|---:|---:|---|
| lean | 4h + 4 | 2 | anywhere on land |
| rich | 8h + 12 | 4 | anywhere on land |
| contested | 6h + 8 | 3 | where your walk to it and the nearest opponent's are within 10 steps of each other |
| home | 6h + 8 | 3 | where your walk to it is shorter than any opponent's by more than 6 steps |

A seat opens with one ant and one point for every hill it has, so four hills is
four ants and four points — and four homes to defend. A colony can lose one hill
and keep spawning from the others.

## What every board guarantees

However different the terrain, every board keeps these. The cartridge refuses
a board, including one you write yourself, that breaks the first three; the
boards that ship also keep the last two.

- **Every seat has the same board.** Seat `k`'s board is seat 0's moved by `k`
  times the board's *shift*, which the map file names as `symmetry: {dr, dc}`.
  Water, hills and turn-zero food all follow it exactly.
- **Every square of land can be walked to** from every other. Ants move in four
  directions, so land touching only at a corner is not a path, and there are no
  sealed pockets for food to fall into.
- **Every hill has a way off it**, and every seat has the same number of hills.
- **Every hill has room**: at least two open neighbours, in a clearing that
  reaches at least two squares in every direction.
- **No enemy hill is in view at turn zero**: every other seat's hills are more
  than squared distance 77 away.

## The shift, and who your neighbours are

A board of `p` seats has a shift that brings you home in `p` steps. On two seats
it puts the other seat half the rows away, half the columns away, or both; on
more, the seats lie evenly spaced along a row, along a column or on a
diagonal. Those are different openings on the same kind of terrain, and a pool
mixes them. On `open-2` the walk to the nearest enemy hill is between 26 and 67
steps; on `cave-2` it is between 152 and 308.

Observations [number opponents relative to you](../../models/observation.md#ownership-labels),
and the numbering follows the shift: **opponent `j` is the seat `j` shifts along
from you**, so opponent 1 is always at your hills plus the shift, and the
numbering means the same neighbour whichever seat you sit in. Opponent `j` and
opponent `p − j` are the same distance away in opposite directions, so on three
seats both opponents border you. Opponents are numbered from 1 up to 7.

## Walls do not hide anything

Vision and attacks both reach through water. A wall stops ants walking, never
seeing, and it stops fights only when it is at least two squares thick: two
ants either side of a one-square wall are two apart, inside the attack radius.
Every maze here is walled one square thick. The walls between rooms are two
thick on `rooms-2`, `rooms-7` and the caves, three on `rooms-6` and four on
`rooms-4`.

## open-2

Open ground with light scatter, and **three hills a seat**. Between 16 and 19
separate routes join a hill to the nearest enemy one, so movement and food
collection dominate, and the food is lean: 16 a seat, two of them by each hill.


<div class="tb-replay" data-src="tutorials/preset-open-2.json"></div>

<p class="tb-replay-caption">An <code>open-2</code> board: 104 by 104 and 12% water, the two seats half the rows and half the columns apart, with three hills each. Turn zero. Scroll to zoom, drag to pan.</p>

<!-- replay-visualiser: maps-open-2 — filled.
Asset: tutorials/preset-open-2.json (open-2-00), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## maze-2

A loopy maze: a grid of rooms four squares across, walls one square thick, half
the boundaries doored. Each hill stands in a room with at least two ways out,
and two or three routes join it to the nearest enemy hill. Food is placed nearer
home.

Two ants of yours ordered into each other in a corridor both die, and food in a
corridor blocks it until it is gathered. Test that your model does not queue a
colony into its own corridors, and remember the walls are thin enough to fight
across.


<div class="tb-replay" data-src="tutorials/preset-maze-2.json"></div>

<p class="tb-replay-caption">A <code>maze-2</code> board: 128 by 128, the two seats half the rows apart, with two hills each. Three routes join a hill to the nearest enemy one.</p>

<!-- replay-visualiser: maps-maze-2 — filled.
Asset: tutorials/preset-maze-2.json (maze-2-01), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## rooms-2

A lattice of rooms ten squares across, walled two thick so fights stay inside a
room, some rooms left solid and a little rock inside the rest. It is the smallest
two-seat board and the richest in the catalogue: **four hills a seat** and 44 food
a seat at turn zero, four of it by each hill. Three or four routes join a hill to
the nearest enemy one.


<div class="tb-replay" data-src="tutorials/preset-rooms-2.json"></div>

<p class="tb-replay-caption">A <code>rooms-2</code> board: 80 by 80, the two seats half the rows and half the columns apart, with four hills each.</p>

<!-- replay-visualiser: maps-rooms-2 — filled.
Asset: tutorials/preset-rooms-2.json (rooms-2-00), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## cave-2

Caverns: warped areas with about a third left solid, rough cellular rock inside
the rest, and doors at least three squares wide through walls two thick. It is
the largest two-seat board, half water, with **one hill a seat** and the longest
walks in the catalogue — up to four times the open-ground distance. Food is
contested: placed where both seats' walks to it are within ten steps.


<div class="tb-replay" data-src="tutorials/preset-cave-2.json"></div>

<p class="tb-replay-caption">A <code>cave-2</code> board: 152 by 152 and half water, one hill a seat, the two seats half the rows apart — and 234 steps' walk between the hills, three times the open-ground distance.</p>

<!-- replay-visualiser: maps-cave-2 — filled.
Asset: tutorials/preset-cave-2.json (cave-2-01), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## maze-3

An irregular maze of small cells, nine to sixteen squares each, walled one thick
and joined almost as a tree: the most dead ends in the catalogue, 68 to 80 in
every thousand squares of land. **Three seats**, four hills each, every hill in a
room with at least two doors, and contested food.


<div class="tb-replay" data-src="tutorials/preset-maze-3.json"></div>

<p class="tb-replay-caption">A <code>maze-3</code> board: 105 by 105, three seats 35 rows apart, with four hills each.</p>

<!-- replay-visualiser: maps-maze-3 — filled.
Asset: tutorials/preset-maze-3.json (maze-3-01), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## cave-3

Islands: under half the board carved out of the water, joined by narrow ways.
Three seats with three hills each, on a small board that is between 46% and 66%
water, and food placed nearer home. The routes vary more than on any other
preset: one board joins a hill to the nearest enemy one by a single route,
another by fourteen.


<div class="tb-replay" data-src="tutorials/preset-cave-3.json"></div>

<p class="tb-replay-caption">A <code>cave-3</code> board: 81 by 81 and more water than land, three seats each 27 rows and 27 columns from the next, with three hills each.</p>

<!-- replay-visualiser: maps-cave-3 — filled.
Asset: tutorials/preset-cave-3.json (cave-3-00), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## open-4

Open ground strewn with large boulders, about 30% of the board. **Four seats**,
one hill each, and rich food: 20 a seat, four of it by each hill. Between 15 and
20 routes join a hill to the nearest enemy one.


<div class="tb-replay" data-src="tutorials/preset-open-4.json"></div>

<p class="tb-replay-caption">An <code>open-4</code> board: 128 by 128, four seats each 32 rows and 32 columns from the next, with one hill each.</p>

<!-- replay-visualiser: maps-open-4 — filled.
Asset: tutorials/preset-open-4.json (open-4-02), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## rooms-4

A fortress: walls four squares thick, which stop fights as well as walking,
around homes closed on nearly every side, each with at least two doors. Four
seats, two hills each, and the lean economy — 12 food a seat — on the largest
board size. Two or three routes join a hill to the nearest enemy one.


<div class="tb-replay" data-src="tutorials/preset-rooms-4.json"></div>

<p class="tb-replay-caption">A <code>rooms-4</code> board: 152 by 152, four seats a quarter of the rows and half the columns apart, with two hills each.</p>

<!-- replay-visualiser: maps-rooms-4 — filled.
Asset: tutorials/preset-rooms-4.json (rooms-4-03), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## open-5

Open ground with light scatter on the smallest board size. **Five seats**, two
hills each, 1,280 squares a seat, and a walk of 16 to 31 steps to the nearest
enemy hill. Food is contested.


<div class="tb-replay" data-src="tutorials/preset-open-5.json"></div>

<p class="tb-replay-caption">An <code>open-5</code> board: 80 by 80, five seats each 16 rows and 16 columns from the next, with two hills each.</p>

<!-- replay-visualiser: maps-open-5 — filled.
Asset: tutorials/preset-open-5.json (open-5-00), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## cave-5

Caverns, as on `cave-2`, on a large board: five seats with **four hills each**,
and the lean economy — 20 food a seat for four hills, two of it by each.


<div class="tb-replay" data-src="tutorials/preset-cave-5.json"></div>

<p class="tb-replay-caption">A <code>cave-5</code> board: 130 by 130 and about half water, five seats 26 rows apart, with four hills each.</p>

<!-- replay-visualiser: maps-cave-5 — filled.
Asset: tutorials/preset-cave-5.json (cave-5-01), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## maze-6

A tight maze of rooms three squares across, walled one thick and joined as a
tree, with no loops. **Six seats**, three hills each, and rich food. One or two
routes join a hill to the nearest enemy one, and the walk there is as much as
twice the open-ground distance.


<div class="tb-replay" data-src="tutorials/preset-maze-6.json"></div>

<p class="tb-replay-caption">A <code>maze-6</code> board: 144 by 144, six seats each 24 rows and 24 columns from the next, with three hills each — and a single route, 183 steps long, from a hill to the nearest enemy one.</p>

<!-- replay-visualiser: maps-maze-6 — filled.
Asset: tutorials/preset-maze-6.json (maze-6-03), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## rooms-6

Arenas: warped areas, two in five grown into open arenas, walled three thick.
Six seats, one hill each, and food placed nearer home.


<div class="tb-replay" data-src="tutorials/preset-rooms-6.json"></div>

<p class="tb-replay-caption">A <code>rooms-6</code> board: 102 by 102, six seats each 17 rows and 34 columns from the next, with one hill each.</p>

<!-- replay-visualiser: maps-rooms-6 — filled.
Asset: tutorials/preset-rooms-6.json (rooms-6-03), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## rooms-7

The lattice of `rooms-2` at a larger scale: rooms eighteen squares across, walled
two thick, some left solid. **Seven seats**, three hills each, and contested
food.


<div class="tb-replay" data-src="tutorials/preset-rooms-7.json"></div>

<p class="tb-replay-caption">A <code>rooms-7</code> board: 126 by 126, seven seats 18 columns apart along the same rows, with three hills each.</p>

<!-- replay-visualiser: maps-rooms-7 — filled.
Asset: tutorials/preset-rooms-7.json (rooms-7-00), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## cave-7

Islands, as on `cave-3`, for seven seats with two hills each, 1,575 squares a
seat, and rich food: 28 a seat, four of it by each hill. One board is two-thirds
water.


<div class="tb-replay" data-src="tutorials/preset-cave-7.json"></div>

<p class="tb-replay-caption">A <code>cave-7</code> board: 105 by 105 and just over half water, seven seats each 15 rows and 15 columns from the next, with two hills each.</p>

<!-- replay-visualiser: maps-cave-7 — filled.
Asset: tutorials/preset-cave-7.json (cave-7-00), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## open-8

Open ground with large boulders on the largest board size, and the most hills in
the catalogue: **eight seats with four hills each**, thirty-two hills and
thirty-two ants at turn zero. The nearest enemy hill is 18 to 23 steps' walk
away, and food is placed nearer home. The largest boards — this one, `cave-2`
and `rooms-4` — are also the test of inference cost and adapter headroom.


<div class="tb-replay" data-src="tutorials/preset-open-8.json"></div>

<p class="tb-replay-caption">An <code>open-8</code> board: 152 by 152, eight seats each 19 rows and 38 columns from the next, with four hills each.</p>

<!-- replay-visualiser: maps-open-8 — filled.
Asset: tutorials/preset-open-8.json (open-8-03), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## maze-8

A wide maze — rooms five squares across, walled one thick, a fifth of the extra
doors open — on the smallest board size, for **eight seats** with one hill each:
800 squares a seat, the fewest in the catalogue, and the lean economy, 8 food a
seat. The walk to the nearest enemy hill is 20 to 30 steps, up to three times the
open-ground distance.


<div class="tb-replay" data-src="tutorials/preset-maze-8.json"></div>

<p class="tb-replay-caption">A <code>maze-8</code> board: 80 by 80, eight seats 10 rows apart, with one hill each.</p>

<!-- replay-visualiser: maps-maze-8 — filled.
Asset: tutorials/preset-maze-8.json (maze-8-01), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Numbers each board carries

Every board file records what its generator measured, under `generator.metrics`,
from seat 0's first hill — which the shift makes the same for every seat's:
`routes` (square-disjoint routes from the ground around that hill to the ground
around the nearest enemy hill, counted up to 32), `enemy_walk` and `open_walk`
(the walk to that enemy hill, and the same walk with no water), `detour_pct` (the
first as a percentage of the second), `home_view_land` (the land its ant sees at
turn zero), `dead_end_pm` (land squares with at most one land neighbour, per
thousand), `water_pm` (water per thousand squares), `water_runs` (run-length
pairs in the board's water mask) and `food_per_seat`. `tinybrains maps export`
writes the files; sort a curriculum by these rather than by preset name.

## Train on every preset

The seed and engine together determine a match; preserve both when reproducing
one. A preset name alone cannot reproduce a match. Pairing spreads play across
the presets a season runs **that its pool can seat**: every seat of a match is a
different competitor, baselines included, so an eight-seat preset waits until
eight have versions to pair. Train and validate on every seat count from two to
eight and every board from 80 × 80 to 152 × 152, and review results by factor —
[the four presets that share a setting](#why-these-sixteen) — before concluding
that a change improves the model overall. A fixed-size graph needs an explicit
padding or other compatible representation for every size, with outputs mapped
back to real coordinates.
