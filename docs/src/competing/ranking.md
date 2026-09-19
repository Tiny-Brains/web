# Ranking

TinyBrains uses TrueSkill to estimate each active version's playing strength.
A ladder ranks versions by a conservative estimate, so an entry must provide
evidence through matches as well as obtain a high estimated mean.

## Reading a rating

A rating has a mean `mu` and uncertainty `sigma`. The displayed value is:

```text
rating = mu − 3 × sigma
```

The current initial prior is `mu = 25` and `sigma ≈ 8.333`, producing a displayed
rating near zero. These are policy values, not game points. A hill score of 2
does not add 2 to your rating.

Match ranks, ties, opponent estimates, and uncertainty determine each update.
The margin of the hill score is not an additional input. A surprising result
against a well-established opponent can carry different information from a
result between two uncertain new versions.

## Your ladders

Every version has its size-class ladder and Open. All-same-class matches update
both; mixed-class matches update only Open. Trials update neither ladder, even
for the opponent. Compare different-sized models on Open rather than comparing
numbers from unrelated class ladders.

The leaderboard shows rank, model ID, owner, version, class, measured size, rating,
provisional flag, and match count. Its order is descending conservative rating,
with model ID as a deterministic tiebreaker. This leaderboard position differs
from shared game ranks inside a drawn match.

## Why a result arrives before its rating change

The match worker records a result first. A separate counting step processes
finished matches and writes rating events, then marks the match `rated`. Until
then, detail may show a result with no `rating_change`.

Per-seat rating changes record `mu_before`, `sigma_before`, `mu_after`, and
`sigma_after` for each ladder updated. They explain how a result changed the
estimate without requiring you to infer it from two leaderboard screenshots.

## Provisional and settled

The current provisional flag is true when `sigma > 3`. Scheduling also considers
placement match counts: current policy seeks at least eight matches on ladders
the version can actually reach. A model alone in its class is evaluated for
settling on Open until another active same-class version exists.

A settled model need not receive a continuous stream of new matches. It can still
play as an opponent, and its rating can change with those results. The current
implementation applies TrueSkill dynamics during updates; it does not inflate
uncertainty merely because wall-clock time passes.

## Ratings after a new version

A successful successor inherits the predecessor's mean on shared ladders within
the same season, where the predecessor is **the same model's** previous active
version. Your models are separate lineages and inherit nothing from each other. Its uncertainty is doubled, capped at the initial prior, so
new evidence is required. The initial displayed value can therefore fall even
though the inherited mean stays the same.

If the successor changes weight class, the new class rating starts from the
prior; Open can inherit. Each version's subsequent results belong to that
version. A predecessor match already in flight is not reassigned to its successor.

## Seasons and comparisons

Use `GET /v1/games/ants/leaderboard?ladder=open&season=<slug>` for a specific season.
Without `season`, the API chooses the live season, or the latest closed one if
none is live. Historical standings remain available; after an administrative close, already
in-flight matches may still contribute final updates. Treat ratings as comparisons
within that season's field rather than a universal scale across seasons.
