# The maps

**Each season plays boards of its own.** No release or repository carries them: an admin uploads
them to the season one file at a time, and each board is public once its upload succeeds. While the
season runs, an admin can take a board out of play or put one back, but never deletes one, because
the matches played on a board name it. Pairing picks the board for each match from the season's
boards in play and assigns the seed with it, so you never choose your board.

`GET /v1/games/ants/seasons/{slug}/maps` lists all of a season's boards, in play or not, with their
seats and size. Add `?boards=true` to get the board files too (the same JSON a replay carries), or
read one board at `GET .../maps/{map_id}`. The season's page on the site draws them.

## The limits every board is inside

A season's board can be any board inside the game's limits. The cartridge declares them as
`limits.boards` in its manifest:

| | From | To |
|---|---:|---:|
| Seats | 2 | 8 |
| Each side | 24 | 124 |
| Squares | — | 14,880 |

The platform refuses an upload outside any of the three before it stores it. **The limits are also
admission's promise to you.** An admin can add a board to a season next week, so admission cannot
test your model on the boards a season has today. Admission tests it across the limits: it probes
every entry against the [reference set](../../models/testing.md#reference-observations), drawn on
the five basic boards below, which reach from two seats to eight and from the smallest side to the
largest. A model admitted today can play any board a season adds later.

Design for the limits. Set your manifest's `probe_dims` to the largest board the game allows
(14,880 squares, the 120 × 124 basic board) and measure your adapter's cost there
([The budget](../../models/adapters/budget.md)).

## The basic boards

Each ants release carries five boards, one of each size, and ships no others. `tinybrains` plays
them on your machine when a match file names a board by id, `tinybrains maps` lists them,
`tinybrains maps export` writes them out, and the ants-starter's match files play on them.

| Board | Seats | Board | Hills a seat | Water | Food a seat at turn zero | Design |
|---|---:|---:|---:|---:|---:|---|
| `basic-tiny-2p` | 2 | 24 × 24 | 1 | 18% | 8 · contested | colonnade, 8-way |
| `basic-small-3p` | 3 | 36 × 36 | 1 | 40% | 11 · uniform | grotto, two diagonal mirrors |
| `basic-medium-4p` | 4 | 48 × 64 | 2 | 19% | 18 · uniform | braid, two mirrors |
| `basic-large-6p` | 6 | 80 × 96 | 1 | 20% | 18 · home | halls, two mirrors |
| `basic-xlarge-8p` | 8 | 120 × 124 | 2 | 30% | 24 · uniform | grotto, half-turn |

The Water column is each shipped board's measured share of water. After turn zero, food arrives at
the match's hidden rate ([the world](world.md)). Three of the five are rectangles, so never assume
`rows == columns` in an adapter.

### basic-tiny-2p

Open ground with short blocks of water, and dotted colonnades that shelter each hill and the food
beside it. At 24 by 24 it has the smallest side a board may have, with two seats, one hill a seat
and 18% water. 12 separate routes join a hill to the enemy's, 24 steps away. Each seat has 8 food
at turn zero: a few beside its hill, the rest where the two seats contest it.

<div class="tb-replay" data-src="tutorials/board-basic-tiny-2p.json" data-view="map"></div>

<p class="tb-replay-caption">The <code>basic-tiny-2p</code> board at turn zero: colonnade, 8-way, shift (12, 12).</p>

<!-- replay-visualiser: maps-basic-tiny-2p — filled.
Asset: tutorials/board-basic-tiny-2p.json (basic-tiny-2p), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

### basic-small-3p

Rock masses fill the ground between the three territories. Each hill sits in an open grotto, with
passages between the grottos. The board is 36 by 36 with 40% water, three seats and one hill a
seat, and 8 separate routes join a hill to the nearest enemy one, 24 steps away. Each seat has 11
food at turn zero: a few beside its hill, the rest anywhere on land.

<div class="tb-replay" data-src="tutorials/board-basic-small-3p.json" data-view="map"></div>

<p class="tb-replay-caption">The <code>basic-small-3p</code> board at turn zero: grotto, two diagonal mirrors, shift (12, 12).</p>

<!-- replay-visualiser: maps-basic-small-3p — filled.
Asset: tutorials/board-basic-small-3p.json (basic-small-3p), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

### basic-medium-4p

Long straight walls run in bands broken by regular gaps: a braided maze with many ways through and
no dead ends. The board is 48 by 64 with 19% water and four seats. Each seat has two hills, one
above the other and half the board apart. 18 separate routes join a hill to the nearest enemy one,
20 steps away. Each seat has 18 food at turn zero: a few beside its hills, the rest anywhere on
land.

<div class="tb-replay" data-src="tutorials/board-basic-medium-4p.json" data-view="map"></div>

<p class="tb-replay-caption">The <code>basic-medium-4p</code> board at turn zero: braid, two mirrors, shift (24, 16).</p>

<!-- replay-visualiser: maps-basic-medium-4p — filled.
Asset: tutorials/board-basic-medium-4p.json (basic-medium-4p), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

### basic-large-6p

A lattice of pillars and crosses covers the ground, and each hill stands in a hall walled above and
below and open at both ends. The board is 80 by 96 with 20% water, six seats and one hill a seat.
12 separate routes join a hill to the nearest enemy one, 32 steps away. Each seat has 18 food at
turn zero: a few beside its hill, the rest on ground that seat reaches first.

<div class="tb-replay" data-src="tutorials/board-basic-large-6p.json" data-view="map"></div>

<p class="tb-replay-caption">The <code>basic-large-6p</code> board at turn zero: halls, two mirrors, shift (40, 16).</p>

<!-- replay-visualiser: maps-basic-large-6p — filled.
Asset: tutorials/board-basic-large-6p.json (basic-large-6p), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

### basic-xlarge-8p

Long ridges of rock run on the diagonal between the territories, with open ground round each hill.
The board has the largest side the game allows: 120 by 124, with 30% water, eight seats and two
hills a seat. 15 separate routes join a hill to the nearest enemy one, 46 steps away. Each seat has
24 food at turn zero: a few beside its hills, the rest anywhere on land. For an adapter, eight seats
on 14,880 squares is the worst case on two counts: it sees every owner number from 1 to 7, and it
has the most squares to encode.

<div class="tb-replay" data-src="tutorials/board-basic-xlarge-8p.json" data-view="map"></div>

<p class="tb-replay-caption">The <code>basic-xlarge-8p</code> board at turn zero: grotto, half-turn, shift (15, 93).</p>

<!-- replay-visualiser: maps-basic-xlarge-8p — filled.
Asset: tutorials/board-basic-xlarge-8p.json (basic-xlarge-8p), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## What every board guarantees

Every board keeps these properties, whatever its terrain. The cartridge refuses a board that breaks
any of the first three, including one you write yourself, both at a season's upload and again
before every match. Boards made the way the next section describes keep the last three as well.

- **Every seat has the same board.** Seat `k`'s board is seat 0's moved by `k` times the board's
  *shift*, which the map file names as `symmetry: {dr, dc}`. Water, hills and turn-zero food all
  follow the shift to the square.
- **An ant can walk from every square of land to every other.** Ants move in four directions, so
  two land squares that touch only at a corner are no path, and the board has no sealed pockets for
  food to fall into.
- **Every hill has a way off it**, and every seat has the same number of hills.
- **Every hill has room**: at least two open neighbours, in a clearing that reaches at least two
  squares in every direction.
- **No enemy hill is in view at turn zero**: every other seat's hills lie more than squared
  distance 77 away.
- **A seat's hills stand apart.** Each has its own part of the territory and a base of its own. The
  shortest walk between two of them is at least ten squares, and at least two fifths of the walk to
  the nearest enemy hill.

## How a board is made

`mapgen`, a tool in the Ants repository, draws each board as a **design**, and a person picks it. A
designer makes a season's boards and the basic ones the same way; the two differ only in where they
go.

**Drawn under two symmetries.** The first is fairness: seat `k`'s board is seat 0's moved by the
board's shift `k` times, and the cartridge checks it. The second only shapes how the board looks: a
mirror or a turn about the centre of each seat's territory, which the Design column names. Two
seats take the full eight-way symmetry of a square, and five a four-way spin. Three, six and seven
seats take mirrors or a half-turn, because their centres cannot sit on a square grid. `mapgen`
places shapes on that symmetry by territory: rings, keeps, pillars and halls round each hill,
rivers along the borders, and lakes and outposts where three territories meet. The same idea
stands in the same kind of place on every board.

**Chosen from hundreds.** A designer names a slot (a size, a terrain of open, cave, maze or rooms, a
seat count and a hill count), and `mapgen explore` draws hundreds of candidates for it. It keeps
the playable ones: water within the terrain's range, more than one route between neighbours, few
dead ends, hills spread. The designer plays the promising ones with every seat under the same
policy (`mapgen playtest`) and throws out any board whose seats grow at different rates.
`mapgen adopt` writes the pick down as a recipe, and the recipe is the board: no seed regenerates
it, so an improved sampler never redraws a board somebody chose.

**Named by what it is**, by the designer's convention: `<size>-<terrain>-<N>p-<H>h`. A large maze
board for four seats with two hills a seat would be `large-maze-4p-2h`. The designer and the season
own the name, and the platform promises nothing by it: the file says what a board is.

| Size | Longest side | Shortest side |
|---|---|---|
| tiny | 24–32 | — |
| small | 33–48 | at least 32 |
| medium | 49–64 | at least 48 |
| large | 65–96 | at least 64 |
| xlarge | 97–127 | at least 96 |

Seat count depends on size. A board may not show you an enemy hill at turn zero, so a tiny board
seats at most four, and more seats need a larger board. The game's limit caps a season's board at
124 a side, whatever the size class allows.

## Food

Each board has two or three food within two to six steps of each hill (two a hill when a seat has
three hills or more), and places the rest by one of three rules, which the table names:

| Food | The rest goes |
|---|---|
| home | where your walk to it is shorter than any opponent's by more than 6 steps |
| contested | where your walk to it and the nearest opponent's are within 6 steps of each other |
| uniform | anywhere on land |

On some boards, a quarter of it goes first to the middles of the borders and the corners where
territories meet. The amount grows with the ground a seat owns and with its hills: from 8 a seat on
`basic-tiny-2p` to 24 on `basic-xlarge-8p`.

A seat opens with one ant and one point for each hill it has, so four hills mean four ants, four
points and four homes to defend. A colony that loses one hill keeps spawning from the others.

## The shift, and who your neighbours are

A board of `p` seats has a shift that brings you home in `p` steps. On two seats it puts the other
seat half the rows away, half the columns away, or both; on more, the seats sit at equal spacing on
a lattice. The distance to the nearest enemy hill varies more than the board size suggests: from 20
steps on `basic-medium-4p` to 46 on `basic-xlarge-8p`.

Observations [number opponents relative to you](../../models/observation.md#ownership-labels), and
the numbering follows the shift: **opponent `j` is the seat `j` shifts along from you**. Opponent 1
is always at your hills plus the shift, so each number means the same neighbour whichever seat you
sit in. Opponent `j` and opponent `p − j` sit the same distance away in opposite directions, so on
three seats both opponents border you. Opponent numbers run from 1 to 7.

## Walls do not hide anything

Vision and attacks both reach through water. A wall blocks walking and leaves sight open, and it
blocks a fight only when it is at least two squares thick: two ants on either side of a one-square
wall stand two apart, inside the attack radius. Most walls are one or two squares thick. Some room
and fortress walls are three, and cave rock has no set thickness.

## Numbers each board carries

`mapgen` records what it measured on each board it makes, under `generator.metrics`, from seat 0's
first hill (the shift makes every seat's the same): `routes` (square-disjoint routes from the ground
around that hill to the ground around the nearest enemy hill, counted up to 32), `enemy_walk` and
`open_walk` (the walk to that enemy hill, and the same walk with no water), `detour_pct` (the first
as a percentage of the second), `home_view_land` (the land its ant sees at turn zero),
`dead_end_pm` (land squares with at most one land neighbour, per thousand), `water_pm` (water per
thousand squares), `water_runs` (run-length pairs in the board's water mask) and `food_per_seat`.
`generator` also names the recipe `mapgen` drew the board from, its `family` and its decorative
`symmetry`. The cartridge ignores all of these; a season's uploaded board carries them only because
`mapgen` wrote them.

## Train across the limits

The seed and the engine together determine a match, and the board is part of the match. A replay
carries its board, so keep the replay to reproduce a match; the board's name alone does not
reproduce it. The matchmaker spreads play across the season's boards in play **that the pool can
seat**. Each seat of a match is a different competitor, baselines included, so an eight-seat board
waits until eight competitors have versions to pair.

Train and validate on every seat count from two to eight and every size up to 124 a side. The basic
boards span that range, a season's boards are public once uploaded, and `tinybrains maps check`
tells you whether a board you drew is one a season could play. Group your results by what boards
share (a seat count, a size, a terrain) before you conclude that a change improves the model
overall. A fixed-size graph needs explicit padding, or another representation that fits every
size, with its outputs mapped back to real coordinates.
