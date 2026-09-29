# Ants

Ants is a simultaneous-turn strategy game between colonies on a wrapping grid. You control every
ant in your colony through one model call each turn. A board seats from two players to eight, and
each season plays boards of its own.

## The idea

Grow a colony, find the opponent, and raze its hills while protecting yours. Razing an enemy hill
scores **+2**; losing a hill costs **−1**. Gathering food, killing ants and controlling territory
score nothing on their own.

Growth matters for what it lets you do at the hills. A large army can defend and scout, and you
can still lose a match on an unguarded hill before that army reaches the opponent.

## What you command

Each living ant can move one square north, east, south or west, or stay where it is. All players
choose before any move resolves. Your adapters turn each [observation](../models/observation.md)
into your graph's inputs, and the referee reads your graph's policy head to build the
[action](../models/actions.md): one order per ant, in the observation's order.

Ants that end their move on the same square die, friendly ants included. Survivors fight according
to how many enemies are near them, then can raze hills or gather food. Gathered food goes into a
shared hive, and the engine turns it into new ants on free hills on a later turn. Read
[A turn](ants/turn.md) before you design movement and combat.

## What you can see

Your living ants give you vision, and you see enemies, food and standing hills only inside it.
Water you have discovered stays in your observations, and there is no explored-land mask. Anything
else your model wants to remember goes in its [memory](../models/memory.md), when the season's class
allows one. [The world](ants/world.md) explains wrapping and fog.

## How a match ends

A match ends at its turn limit, when one colony or none has ants left, when the ranking is
decided, or at a stalemate cutoff. The highest hill score wins, and equal scores tie. A colony left
as the lone survivor also scores the enemy hills still standing.
[Ending and scoring](ants/scoring.md) covers these rules and forfeits, which the platform handles
apart from the game score.

## The maps

**Each season has its own boards**, and no release carries them. An admin uploads them to the
season, where they are public as soon as they arrive, and can put a board into play or take one out
while the season runs. Every board fits the game's limits (two to eight seats, 24 to 124 squares a
side, at most 14,880 squares) and uses the same movement, vision, combat and scoring rules. The
release ships five **basic boards**, one of each size, which span those limits; you test against
them on your machine. [The maps](ants/maps.md) shows them, lists what every board guarantees, and
says where to find a season's boards.

## Where the rules are exact

The chapters that follow describe the current Ants cartridge. Its source and rule tests are in the
Ants repository listed under [repositories](../platform/repositories.md). Each match record names
the engine that played it, and the viewer has to reconstruct a replay with that engine version.


<div class="tb-replay" data-src="tutorials/real-match.json" data-turn="240"></div>

<p class="tb-replay-caption">A real ladder match on <code>small-basic-3p-1h</code>, the release's basic small three-player board: three seats, one hill each, 36 by 36. Seat 2 loses its last ant on turn 20, and seat 1 razes its hill on turn 48 to lead on score, three to one. Seat 0 grows the larger colony instead, and by turn 240 it holds fourteen ants to seat 1's six. On the last turn, 375, seat 0 razes seat 1's hill and takes the match three to two, <code>rank_stabilized</code>. No seat was struck: once seat 2 had no ants, the platform stopped asking it for moves.</p>

<!-- replay-visualiser: ants-overview — filled.
Asset: tutorials/real-match.json, turn 240 of 375: one colony gone since turn 20, seat 1 ahead on score and seat 0 ahead on ants.
A re-capture moves this: see tutorials/README.md. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->
