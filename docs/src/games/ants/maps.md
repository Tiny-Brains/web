# The maps

**Each season plays boards of its own.** They are not in any release and not in any
repository: an admin uploads them to the season, one file at a time, and they are
public from the moment the upload succeeds. An admin can take a board out of play, or
put one back, at any time while the season runs, but never deletes one — the matches
played on a board name it. Pairing chooses which board a match is played on, from the
season's boards in play, and assigns the seed with it, so you never choose your board.

`GET /v1/games/ants/seasons/{slug}/maps` lists a season's boards: every one it has, in
play or not, with its seats and size. Add `?boards=true` for the board files themselves,
the same JSON a replay carries, or read one at `GET .../maps/{map_id}`. The season's page
on the site draws them.

## The limits every board is inside

A season's board may be anything inside the game's limits, and nothing outside them.
The cartridge declares them as `limits.boards` in its manifest:

| | From | To |
|---|---:|---:|
| Seats | 2 | 8 |
| Each side | 24 | 124 |
| Squares | — | 14,880 |

An upload outside any of the three is refused before it is stored. **They are also the
promise admission makes you.** The boards are chosen while a season runs, and it can
add one next week, so admission cannot test your model on the boards a season has
today. It tests it across the limits instead: the [reference set](../../models/testing.md#reference-observations)
it probes every entry against is drawn on the five basic boards below, which reach
from two seats to eight and from the smallest side to the largest. A model admitted
today can play any board a season adds later.

Design for the limits, not for the boards a season happens to have. Your manifest's
`probe_dims` should be the largest board the game allows — 14,880 squares, which the
120 × 124 basic board is — and your adapter's cost should be measured there
([The budget](../../models/adapters/budget.md)).

## The basic boards

The release carries five boards, one of each size, and they are the only boards any
release ships. They are what `tinybrains` plays locally when a match file names a
board by id, what `tinybrains maps` lists and `tinybrains maps export` writes out, and
what the ants-starter's match files are played on.

| Board | Seats | Board | Hills a seat | Water | Food a seat at turn zero | Design |
|---|---:|---:|---:|---:|---:|---|
| `basic-tiny-2p` | 2 | 24 × 24 | 1 | 18% | 8 · contested | colonnade, 8-way |
| `basic-small-3p` | 3 | 36 × 36 | 1 | 40% | 11 · uniform | grotto, two diagonal mirrors |
| `basic-medium-4p` | 4 | 48 × 64 | 2 | 19% | 18 · uniform | braid, two mirrors |
| `basic-large-6p` | 6 | 80 × 96 | 1 | 20% | 18 · home | halls, two mirrors |
| `basic-xlarge-8p` | 8 | 120 × 124 | 2 | 30% | 24 · uniform | grotto, half-turn |

Water is measured on the boards that ship, not a generator input. Food after turn
zero arrives at the match's hidden rate; see [the world](world.md). Three of the five
are rectangles, so an adapter should never assume `rows == columns`.

### basic-tiny-2p

Open ground, with short blocks of water and dotted colonnades framing each hill and the food
beside it: shelter, not a maze. 24 by 24, the smallest side a board may have, two seats and
one hill a seat, 18% water; 12 separate routes join a hill to the enemy's, 24 steps away. 8
food a seat at turn zero, the rest placed where the two seats contest it.

<div class="tb-replay" data-src="tutorials/board-basic-tiny-2p.json" data-view="map"></div>

<p class="tb-replay-caption">The <code>basic-tiny-2p</code> board at turn zero: colonnade, 8-way, shift (12, 12).</p>

<!-- replay-visualiser: maps-basic-tiny-2p — filled.
Asset: tutorials/board-basic-tiny-2p.json (basic-tiny-2p), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

### basic-small-3p

Rock masses fill the ground between the three territories, leaving open grottos round
each hill and passages between them. 36 by 36, 40% water, three seats and one hill a
seat; 8 separate routes join a hill to the nearest enemy one, 24 steps away. 11 food a
seat at turn zero, the rest placed anywhere on land.

<div class="tb-replay" data-src="tutorials/board-basic-small-3p.json" data-view="map"></div>

<p class="tb-replay-caption">The <code>basic-small-3p</code> board at turn zero: grotto, two diagonal mirrors, shift (12, 12).</p>

<!-- replay-visualiser: maps-basic-small-3p — filled.
Asset: tutorials/board-basic-small-3p.json (basic-small-3p), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

### basic-medium-4p

Long straight walls in bands, broken by regular gaps: a braided maze with many ways through
and no dead ends. 48 by 64, 19% water, four seats and two hills a seat — one above the
other, half the board apart; 18 separate routes join a hill to the nearest enemy one, 20
steps away. 18 food a seat at turn zero, the rest placed anywhere on land.

<div class="tb-replay" data-src="tutorials/board-basic-medium-4p.json" data-view="map"></div>

<p class="tb-replay-caption">The <code>basic-medium-4p</code> board at turn zero: braid, two mirrors, shift (24, 16).</p>

<!-- replay-visualiser: maps-basic-medium-4p — filled.
Asset: tutorials/board-basic-medium-4p.json (basic-medium-4p), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

### basic-large-6p

A lattice of pillars and crosses, and every hill in a hall walled above and below and open
at its ends. 80 by 96, 20% water, six seats and one hill a seat; 12 separate routes join a
hill to the nearest enemy one, 32 steps away. 18 food a seat at turn zero, the rest placed
on ground a seat reaches first.

<div class="tb-replay" data-src="tutorials/board-basic-large-6p.json" data-view="map"></div>

<p class="tb-replay-caption">The <code>basic-large-6p</code> board at turn zero: halls, two mirrors, shift (40, 16).</p>

<!-- replay-visualiser: maps-basic-large-6p — filled.
Asset: tutorials/board-basic-large-6p.json (basic-large-6p), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

### basic-xlarge-8p

Long ridges of rock run diagonally between the territories, with open ground round every
hill — and the largest side the game allows: 120 by 124, 30% water, eight seats and two
hills a seat. 15 separate routes join a hill to the nearest enemy one, 46 steps away. 24
food a seat at turn zero, the rest placed anywhere on land. Eight seats on 14,880 squares is
the adapter's worst case twice over — every owner number from 1 to 7, and the most squares
to encode.

<div class="tb-replay" data-src="tutorials/board-basic-xlarge-8p.json" data-view="map"></div>

<p class="tb-replay-caption">The <code>basic-xlarge-8p</code> board at turn zero: grotto, half-turn, shift (15, 93).</p>

<!-- replay-visualiser: maps-basic-xlarge-8p — filled.
Asset: tutorials/board-basic-xlarge-8p.json (basic-xlarge-8p), turn 0. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## What every board guarantees

However different the terrain, every board keeps these. The cartridge refuses a board,
including one you write yourself, that breaks the first three — at a season's upload,
and again before every match; the boards made the way the next section describes also
keep the last three.

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
- **A seat's hills stand apart.** Each stands in its own part of the territory, with
  a base of its own; the shortest walk between two of them is at least ten squares
  and at least two fifths of the walk to the nearest enemy hill. Two hills in one
  room would be one hill with two doors.

## How a board is made

A board is a **design**, drawn by `mapgen` — a tool in the Ants repository — and picked
by a person. A season's boards and the basic ones are made the same way; only where
they go differs.

**Drawn under two symmetries.** The first is fairness: seat `k`'s board is seat 0's
moved by the board's shift `k` times, which the cartridge checks. The second is only
how the board looks: a mirror or a turn about the centre of every seat's territory,
which the Design column names. Two seats take the full eight-way symmetry of a square,
five a four-way spin, and three, six and seven — whose centres cannot sit on a square
grid — take mirrors or a half-turn. Onto that symmetry go shapes put where the
territories say they belong — rings, keeps, pillars and halls round each hill, rivers
along the borders, lakes and outposts where three territories meet — so the same idea
stands in the same kind of place everywhere.

**Chosen from hundreds.** A designer names a slot — a size, a terrain (open, cave, maze
or rooms), a seat count and a hill count — and `mapgen explore` draws hundreds of
candidates for it, keeping only the ones that are playable: water within the terrain's
range, more than one route between neighbours, few dead ends, hills spread. The designer
plays the promising ones with every seat under the same policy (`mapgen playtest`), and
a board whose seats grow unevenly is thrown out. `mapgen adopt` writes the pick down as
a recipe, and the recipe — not a seed — is what the board is, so an improved sampler
never redraws a board somebody chose.

**Named by what it is**, by the designer's convention: `<size>-<terrain>-<N>p-<H>h`,
so a large maze board for four seats with two hills a seat would be
`large-maze-4p-2h`. A name is the designer's and the season's, not a contract: what a
board is, is in the file.

| Size | Longest side | Shortest side |
|---|---|---|
| tiny | 24–32 | — |
| small | 33–48 | at least 32 |
| medium | 49–64 | at least 48 |
| large | 65–96 | at least 64 |
| xlarge | 97–127 | at least 96 |

Seat count and size are not independent, and cannot be: a board may not show you an
enemy hill at turn zero, so a tiny board seats at most four and the wide seat counts
live on the larger boards. The largest side a season's board may have is the game's
limit, 124, not the size class's.

## Food

Every board puts two or three food a short walk from each hill — between two and six
steps, and two when a seat has three hills or more — and places the rest by one of
three rules, which the table names:

| Food | The rest goes |
|---|---|
| home | where your walk to it is shorter than any opponent's by more than 6 steps |
| contested | where your walk to it and the nearest opponent's are within 6 steps of each other |
| uniform | anywhere on land |

On some boards a quarter of it goes on the middles of the borders and the corners where
territories meet first. How much there is grows with the ground a seat owns and its
hills: from 8 a seat on `basic-tiny-2p` to 24 on `basic-xlarge-8p`.

A seat opens with one ant and one point for every hill it has, so four hills is four
ants and four points — and four homes to defend. A colony can lose one hill and keep
spawning from the others.

## The shift, and who your neighbours are

A board of `p` seats has a shift that brings you home in `p` steps. On two seats it puts
the other seat half the rows away, half the columns away, or both; on more, the seats
lie on a lattice, evenly spaced. How far the nearest enemy hill is varies more than the
board size suggests: from 20 steps on `basic-medium-4p` to 46 on `basic-xlarge-8p`.

Observations [number opponents relative to you](../../models/observation.md#ownership-labels),
and the numbering follows the shift: **opponent `j` is the seat `j` shifts along from
you**, so opponent 1 is always at your hills plus the shift, and the numbering means the
same neighbour whichever seat you sit in. Opponent `j` and opponent `p − j` are the same
distance away in opposite directions, so on three seats both opponents border you.
Opponents are numbered from 1 up to 7.

## Walls do not hide anything

Vision and attacks both reach through water. A wall stops ants walking, never seeing,
and it stops fights only when it is at least two squares thick: two ants either side of
a one-square wall are two apart, inside the attack radius. Most walls are one or two
squares thick; some room and fortress walls are three, and cave rock is as thick as it
happens to be.

## Numbers each board carries

Every board `mapgen` makes records what it measured, under `generator.metrics`, from seat
0's first hill — which the shift makes the same for every seat's: `routes`
(square-disjoint routes from the ground around that hill to the ground around the nearest
enemy hill, counted up to 32), `enemy_walk` and `open_walk` (the walk to that enemy hill,
and the same walk with no water), `detour_pct` (the first as a percentage of the second),
`home_view_land` (the land its ant sees at turn zero), `dead_end_pm` (land squares with at
most one land neighbour, per thousand), `water_pm` (water per thousand squares),
`water_runs` (run-length pairs in the board's water mask) and `food_per_seat`.
`generator` also names the recipe the board is drawn from, its `family` and its
decorative `symmetry`. Nothing plays by these: the cartridge ignores them, and a season's
uploaded board carries them only because the tool that drew it wrote them.

## Train across the limits

The seed and engine together determine a match, and the board is part of the match: a
replay carries its board, so preserve the replay, not a board name, when reproducing one.
Pairing spreads play across the season's boards in play **that its pool can seat**: every
seat of a match is a different competitor, baselines included, so an eight-seat board
waits until eight have versions to pair.

Train and validate on every seat count from two to eight and every size up to 124 a side:
the basic boards span them, a season's boards are public once uploaded, and
`tinybrains maps check` tells you whether a board of your own drawing is one a season
could play. Review results by what boards share — a seat count, a size, a terrain —
before concluding that a change improves the model overall. A fixed-size graph needs an
explicit padding or other compatible representation for every size, with outputs mapped
back to real coordinates.
