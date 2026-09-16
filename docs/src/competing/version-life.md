# The life of a version

Each submission creates a distinct model version with its own hashes, season,
status, matches, and ratings. Changing the files in a GitHub release does not
change the version already admitted from it.

## The five states

| Status | Meaning | API phase |
|---|---|---|
| `testing` | Waiting for or undergoing admission | `queued` or `verifying` |
| `verified` | Passed admission; awaiting a trial verdict | `awaiting_trial` |
| `active` | Eligible for rated competition in its season | `on_the_ladder` |
| `superseded` | Replaced by a successful successor | `superseded` |
| `rejected` | Could not proceed, with a reason recorded | `rejected` |

The usual path is `testing → verified → active`. Admission or a trial can send
a candidate to `rejected`. A later successful candidate changes the earlier
active version to `superseded`.

`active` is a version status, not a promise of continuous matches: a settled
version may be idle, and active versions retained in a closed season form its
historical standings.

## Promotion

While the candidate is testing or playing its trial, the predecessor remains
active. Passing the trial promotes the candidate and supersedes THE SAME MODEL'S
previous active version
in the same season. Rejection leaves the predecessor in place.

Only one candidate per MODEL can be in `testing` or `verified` at once. A season
may additionally cap how many of yours may be in flight across all your models.
A trial pass, rather than submission time or static verification, is what
triggers replacement.

## What the new version inherits

A successor starts from the predecessor's rating mean on shared ladders with
increased uncertainty. The current policy doubles uncertainty up to the initial
prior. A class change starts the new class rating from the prior; Open can still
inherit the predecessor's estimate. New matches then establish the successor's
strength. See [Ranking](ranking.md) for the numbers.

Inheritance is within a season. Entering a later season creates a new version
for that field, even if you reuse the same release.

## What happens to old matches

Queued matches for the predecessor are cancelled, naming the successor when
replacement caused the cancellation. Already claimed or running matches finish
against the versions originally paired and count for those versions. They are
not reassigned to the new entry.

The predecessor's history remains available. Separate its match IDs from the
successor's when comparing training revisions; version number and hashes make
that attribution explicit.

## Withdrawal and rejection

The platform withdraws obsolete **queued matches**, for example after promotion
or an engine change. There is no public self-service withdrawal endpoint in the
current Soma API and no separate `withdrawn` version status. Do not expect a
DELETE-model call to remove an entry from the arena.

`rejected` records a reason such as a model compatibility problem, a failed trial,
or `SEASON_CLOSED` for a waiting candidate when an administrator closes the season.
These have different remedies; consult [rejection reasons](../reference/rejection-reasons.md)
before publishing another release.
