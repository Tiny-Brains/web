# The maps

Ants has four map presets. A preset names a pool of eight boards and how many
seats play them; the seed chooses which board a match is played on, so you
cannot pick one to train against. All four use the same rules.

| Preset | Board | Seats | Hills a seat | Water | Food a seat at turn zero |
|---|---:|---:|---:|---:|---:|
| `open-2` | 64 × 96 | 2 | 1 | 12% | 12 |
| `maze-2` | 96 × 96 | 2 | 1 | 43% | 10 |
| `cave-2` | 96 × 96 | 2 | 2 | 45–51% | 16 |
| `rooms-4` | 128 × 128 | **4** | 1 | 33–35% | 12 |

Water is measured on the boards that ship, not a generator input. Food after
turn zero arrives at the match's hidden rate; see [the world](world.md).

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

A two-seat board puts the other seat half the rows away, half the columns
away, or both. Those are three different openings on the same kind of terrain,
and a pool mixes them. On `open-2` the nearest enemy hill is between 32 and 80
steps away.

On a four-seat board the shift decides who borders whom. Observations number
opponents relative to you, and the numbering follows the shift: **opponent `j`
is the seat `j` shifts along from you**, so opponent 1 is always at your hill
plus the shift, and the numbering means the same neighbour whichever seat you
sit in.

## Walls do not hide anything

Vision and attacks both reach through water. A wall stops ants walking, never
seeing, and it stops fights only when it is at least two squares thick: two
ants either side of a one-square wall are two apart, inside the attack radius.

## open-2

Open ground with scattered rocks, the smallest board, and the rectangular one:
it exposes adapters that accidentally assume `rows == columns`. Between 16 and
20 separate routes join two seats' home grounds, so movement and food collection
dominate.


<div class="tb-replay" data-src="tutorials/preset-open-2.json"></div>

<p class="tb-replay-caption">An <code>open-2</code> board: 64 by 96, one water square in eight. Turn zero, both hills visible. Scroll to zoom, drag to pan.</p>

<!-- replay-visualiser: maps-open-2 — filled.
Asset: tutorials/preset-open-2.json, turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## maze-2

A tight maze: corridors two squares wide, walls one square thick, doorways one
square wide, joined almost as a tree. Each hill stands in a small open room with
at least two ways out. Between one and four routes join two seats, and the walk to the
enemy is up to nearly three times the open-ground distance.

Two ants of yours ordered into each other in a corridor both die, and food in a
corridor blocks it until it is gathered. Test that your model does not queue a
colony into its own corridors, and remember the walls are thin enough to fight
across.


<div class="tb-replay" data-src="tutorials/preset-maze-2.json"></div>

<p class="tb-replay-caption">A <code>maze-2</code> board: 96 by 96, with the seats half the rows apart. Routes matter far more than distance.</p>

<!-- replay-visualiser: maps-maze-2 — filled.
Asset: tutorials/preset-maze-2.json, turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## cave-2

Caverns: large bodies of solid water, organic chambers joined by wide openings
through walls two squares thick, and **two hills a seat**. A colony opens with
two ants and two points, can lose one hill and keep spawning from the other, and
has two homes to defend. Food is placed where both seats' colonies are about
equally far away, so it is contested.


<div class="tb-replay" data-src="tutorials/preset-cave-2.json"></div>

<p class="tb-replay-caption">A <code>cave-2</code> board: 96 by 96 and half water, with two hills a seat.</p>

<!-- replay-visualiser: maps-cave-2 — filled.
Asset: tutorials/preset-cave-2.json, turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## rooms-4

Four seats in a lattice of square rooms fourteen squares across, walled two
thick so fights stay inside a room, some rooms left solid, and doorways a few
squares wide. It is the largest board, so it is also the test of inference cost
and adapter headroom, and the one where opponents are numbered past 1.


<div class="tb-replay" data-src="tutorials/preset-rooms-4.json"></div>

<p class="tb-replay-caption">A <code>rooms-4</code> board: 128 by 128, four seats a quarter of the rows and half the columns apart.</p>

<!-- replay-visualiser: maps-rooms-4 — filled.
Asset: tutorials/preset-rooms-4.json, turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Numbers each board carries

Every board file records what its generator measured, under `generator.metrics`:
`routes` (square-disjoint routes between your home ground and the nearest enemy's,
counted up to 32), `enemy_walk` and `detour_pct` (that walk, and how much longer it
is than on open ground), `water_pm` (water per thousand squares) and
`food_per_seat`. `tinybrains maps export` writes the files; sort a curriculum by
these rather than by preset name.

## Train on every preset

The seed and engine together determine a match; preserve both when reproducing
one. A preset name alone cannot reproduce a match. Pairing spreads play across
the presets a season runs, so train and validate on every board size and seat
count, and review results by preset before concluding that a change improves the
model overall. A fixed-size graph needs an explicit padding or other compatible
representation for every size, with outputs mapped back to real coordinates.
