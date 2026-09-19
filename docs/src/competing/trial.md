# The trial

A trial is one ordinary match played before a verified candidate becomes active.
It has a match ID, a board, results, and a replay when successfully recorded, but
**it updates no ladder**, including the opponent's.

## Who you play

The current matchmaker seats the candidate against the platform baselines in
play in the same season — the ones its administrators uploaded and switched on. It chooses the board by trial-attempt order, among the
season's boards in play that those baselines can fill, in the order they were
added; you do not choose the opponent or the board. A trial on a board of `n` seats
needs `n − 1` runnable baselines with different owners, so a season whose baselines
have three owners trials candidates on boards of up to four seats. A season with no
board in play, or no baseline in play, trials nobody: the candidate waits,
`verified`, until there is one of each.
Trial work is prioritized when workers claim queued games, but still needs
compatible capacity and those baseline assets.

Only one live trial may exist for a candidate at a time. A replacement trial can
be scheduled if an earlier one fails for reasons not attributed to the candidate.

## Why losing is fine

A completed trial passes when the candidate's strike count is below the forfeit
limit. Its finishing rank is irrelevant. A loss or draw with valid turn answers
is sufficient; the ladder will estimate playing strength after promotion.

At current settings, five cumulative failed answers cause a forfeit and rejection
with `FORFEIT`. The failures need not be consecutive. Reaching an ordinary match
ending such as a food stalemate is not itself a trial failure.


<div class="tb-replay" data-src="tutorials/2-fight.json" data-turn="0" data-zoom="6"></div>

<p class="tb-replay-caption">What a trial is checking for is that a version produces valid actions and answers every turn it is asked for. This short scripted match opens on its first board; step it with the arrow keys and four turns later it has an end reason, which is all a trial needs to have happened.</p>

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
| Cancelled or failed for another reason | Attempt another trial within the repair limit |
| Repeated unsuccessful trial attempts exhaust the limit | Reject with `UNPLAYABLE` |

The current repair limit is three trial rows. Infrastructure failures can therefore
prevent admission to the ladder without establishing that the strategy is wrong.
Read the failure attribution before changing your model.

## How long you wait

The version stays `verified` during queueing and play. Read its `trial.status`:
`pending` is queued, `claimed` is assigned to a worker, and `running` is in progress.
`finished` can briefly precede the verdict because counting is asynchronous.
A verified candidate continues to occupy that model's one in-flight slot, and counts against any per-competitor limit the season sets.

A trial can take many turns, and a busy or unavailable arena can add queue time.
If the wait is unexpectedly long, retain the candidate and trial IDs and ask the
operator to check the queue and compatible worker. Repeated submission is not a
way to accelerate an existing trial.
