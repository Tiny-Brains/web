# Ants

Ants is a simultaneous-turn strategy game between colonies on a wrapping grid.
You control every ant in your colony through a single model invocation each turn.
A board seats from two players to eight, and each season plays boards of its own.

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

**Each season has its own boards**, and they are in no release: an admin uploads
them to the season, where they are public from the moment they arrive, and may add or
take one out of play while the season runs. Every one of them is inside the game's
limits — two to eight seats, 24 to 124 squares a side, at most 14,880 squares — and
uses the same movement, vision, combat and scoring rules. The release ships five
**basic boards**, one of each size, which span those limits and are what you test
against locally. [The maps](ants/maps.md) shows them, what every board guarantees and
where a season's boards are listed.

## Where the rules are exact

The following chapters describe the current Ants cartridge. Its source and rule
tests live in the Ants repository listed under [repositories](../platform/repositories.md).
Match records identify the engine used to play them; replay reconstruction must
use that engine version.


<div class="tb-replay" data-src="tutorials/real-match.json" data-turn="240"></div>

<p class="tb-replay-caption">A real ladder match on <code>basic-small-3p</code>: three seats, one hill each, a 36 by 36 cave. Seat 0 has no ants left by turn 113 and seat 1 razes its hill on turn 128, so by turn 240 seat 1 leads on score, three to one, and on ants, seventeen to seven. On the last turn, 258, seat 1 razes seat 2's hill as well, and the match ends <code>rank_stabilized</code> with seat 1 on 5 and the other two level on 0. No seat was struck &mdash; the emptied colony was simply not asked for moves once it had no ants.</p>

<!-- replay-visualiser: ants-overview — filled.
Asset: tutorials/real-match.json, turn 240 of 258 — one colony gone, and the leader ahead on both ants and score.
A re-capture moves this: see tutorials/README.md. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->
