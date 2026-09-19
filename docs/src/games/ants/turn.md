# A turn

Every player chooses actions from its own observation before the turn resolves.
You cannot react to the opponent's move until the following observation.

## The six steps, in order

| Step | Resolution | Consequence |
|---|---|---|
| 1. Move | Apply moves, then remove collisions | Friendly ants can kill each other |
| 2. Battle | Evaluate combat among survivors | Reaching a hill is not enough if the ant dies |
| 3. Raze | Surviving enemies destroy occupied hills | A destroyed hill cannot spawn |
| 4. Spawn | Stored food creates ants on free hills | An occupied hill blocks growth |
| 5. Gather | Nearby food enters the hive | This food cannot spawn until a later turn |
| 6. New food | Place fresh food | Freshly placed food is available on later turns |

After these steps, the engine advances the turn count and checks
[ending conditions](scoring.md).

## Moving and collisions

An ant moves one square north, east, south, or west, or stays. Moving into water
**or onto food** is treated as staying: both refuse the destination and leave the
ant where it was. Missing orders also leave ants still. Movement wraps at both
edges; see [The world](world.md).

All ants use their final destinations for collisions. If two or more arrive on
one square, **all die**, regardless of owner. Moving onto a friendly ant that
stays is a collision. Swapping two adjacent ants does not itself collide because
their destinations differ; combat still follows at their new positions.

**In practice a collision is always your own ants.** Two enemies that could arrive
on one square were at most two squares apart the turn before — squared distance 4 at
the furthest — so they were already in each other's attack range, and two enemies in
range can never both survive a battle: each would need strictly higher focus than
the other.
The exception is an ant that appeared after that battle, because spawning runs later
in the turn than the fighting.

Which leaves the order array. It is positional, in `mine` order — row-major by
square, not the order your ants appeared in — so entry 0 is the ant in your topmost
occupied row, leftmost of any tie, and it is whichever ant that happens to be this
turn.

<div class="tb-replay" data-src="tutorials/7-collide.json" data-turn="3" data-zoom="6"></div>

<p class="tb-replay-caption">Red gathers the food below its hill, steps east, and a new ant appears
on the hill behind it — so its two ants sit side by side and the ant on the hill is entry 0. Turn 3
sends that entry east, onto the square the other one is holding: both arrive, both die, and the
colony that had just grown is the one that ends the match with nothing. The opposing ant never
moves, so none of this is combat.</p>

<!-- replay-visualiser: turn-collision — filled.
Asset: tutorials/7-collide.json, turn 3 (its last). Regenerate with tutorials/build.sh.
Scripted deliberately: ["E", "-"] with the hill ant at entry 0, so the page is showing a rule
rather than reporting an accident.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Combat

An enemy is in attack range when wrapped squared distance is at most **5**.
For each ant after collisions, count enemies in range. This count is its
**focus**. Friendly ants do not add to its focus.

An ant dies if any enemy in range has focus less than or equal to its own.
Equivalently, an ant survives only when every enemy it faces has strictly higher
focus. An ant with no enemy in range survives combat.

All focus values are computed before any combat deaths. A dying ant still counts
for that turn's comparisons; deaths do not cascade.

| Position after movement | Focus values | Result |
|---|---|---|
| One ant against one, in range | Both 1 | Both die |
| Two allies each in range of one enemy, no other enemies | Allies 1 each; enemy 2 | Allies survive; enemy dies |
| Two against two, all in mutual range | All 2 | All die |
| Four adjacent cells in a row: A A B B | Outer ants 1; inner ants 2 | Inner ants die; outer ants survive |

The last two cases have the same number of ants but different outcomes. Model
position and support, not only the size of each army.

Two ants that close to within attack range with nothing supporting either one have equal focus,
and both die. Step through it: turn 3 has them four columns apart — squared distance 16, well
outside the range of 5 — and turn 4 is both the turn they close to 4 and the turn neither of them
survives. One against one is never a standoff you can look at: it resolves in the turn the gap
closes.

<div class="tb-replay" data-src="tutorials/2-fight.json" data-turn="3" data-zoom="6"></div>

<p class="tb-replay-caption">A one-against-one exchange on an eight-by-twelve board, played by the
engine from a written script. Use the arrow keys to step a turn at a time; click a cell to see what
is on it.</p>

<!-- replay-visualiser: turn-focus-combat — filled.
Asset: tutorials/2-fight.json, turn 3 — the last turn both ants are alive. Regenerate with
tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

