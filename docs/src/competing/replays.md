# Replays

A replay records a match, so you can investigate a result and compare how models behave. Look for
the first decision that changed the position: an avoidable collision, blocked spawning, lost vision
or an undefended hill.

## Getting a replay

Read `GET /v1/matches/{id}` and use its `replay_url` if it has one. The platform signs that URL for
temporary read access. If an old link expires, fetch the match detail again for a fresh one, and
keep the match ID as your stable reference.

A null `replay_url` is normal for a queued, cancelled or failed match that never produced a replay.
A successful match's detail also gives the board, seed, engine digest, Orion version and each
seat's result.

## What is stored

The envelope is JSON, and holds all you need to play the match again from nothing:

| Field | What it is |
|---|---|
| `match_id`, `attempt_token` | Which match, and which attempt at it |
| `seed`, `map_id`, `map` | The board. `map` carries its rows, columns, water, hills, food and symmetry, so a replay needs nothing beside it: neither the season nor the board's entry in its maps, which an admin may since have taken out of play |
| `engine_digest`, `orion_version` | The cartridge that played it, and the runtime that ran the models |
| `max_turns`, `strike_ceiling` | The limits it was played under |
| `deltas` | The action stream: `t` is the turn, `a` a list of per-seat strings, each holding that seat's directions in its ant order with `-` for a hold |
| `engine_ranks`, `scores`, `reason`, `turns` | How it ended |
| `seats` | Per seat: the model, both hashes, `strikes`, `forfeited`, and the inference it spent (`infer_us_total`, `infer_us_max`, `infer_turns`) |

**Read the per-seat block first when a result disappoints you.** A seat with strikes missed turns;
compare `infer_us_max` with the 1,000 ms deadline to see how close it came to missing more.

The envelope stores actions. The matching engine rebuilds each position by replaying them, and the
same actions give the same positions every time. Playback runs no model and chooses no new moves.

`engine_ranks` records the game's result before the platform applies forfeit ranking. The match
record's player ranks are the official competitive result; use the engine ranks to diagnose how the
game went.

## Watching a replay

You can watch a replay three ways, each driving the same cartridge that played the match:

- **The site.** A match page plays it full screen. Start here.
- **`tinybrains view replays/<file>.json`** opens a downloaded envelope in your browser, with no
  server involved.
- **`tinybrains conform replays/<file>.json`** checks the replay instead of drawing it: it rebuilds
  the match from the envelope alone, plays it on your machine, and diffs every field and every turn
  against the recording. Run it on a replay of your own entry. A difference means two engines
  disagree, and that is a bug to report.

The viewer **re-simulates from the action stream**, so the engine it runs matters. A viewer running
a different engine from the one that played raises no error and draws a plausible match that never
happened. The envelope names its `engine_digest` so you can compare the two.


<div class="tb-replay" data-src="tutorials/real-match.json" data-turn="20"></div>

<p class="tb-replay-caption">The replay viewer re-simulates the recorded action stream with the cartridge that played the match, so the board shows the match as it happened.</p>

<!-- replay-visualiser: replay-viewer — filled.
Asset: tutorials/real-match.json, turn 20. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Using replay examples in this book

This book marks a planned visualiser beside each explanation a real match would help. Each example
must name its replay asset, engine digest, relevant turns, player perspective and caption. The book
invents no match IDs or outcomes for these placeholders.

Full-board playback shows what no competitor could see during play. A page explaining what a model
could infer from its view uses a player-view overlay, and keeps its prose so the rule still reads
without the viewer or its replay assets.

## Improving from a replay

Check strikes and output validity first. Then look at growth, movement collisions, combat support,
scouting and hill defence. Compare the same behavior across several seeds and boards: one attractive
victory says little about whether a revision is stronger.
