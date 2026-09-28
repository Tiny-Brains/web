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

## One ladder, viewed by class

Every version has one rating, on **Open**, the single rated ladder. A match updates that one rating.
A trial updates it for neither side.

A weight class is a **view** of Open: your class standing is your position on the Open ladder,
counting only versions in your size class. So your Open rank and your class rank can never disagree
about which of two same-size models is ahead. Compare models of different sizes on Open directly,
since it already spans every size; a class view only shows how you rank among your size peers.

The leaderboard shows rank, model ID, owner, version, class, measured size, rating, provisional flag
and match count. It sorts by conservative rating, highest first, and the version ID breaks ties the
same way every time. Leaderboard rank and the shared game rank two seats get in a drawn match are
separate numbers.

## Why a result arrives before its rating change

The runner records the result first. Soma's count clock then processes finished matches, writes
rating events, and marks each match `rated`. Until then, the detail can show a result with no
`rating_change`.

Each seat's rating change records `mu_before`, `sigma_before`, `mu_after` and `sigma_after` for the
one Open rating the match updated, so you can see how a result moved the estimate without comparing
two leaderboard screenshots.

## Provisional and settled

The provisional flag is true while `sigma > 3`, on your one Open sigma. The matchmaker also counts
placement matches, and seeks at least eight before it settles a version.

In a season without rounds, a settled model can go without new matches of its own. The matchmaker
can still pick it as an opponent, and those results move its rating. TrueSkill dynamics apply during
updates only: uncertainty does not grow as wall-clock time passes. A season played in rounds works
differently, as the next section explains.

## Rounds and score resets

Without rounds, a version submitted in the first week collects hundreds of matches while one
submitted later settles after a handful, and the conservative rating rewards the older one's lower
uncertainty. A season can be played in **rounds** to take a version's age out of its score. The
season's rules say how often a round starts, typically weekly.

At the start of each round:

- every active version's `sigma` rises to the round's floor, so every version carries the same
  `3 × sigma` discount and the leaderboard reads them by `mu`;
- a round may also draw every `mu` part of the way toward the season's mean;
- matches queued for the round before are cancelled with `ROUND_ENDED`, while running ones finish
  and count;
- every active version then plays the round's number of rated matches, the least-played first.

Your match count, your record and your rating history carry over; only the uncertainty and possibly
the mean are reset. The leaderboard shows each version's matches in the current round beside its
season total, and counts down to the next reset. A notice across the site, and one in your
notifications, gives warning before each reset.

## Finals

When a season's submissions close, an administrator can start its **finals**, a last round with its
own number of matches. The finals wait until every submission has been admitted, so every entry's
last version plays them. They start from a reset like any round's. Then every entry plays exactly
the finals' number of matches: no entry is seated past it, while baselines fill the seats and are
never waited for. The season closes once every entry has played its matches and nothing is left in
flight. The podium is frozen from the ratings the finals end on.

An administrator can change the finals' number of matches while they run, for every entry at once,
or end the season early.

## Ratings after a new version

A successor that passes its trial inherits its predecessor's one Open rating mean in the same season.
The predecessor is **the same model's** previous active version; your models are separate lineages
and inherit nothing from each other. The platform doubles the successor's uncertainty, capped at the
initial prior, so it needs new evidence, and its displayed rating can start lower than the
predecessor's with the same mean.

The successor inherits that one rating whatever weight class it lands in. Each version keeps its own
later results: the platform never moves a predecessor's in-flight match to its successor.

## Seasons and comparisons

Read one season with `GET /v1/games/ants/leaderboard?ladder=open&season=<slug>`. Without `season`,
the API answers for the game's [featured season](seasons.md#which-season-a-request-is-about). A
private season's standings are its members' alone, through `/v1/private/games/ants/leaderboard`.
Historical standings stay available, and after an administrator closes a season, matches already in flight can still add
final updates. A rating compares you with that season's field; ratings from two seasons share no
scale.
