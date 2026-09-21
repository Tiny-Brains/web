# The trial

A trial is one ordinary match a verified candidate plays before it becomes
active. It has a match ID, a board, results, and a replay if the recording
succeeds, and **it updates no ladder**, the opponent's included.

## Who you play

The matchmaker seats the candidate against the platform baselines in play in
the same season: the ones its administrators uploaded and switched on. It picks
the board by trial-attempt order from the season's boards in play that those
baselines can fill, in the order an admin added them. You choose neither the
opponent nor the board. A trial on a board of `n` seats needs `n − 1` runnable
baselines with different owners, so a season whose baselines have three owners
trials candidates on boards of up to four seats. A season with no board in play,
or no baseline in play, trials nobody: the candidate waits, `verified`, until
there is one of each. Runners take trial work first when they claim queued games,
and a trial still needs compatible capacity and those baseline assets.

A candidate has at most one live trial at a time. If a trial fails for a reason
the platform does not attribute to the candidate, the platform can schedule a
replacement.

## Why losing is fine

A completed trial passes when the candidate's strike count is below the forfeit
limit, whatever its finishing rank. A loss or draw with valid turn answers is
enough; the ladder estimates playing strength after promotion.

At the current settings, five failed answers in total forfeit the match and
reject the candidate with `FORFEIT`, and the failures need not be consecutive. An
ordinary match ending, such as a food stalemate, does not fail the trial.


<div class="tb-replay" data-src="tutorials/2-fight.json" data-turn="0" data-zoom="6"></div>

<p class="tb-replay-caption">A trial checks that a version answers every turn with valid actions. This short scripted match opens on its first board. Step it with the arrow keys: four turns later it has an end reason, and a trial needs nothing more.</p>

<!-- replay-visualiser: trial-playability — filled.
Asset: tutorials/2-fight.json, turn 0 — the opening, because the caption promises a whole match.
Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## When a trial fails

| Outcome | Candidate consequence |
|---|---|
| Finished below the strike limit | Promote to active |
| Finished at the forfeit limit | Reject with `FORFEIT` |
| Execution failure attributed to the candidate's seat | Reject with `FAULT:<reason>` |
| No runner could load your model in time (`MODEL_UNAVAILABLE`) | Attempt another trial, outside the repair limit |
| That happens as many times as the repair limit | Reject with `RUNNER_UNAVAILABLE` |
| Cancelled or failed for another reason | Attempt another trial within the repair limit |
| Repeated unsuccessful trial attempts exhaust the limit | Reject with `UNPLAYABLE` |

The repair limit is three trial rows. A trial for which no runner could load your
model was never played, so it does not count toward them. The platform counts those
apart, and running out of them is `RUNNER_UNAVAILABLE`, a failure of the platform's:
submit the same files again. Other infrastructure failures can still use up the repair
limit, and they say nothing about your strategy, so read the failure attribution before
you change your model.

## How long you wait

The version stays `verified` while its trial is queued and played. Read its
`trial.status`: `pending` is queued, `claimed` means a runner has taken it, and
`running` is in progress. `finished` can show for a moment before the verdict,
because the platform counts results on a separate clock. A verified candidate
keeps that model's one in-flight slot, and counts against any per-competitor
limit the season sets.

A trial can take many turns, and a busy or unavailable arena can add queue time.
If the wait runs long, keep the candidate and trial IDs and ask the operator to
check the queue and the compatible runners. Submitting again does not speed up a
trial already queued.
