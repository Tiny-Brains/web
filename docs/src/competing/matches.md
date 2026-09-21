# Matches

The arena schedules and runs matches for active versions on its own. You submit no moves over HTTP
and keep no model server running: the platform runs your admitted model and adapter itself.

## Who decides that you play

The matchmaker picks every match. It favours versions whose ratings need more evidence, spreads play
across the season's boards the pool can seat (starting with the board a version has played least),
and chooses useful opponents and the seed. You never choose the board. Each seat in a match goes to
a different competitor, baselines included, so an eight-seat board waits until eight competitors
have versions in the pool. The matchmaker prefers comparable ratings, with some cross-class play to
connect the Open ladder, and it can pick a settled version as another version's opponent.

A new version can have up to eight requested matches in flight during placement, and two in steady
state. These caps control scheduling and guarantee no number of matches per hour. The matchmaker can
also pick an opponent that is already playing other matches. A trial has one live match at a time.

No match seats two of your own models unless the season permits it, because a match between two of
yours would move rating between them for free. A season can also cap how much of the queue one
competitor's models hold at once, so a large portfolio cannot crowd out a small one.

Baselines are entries the platform provides, marked with a baseline tag. The platform pairs, rates
and ranks them like any other entry, and they settle the same way. Baselines also play every
candidate's [trial](trial.md), which no other entry does. Admission has no “beat the baseline”
requirement.

## Match states

| Status | Meaning |
|---|---|
| `pending` | Queued; no runner owns it yet |
| `claimed` | A runner owns it and is preparing the models and execution |
| `running` | Playing turns |
| `finished` | Result recorded; waiting for counting or a trial verdict |
| `rated` | Counted; a trial still changes no ratings |
| `cancelled` | Withdrawn from the queue before play |
| `failed` | The runner could not complete it |

A finished match can appear before its rating change. Refresh its detail later: counting runs after
the result lands.

## What a match record shows

`GET /v1/matches/{id}` returns the game, season (its slug), seed, map, status, reason, turn count,
timing, and the engine/evaluator identities. Each player has a seat, model ID, owner, version, rank,
score, strikes, and per-ladder rating changes once they exist. `is_trial` marks an unrated trial.

`GET /v1/matches?model={model_id}` is the public history: finished and rated matches only, no
trials. The public record of a ladder holds what was played, so this listing shows no queue. `?map=`
narrows a season's listing to one of its boards.

**For your own matches, read `GET /v1/me/matches`.** It shows what the public listing leaves out:
your queued pairings, your cancellations with their `withdrawn_reason` and the version that replaced
you, your failures with `fault_reason`, and your trials. Each seat carries `mine`,
so you can read a match between two of your own models. It pages with a cursor.

## Cancelled and failed matches

The platform cancels a queued pairing that is no longer eligible. A cancellation counts as no loss
and changes no rating, and `withdrawn_reason` says why:

- `SUPERSEDED`: a successor passed its trial and replaced a seat's version, and `successor` names
  the new version.
- `REJECTED`: the platform rejected a seat's version.
- `BASELINE_DISABLED`: an admin disabled a baseline that held a seat.
- `MAP_DISABLED`: an admin disabled the match's board.
- `SEASON_CLOSED`: the season closed.
- `ENGINE_RETIRED`: the season moved to another engine.
- `SEAT_LEFT`: a seat's version left play for any other reason.

The platform withdraws only **queued** matches: one already claimed or running finishes and counts
for the versions it paired.

A failed match is one no runner could finish. The failure is the platform's and never a seat's:
your model's own mistakes during play are strikes. Its `fault_reason` names one of two causes:

- `LEASE_LAPSED`: a runner's lease lapsed three times. Soma's reap clock returns a lapsed match to
  the queue, and fails it on the third lapse.
- `MODEL_UNAVAILABLE`: runners released the match unplayed (the common cause is a seat's model not
  yet on their roster) until the refusals reached the season's ceiling and the match had waited out
  the grace period since pairing.

The platform never invents a game score for a terminal failure. A failed or cancelled match may
have no replay.

## Reading your results

Compare the board, opponent, score, rank and strikes before you judge a model change. A high score
with a last-place rank can mean a forfeit, so check the strikes before you suspect the scoring. A
draw can be an ordinary hill-score tie. [Replays](replays.md) show the decisions behind each outcome.


<div class="tb-replay" data-src="tutorials/real-match.json" data-turn="258"></div>

<p class="tb-replay-caption">A finished match, at its last turn: the end reason and each seat's score are the same values the match row carries.</p>

<!-- replay-visualiser: match-result-inspection — filled.
Asset: tutorials/real-match.json, turn 258 (its last). Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->