Support is what changes the outcome, and it is visible. Two ants that arrive in range of a lone
enemy **on the same turn** each face one enemy while it faces two: its focus is 2, theirs is 1,
so it dies and both of them live. Arriving a turn apart instead would be the case above, twice.

<div class="tb-replay" data-src="tutorials/5-focus.json" data-turn="9" data-zoom="6"></div>

<p class="tb-replay-caption">Red gathers the food beside its hill, spawns a second ant, walks the
two of them east in single file and then turns them south, so that both cross into range on the same
turn. Turn 8 has them one step short of it; turn 9 puts them at squared distance 4 and 5 of the
defender, which dies while both attackers live. Its colony has nothing in the hive to replace it, so
the match ends there, 3&ndash;0.</p>

<!-- replay-visualiser: turn-focus-support — filled.
Asset: tutorials/5-focus.json, turn 9 (its last). Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Razing a hill

A surviving enemy on a standing hill destroys it, earning +2 and costing its
owner 1 point. An attacker killed during collisions or battle razes nothing.
Your own ant cannot raze your hill.

That second sentence is most of the difficulty. An ant sitting on its own hill
covers everything within squared distance 5 of it — two squares out in a line — so
a single attacker stepping into that ring dies with the defender and razes nothing.
Taking a defended hill takes support, or a defender that has left. The replay below is the second case:
blue's ant is scripted away from its hill first, so what you are watching is a
raze rather than a trade.

<div class="tb-replay" data-src="tutorials/3-raze.json" data-turn="10" data-zoom="5"></div>

<p class="tb-replay-caption">Blue's ant walks four squares north and holds there. Red's walks four
south and six east and stands on the undefended hill on turn 10: the hill is gone from that frame,
the score goes from 1&ndash;1 to 3&ndash;0 (+2 to the razer, −1 to the owner), and the match stops
there — with no enemy hill left standing, no finishing order is still reachable, so the engine ends
it <code>rank_stabilized</code>. Red's own hill is untouched and still able to spawn.</p>

<!-- replay-visualiser: turn-raze — filled.
Asset: tutorials/3-raze.json, turn 10 (its last). Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Food and new ants

Each stored food unit spawns one ant on an unoccupied friendly hill. When several
hills are free, the least recently used spawns first; a tie goes to the hill listed
first in the map file, and hills are listed so that every seat's first hill is the
same hill of the board moved by its shift.
Each hill can spawn at most one ant per turn because it then becomes occupied.
Food waits in the hive when no hill is available.

Gathering uses squared radius **1**: the food square and its four orthogonal
neighbours. If exactly one colony has surviving ants in range, it collects the
food. With none, food stays. The engine also implements destruction of food
contested by multiple colonies, but current attack and gathering radii prevent
opposing ants from both surviving in gathering range of the same food.

Food gathered on this turn can spawn **next turn at the earliest**. Vacating a
hill while another ant gathers nearby is therefore a useful growth pattern.

Spawning also runs *after* the fighting, which cuts the other way: a colony whose
defender dies on its own hill can replace it in the same turn out of food already
in the hive. A hill only goes quiet when the hive behind it is empty.


<div class="tb-replay" data-src="tutorials/4-growth.json" data-turn="2" data-zoom="6"></div>

<p class="tb-replay-caption">Turn 1 gathers the food beside the hill: it is gone from that frame and
no ant has appeared. Turn 2 steps the gatherer off the hill and the new ant is standing on it —
gathered on one turn, an ant on the next, and never sooner. Red then holds the hill and walks the
other ant away, and keeps both to the end. Watch the opposing colony for the other half of the rule:
it gathered the food beside *its* hill on turn 1 as well, and never spawns, because its own ant
stands on the only square an ant of its could appear on. Arrow keys step a turn at a time; click a
cell to see what is on it.</p>

<!-- replay-visualiser: turn-spawn-delay — filled.
Asset: tutorials/4-growth.json, turn 2. Regenerate with tutorials/build.sh.
The lesson ends on the turn limit with both of red's ants alive: growth is the rule here, and a
friendly collision is its own lesson (7-collide) under turn-collision above.
Frame N is the board after N turns, so turn 0 is the opening: a caption written in delta
indices is one turn early everywhere.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Sending nothing

The game leaves unordered ants still. That is distinct from a failed model call:
the platform counts missing or failed answers as strikes, substitutes no movement,
and eventually forfeits the seat. Always return a correctly sized action array,
even when your policy chooses to hold every ant. See [actions](../../models/actions.md).
