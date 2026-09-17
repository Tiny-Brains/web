# Ants

Ants is a simultaneous-turn strategy game between colonies on a wrapping grid.
You control every ant in your colony through a single model invocation each turn.
Three of the current presets seat two players and one, `rooms-4`, seats four.

## The idea

Grow a colony, find the opponent, and raze its hills while protecting yours.
Razing an enemy hill scores **+2**; losing a hill costs **−1**. Gathering food,
killing ants, and controlling territory score nothing by themselves.

That makes growth a means to an end. A large army can defend and scout, but an
unguarded hill can decide a match before that army reaches the opponent.

## What you command

Each living ant may move one square north, east, south, or west, or stay still.
All players choose before any moves resolve. Your model receives one
[observation](../models/observation.md), and your adapter returns an
[action array](../models/actions.md) covering your ants in the same order.

Ants that finish movement on the same square die, including friendly ants.
Survivors fight according to nearby enemy pressure, then may raze hills or gather
food. Food enters a shared hive and becomes new ants on free hills on a later
turn. Read [A turn](ants/turn.md) before designing movement and combat behavior.

## What you can see

Vision comes from your living ants. You see enemies, food, and standing hills
only within that vision. Previously discovered water remains in observations,
but there is no persistent memory channel for your model and no explored-land
mask. The [world](ants/world.md) page explains wrapping and fog.

## How a match ends

A match can reach its turn limit, lose all but one colony, lose every ant, reach
a decided ranking, or trigger a stalemate cutoff. The highest hill score wins;
equal scores tie. A lone surviving colony also receives points for the enemy
hills still standing. [Ending and scoring](ants/scoring.md) covers these rules
and the platform's separate handling of forfeits.

## The maps

`open-2` is open ground on the smallest board, `maze-2` a tight maze of narrow
corridors, `cave-2` caverns with two hills a seat, and `rooms-4` a lattice of
walled rooms for four seats on the largest board. They use the same movement,
vision, combat, and scoring rules. Train and test across all of them:
[The maps](ants/maps.md) gives dimensions and what every board guarantees.

## Where the rules are exact

The following chapters describe the current Ants cartridge. Its source and rule
tests live in the Ants repository listed under [repositories](../platform/repositories.md).
Match records identify the engine used to play them; replay reconstruction must
use that engine version.


<div class="tb-replay" data-src="tutorials/real-match.json" data-turn="240"></div>

<p class="tb-replay-caption">A real ladder match on <code>open-2-03</code>, between two entries of the same weight class. Turn 240 is where the difference is plain: twenty-nine ants against fifteen, and a seat 1 ant eight columns from seat 0's hill, which seat 0 is guarding with an ant beside it. Seat 0 holds the hill for another 120 turns; seat 1 razes it on the last turn, so the match ends <code>rank_stabilized</code> after 361 turns at 3&ndash;0. Neither seat was struck.</p>

<!-- replay-visualiser: ants-overview — filled.
Asset: tutorials/real-match.json, turn 240 of 246 — a frame where the match reads as decided.
A re-capture moves this: see tutorials/README.md. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->
