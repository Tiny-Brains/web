# Ants

Ants is a simultaneous-turn strategy game between colonies on a wrapping grid. You control every
ant in your colony through one model call each turn. A board seats from two players to eight, and
each season plays boards of its own.

## The idea

Grow a colony, find the opponent, and raze its hills while protecting yours. Razing an enemy hill
scores **+2**; losing a hill costs **−1**. Gathering food, killing ants and controlling territory
score nothing on their own.

Growth matters only for what it lets you do at the hills. A large army can defend and scout, and
you can still lose a match on an unguarded hill before that army reaches the opponent.

## What you command

Each living ant can move one square north, east, south or west, or stay where it is. All players
choose before any move resolves. Your model receives one [observation](../models/observation.md),
and your adapter returns an [action array](../models/actions.md) covering your ants in the same
order.

Ants that end their move on the same square die, friendly ants included. Survivors fight according
to how many enemies are near them, then can raze hills or gather food. Gathered food goes into a
shared hive, and the engine turns it into new ants on free hills on a later turn. Read
[A turn](ants/turn.md) before you design movement and combat.

## What you can see

Your living ants give you vision, and you see enemies, food and standing hills only inside it.
Water you have discovered stays in your observations. Your model gets no persistent memory channel
and no explored-land mask. [The world](ants/world.md) explains wrapping and fog.

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

<p class="tb-replay-caption">A real ladder match on <code>basic-small-3p</code>: three seats, one hill each, a 36 by 36 cave. Seat 0 has no ants left by turn 113 and seat 1 razes its hill on turn 128, so by turn 240 seat 1 leads on score, three to one, and on ants, seventeen to seven. On the last turn, 258, seat 1 razes seat 2's hill as well, and the match ends <code>rank_stabilized</code> with seat 1 on 5 and the other two level on 0. No seat was struck: once seat 0 had no ants, the platform stopped asking it for moves.</p>

<!-- replay-visualiser: ants-overview — filled.
Asset: tutorials/real-match.json, turn 240 of 258 — one colony gone, and the leader ahead on both ants and score.
A re-capture moves this: see tutorials/README.md. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->
