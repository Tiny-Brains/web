# Ants

Ants is a simultaneous-turn strategy game between colonies on a wrapping grid.
You control every ant in your colony through a single model invocation each turn.
The current `standard`, `maze`, and `cell` presets each have two players.

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

## The three maps

`standard` is the smallest board, `maze` has denser water and narrower routes,
and `cell` is the largest board with larger water formations. They use the same
movement, vision, combat, and scoring rules. Train and test across all three:
[The maps](ants/maps.md) gives dimensions and explains generation.

## Where the rules are exact

The following chapters describe the current Ants cartridge. Its source and rule
tests live in the Ants repository listed under [repositories](../platform/repositories.md).
Match records identify the engine used to play them; replay reconstruction must
use that engine version.


<div class="tb-replay" data-src="tutorials/real-match.json" data-turn="240"></div>

<p class="tb-replay-caption">A real ladder match on a <code>standard</code> board, between two entries of the same weight class. Turn 240 is where the difference is plain: fifty ants against the one seat 0 never grew past, one of them three squares from seat 0's hill while seat 0's own ant is twenty-three rows away from it. Seat 1 razes that hill on the last turn, so the match ends <code>rank_stabilized</code> after 246 turns at 3&ndash;0. Neither seat was struck.</p>

<!-- replay-visualiser: ants-overview — filled.
Asset: tutorials/real-match.json, turn 240 of 246 — a frame where the match reads as decided.
A re-capture moves this: see tutorials/README.md. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->
