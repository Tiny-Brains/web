# Replays

A replay records what happened in a match so you can investigate a result and
compare model behavior. Look for the first decision that changed the position:
an avoidable collision, blocked spawning, lost vision, or an undefended hill.

## Getting a replay

Read `GET /v1/matches/{id}` and use its `replay_url` when present. The URL is
signed for temporary read access. Fetch a fresh match detail if an old link
expires; keep the match ID as the stable reference, not the signed URL.

A null replay URL can be normal for queued, cancelled, or failed work that never
produced a replay. A successful match's detail also supplies the preset, seed,
engine digest, Orion version, and per-seat result.

## What is stored

The envelope is JSON, and it is everything needed to play the match again from nothing:

| Field | What it is |
|---|---|
| `match_id`, `attempt_token` | Which match, and which attempt at it |
| `seed`, `preset`, `map_id`, `map` | The board — `map` carries its rows, columns, water, hills, food and symmetry, so a replay needs no map catalogue beside it |
| `engine_digest`, `orion_version` | The cartridge that played it, and the runtime that ran the models |
| `max_turns`, `strike_ceiling` | The limits it was played under |
| `deltas` | The action stream: `t` is the turn, `a` a list of per-seat strings, each holding that seat's directions in its ant order with `-` for a hold |
| `engine_ranks`, `scores`, `reason`, `turns` | How it ended |
| `seats` | Per seat: the model, both hashes, `strikes`, `forfeited`, and the inference it spent — `infer_us_total`, `infer_us_max`, `infer_turns` |

**The per-seat block is where a disappointing result usually explains itself.** A seat with strikes
missed turns; `infer_us_max` against the 1,000 ms deadline says whether it was close to missing
more.

These are actions, not pre-rendered frames. The matching engine reconstructs
positions by replaying the actions deterministically. A model is not run again
to choose new moves during playback.

`engine_ranks` records the game's result before the platform applies forfeit
ranking. Use the match record's player ranks for the official competitive result;
keep the engine ranks when diagnosing game behavior.

## Watching a replay

Three ways, all of them driving the same cartridge that played the match:

- **The site.** A match page plays it, full screen. This is the one to reach for.
- **`tinybrains view replays/<file>.json`**, which opens a downloaded envelope in your browser with
  no server involved.
- **`tinybrains conform replays/<file>.json`**, which is not watching but checking: it rebuilds the
  match from the envelope alone, plays it locally, and diffs every field and every turn against
  what was recorded. Worth running on a replay of your own entry — a difference means two engines
  disagree, which is a bug worth reporting.

The viewer **re-simulates from the action stream**; it does not play back stored frames, and no
model is run again to choose new moves. That is why the engine identity matters more than it looks
like it should: a viewer re-simulating with a different engine than the one that played does not
fail, it draws a plausible match that never happened. The envelope names its `engine_digest` so the
two can be compared.


<div class="tb-replay" data-src="tutorials/real-match.json" data-turn="20"></div>

<p class="tb-replay-caption">The replay viewer. It re-simulates from the recorded action stream using the cartridge that played the match, so what you see is what happened.</p>

<!-- replay-visualiser: replay-viewer — filled.
Asset: tutorials/real-match.json, turn 20. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## Using replay examples in this book

Planned visualisers are marked beside explanations where a real match helps.
Each example should identify its replay asset, engine digest, relevant turns,
player perspective, and explanatory caption. No match IDs or outcomes are
invented for these placeholders.

Full-board playback contains information a competitor could not see during play.
Use a player-view overlay when explaining what a model could reasonably infer.
Retain the accompanying prose so the rule remains understandable without the
viewer or when replay assets are unavailable.

## Improving from a replay

First check strikes and output validity. Then inspect growth, movement collisions,
combat support, scouting, and hill defence. Compare the same behavior across
several seeds and presets; one attractive victory is weak evidence that a model
revision is stronger overall.
