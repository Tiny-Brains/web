# The world

The Ants world is a rectangular grid of land and water. Coordinates are
`[row, column]`, both starting at zero. The observation's `size` gives
`[rows, columns]`; do not assume a square board.

## The grid, and why it wraps

Both axes wrap. On a 64 × 96 board, moving north from `[0, 10]` reaches
`[63, 10]`, and moving east from `[20, 95]` reaches `[20, 0]`. A border is not a
wall, and a hill near it can be attacked from across the board boundary.

Ranges use the shorter wrapped displacement on each axis. With row difference
`dr` and column difference `dc`, use:

```text
dr = min(abs(r1 - r2), rows - abs(r1 - r2))
dc = min(abs(c1 - c2), cols - abs(c1 - c2))
distance_squared = dr * dr + dc * dc
```

This same geometry controls vision, fighting, and food collection.

Six steps are enough to show it: an ant ordered north off the top row arrives on the
bottom one, and west off the left column arrives on the right. Nothing stops it and
nothing announces it — the row or column simply changes ends.

<div class="tb-replay" data-src="tutorials/6-wrap.json" data-turn="6" data-zoom="6"></div>

<p class="tb-replay-caption">Six orders, three north then three west, and both edges are crossed: turn 1 puts the ant on the top row and turn 2 has it on the bottom; turn 4 puts it in the left column and turn 5 has it on the right. It ends in the far corner of the picture, three rows and three columns from the hill it started on — six steps from home, having walked six. There are no corners to defend and no edge to be pinned against.</p>

<!-- replay-visualiser: world-wrapping — filled.
Asset: tutorials/6-wrap.json, turn 6 (its last) — both axes wrap in one walk, which is the claim
this section makes. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Terrain and water

Water is impassable and permanent. A move into water leaves the ant where it was;
that ant can still collide with another ant arriving there. **Food refuses a move
the same way**: an ant cannot step onto a food square, so it gathers from beside
it. Land can carry a hill and an ant together, and new food is only ever placed on
empty land. Two ants cannot remain on one square after movement resolves.

The observation remembers water you have discovered. A zero in its water mask
means either land or an undiscovered square; it does not certify that a route is
clear. See [the observation format](../../models/observation.md) for the encoding.

## Hills

Hills are the only places new ants spawn. A surviving enemy ant razes a hill by
standing on it after combat. A razed hill is gone permanently. An ant on your own
hill blocks spawning there, even when food is available in your hive.

Losing all hills does not immediately eliminate a colony. Living ants continue
to move and attack, but cannot be replaced without a standing hill.

## Food

Food on or directly beside an ant can be gathered after spawning resolves. It
enters the colony's hive, a shared store rather than a map location. One unit of
stored food can create one ant on a free hill. Food placed near starting hills
helps colonies begin growing; new food is placed symmetrically as play proceeds.

## Vision and fog

A square is visible if its wrapped squared distance from any of your living ants
is at most **77**. Water does not block this radius. Enemies, food, and hills
outside it are absent from the current observation. Losing an ant can therefore
hide an area you could see a turn earlier.

The engine remembers discovered water for you. It does not retain out-of-sight
enemies, food, or hills in the observation. There is no turn number, score, hive
count, explicit visibility mask, or model state carried between calls.


> **The viewer cannot show this yet.** A replay frame carries the board as the *referee*
sees it — every ant, all the water — because that is what re-simulating an action stream
reconstructs. What a seat *knew* at a turn is a different thing, and `replay-decode` does
not answer it. Until it does, a replay here would show the opposite of the point.

<!-- replay-visualiser: world-fog — BLOCKED, and deliberately empty.
Needs a seat view: `replay-decode` answering "what did seat N see on turn T", which is
`observe` applied to a re-simulated state. Cheap to add (one optional argument, decoded
for the shown turn only) and an ABI change, so it is a decision rather than a task.
Do NOT fill this with a ground-truth replay: it would teach the reader the opposite.
-->

## Symmetry and boards

Every seat starts on the same board: seat `k`'s terrain, hills and turn-zero
food are seat 0's moved `k` times by the board's shift, which the map file names
as `symmetry`. Play can break that symmetry immediately because the colonies
choose different moves. Symmetric starts do not imply identical outcomes.

The [board](maps.md) determines dimensions, terrain, hills a seat and seat count.
Boards seat from two players to eight, a season's boards are its own, and two of one
size can seat different counts — so read the seat count from the board, never infer it
from its size.
