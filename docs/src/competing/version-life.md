# The life of a version

Each submission creates a model version with its own hashes, season, status, matches and
ratings. A later upload makes a new version and leaves the admitted one as it is.

## The five states

| Status | Meaning | API phase |
|---|---|---|
| `testing` | Waiting for admission, or in it | `queued` or `verifying` |
| `verified` | Passed admission; waiting for a trial verdict | `awaiting_trial` |
| `active` | Plays rated matches in its season | `on_the_ladder` |
| `superseded` | A successor passed its trial and replaced it | `superseded` |
| `rejected` | Stopped, and the record names the reason | `rejected` |

A version that passes goes `testing → verified → active`. Admission or the trial can move a
candidate to `rejected`, and a later candidate that passes moves the earlier active version to
`superseded`.

An `active` version can sit idle once its rating settles. In a closed season, the versions still
`active` make up its final standings.

## Promotion

Your previous version stays `active` while the candidate goes through admission and its trial. A
candidate that passes becomes `active` and supersedes the previous active version of **the same
model** in the same season. If the platform rejects the candidate, the previous version stays in
place.

Each model can have one candidate in `testing` or `verified` at a time. A season can also cap how
many candidates you have in flight across all your models. Only a trial pass replaces the previous
version: submitting and passing admission leave it active.

## What the new version inherits

On each ladder both versions share, a successor starts from the predecessor's rating mean with its
uncertainty doubled, capped at the initial prior. A successor in another weight class starts its
class rating from the prior, and its Open rating can still inherit the predecessor's estimate. Its
own matches then set its rating. [Ranking](ranking.md) has the numbers.

A version inherits only within its season. To enter a later season you submit again, and the
platform creates a new version for that field even from the same bytes.

## What happens to old matches

The platform cancels the predecessor's queued matches, and names the successor on each one a
replacement cancelled. A match a runner has already claimed or started finishes between the
versions it paired and counts for them; the platform never moves it to the new version.

The predecessor's history stays available. To compare two training revisions, keep their match IDs
apart: the version number and hashes tell you which version played.

## Withdrawal and rejection

The platform withdraws **queued matches** that no longer apply, for example after a promotion or an
engine change. You cannot withdraw a version yourself: Soma's API has no withdrawal endpoint and no
`withdrawn` status, and no DELETE call on a model removes it from the arena.

A `rejected` version carries its reason, for example a model compatibility problem, a failed trial,
or `SEASON_CLOSED` for a candidate still waiting when an administrator closed the season. Each
needs a different fix, so read [rejection reasons](../reference/rejection-reasons.md) before you
submit another version.
