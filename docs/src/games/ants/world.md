# The world

The Ants world is a rectangular grid of land and water. Coordinates are `[row, column]`, both
starting at zero. The observation's `size` gives `[rows, columns]`; do not assume a square board.

## The grid, and why it wraps

Both axes wrap. On a 64 × 96 board, a move north from `[0, 10]` reaches `[63, 10]`, and a move east
from `[20, 95]` reaches `[20, 0]`. Borders block nothing: an enemy can attack a hill near one from
across the board boundary.

Ranges use the shorter wrapped displacement on each axis. With row difference `dr` and column
difference `dc`, use:

```text
dr = min(abs(r1 - r2), rows - abs(r1 - r2))
dc = min(abs(c1 - c2), cols - abs(c1 - c2))
distance_squared = dr * dr + dc * dc
```

Vision, fighting and food collection all use this geometry.

Six steps show it. An ant ordered north off the top row arrives on the bottom one, and an ant
ordered west off the left column arrives on the right. Nothing stops the ant or marks the crossing;
its row or column jumps to the other end.

<div class="tb-replay" data-src="tutorials/6-wrap.json" data-turn="6" data-zoom="6"></div>

<p class="tb-replay-caption">Six orders, three north then three west, cross both edges: turn 1 puts the ant on the top row and turn 2 on the bottom; turn 4 puts it in the left column and turn 5 on the right. It ends in the far corner of the picture, three rows and three columns from the hill it started on, six steps from home after walking six. The board has no corner to defend and no edge an enemy can pin you against.</p>

<!-- replay-visualiser: world-wrapping — filled.
Asset: tutorials/6-wrap.json, turn 6 (its last) — both axes wrap in one walk, which is the claim
this section makes. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Terrain and water

Water is impassable and permanent. A move into water leaves the ant where it was, and that ant can
still collide with another ant arriving on its square. **Food refuses a move the same way**: an ant
cannot step onto a food square, so it gathers from beside it. A land square can hold a hill and an
ant together, and the engine places new food on empty land only. No two ants remain on one square
after movement resolves.

Your observation keeps the water you have discovered. A zero in its water mask means land or an
undiscovered square, so a route of zeros can still run into water.
[The observation format](../../models/observation.md) gives the encoding.

## Hills

New ants spawn on hills and nowhere else. An enemy ant standing on a hill after combat razes it,
and a razed hill is gone for good. An ant on your own hill blocks spawning there, even with food in
your hive.

A colony that loses all its hills stays in the match while its ants live. They keep moving and
attacking, and without a standing hill the colony cannot replace them.

## Food

An ant can gather food on its own square or on one of the four squares beside it, after spawning
resolves. The food goes into the colony's hive, a shared store with no place on the map. One unit
of stored food can create one ant on a free hill. Each board puts food near the starting hills so
colonies can start growing, and the engine keeps new food symmetric across seats as play goes on.

## Vision and fog

You see a square if its wrapped squared distance from any of your living ants is at most **77**.
Water does not block vision. Enemies, food and hills outside that radius are missing from the
current observation, so losing an ant can hide an area you saw a turn earlier.

The engine remembers discovered water for you and nothing else out of sight: enemies, food and
hills drop out of the observation once you lose sight of them. The observation carries no turn
number, score, hive count or explicit visibility mask, and no model state carries over between
calls.


> **The viewer cannot show this yet.** A replay frame carries the board as the *referee*
sees it (every ant, all the water), because re-simulating an action stream rebuilds that view.
`replay-decode` cannot yet say what a seat *knew* on a given turn, and until it can, a replay here
would teach you the opposite of this section.

<!-- replay-visualiser: world-fog — BLOCKED, and deliberately empty.
Needs a seat view: `replay-decode` answering "what did seat N see on turn T", which is
`observe` applied to a re-simulated state. Cheap to add (one optional argument, decoded
for the shown turn only) and an ABI change, so it is a decision rather than a task.
Do NOT fill this with a ground-truth replay: it would teach the reader the opposite.
-->

## Symmetry and boards

Every seat starts on the same board: seat `k`'s terrain, hills and turn-zero food are seat 0's,
moved `k` times by the board's shift, which the map file names `symmetry`. The colonies choose
different moves, so play can break that symmetry from the first turn.

The [board](maps.md) sets the dimensions, the terrain, the hills a seat and the seat count. Boards
seat from two players to eight, a season's boards are its own, and two boards of one size can seat
different counts, so read the seat count from the board and never infer it from the size.
