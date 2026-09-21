# Ranking

TinyBrains estimates each active version's playing strength with TrueSkill. A ladder ranks versions
by a conservative estimate, so an entry needs a high estimated mean and the matches to back it.

## Reading a rating

A rating has a mean `mu` and uncertainty `sigma`. The displayed value is:

```text
rating = mu − 3 × sigma
```

The initial prior is `mu = 25` and `sigma ≈ 8.333`, which displays as a rating near zero. These are
policy values. A hill score of 2 does not add 2 to your rating.

Each update depends on the match ranks, ties, the opponents' estimates and the uncertainty. The
hill-score margin plays no part. A surprise against a well-established opponent can carry
different information from a result between two uncertain new versions.

## Your ladders

Every version plays on its size-class ladder and on Open. A match whose seats all share a class
updates both; a mixed-class match updates only Open. A trial updates neither ladder, for the
opponent too. Compare models of different sizes on Open, since numbers from two class ladders are
unrelated.

The leaderboard shows rank, model ID, owner, version, class, measured size, rating, provisional flag
and match count. It sorts by conservative rating, highest first, and model ID breaks ties the same
way every time. Leaderboard rank and the shared game rank two seats get in a drawn match are
separate numbers.

## Why a result arrives before its rating change

The runner records the result first. Soma's count clock then processes finished matches, writes
rating events, and marks each match `rated`. Until then, the detail can show a result with no
`rating_change`.

Each seat's rating change records `mu_before`, `sigma_before`, `mu_after` and `sigma_after` for each
ladder the match updated, so you can see how a result moved the estimate without comparing two
leaderboard screenshots.

## Provisional and settled

The provisional flag is true while `sigma > 3`. The matchmaker also counts placement matches, and
seeks at least eight on each ladder the version can reach. For a model alone in its class, the
platform judges settling on Open until another active version joins that class.

A settled model can go without new matches of its own. The matchmaker can still pick it as an
opponent, and those results move its rating. TrueSkill dynamics apply during updates only:
uncertainty does not grow as wall-clock time passes.

## Ratings after a new version

A successor that passes its trial inherits its predecessor's mean on the ladders they share in the
same season. The predecessor is **the same model's** previous active version; your models are
separate lineages and inherit nothing from each other. The platform doubles the successor's
uncertainty, capped at the initial prior, so it needs new evidence, and its displayed rating can
start lower than the predecessor's with the same mean.

A successor in another weight class starts its class rating from the prior, and can still inherit
on Open. Each version keeps its own later results: the platform never moves a predecessor's
in-flight match to its successor.

## Seasons and comparisons

Read one season with `GET /v1/games/ants/leaderboard?ladder=open&season=<slug>`. Without `season`,
the API answers for the live season, or the latest closed one if none is live. Historical standings
stay available, and after an administrator closes a season, matches already in flight can still add
final updates. A rating compares you with that season's field; ratings from two seasons share no
scale.
