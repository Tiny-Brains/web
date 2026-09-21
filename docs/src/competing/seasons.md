# Seasons

A season is a competition window for one game, and an administrator creates it. Each version you
submit belongs to one season and plays only within that field. A game has at most one live season
at a time.

A season has a **name** its administrator gives it, such as "Summer 2026", and a **slug** the
platform derives from the name, `summer-2026`. Every link, every route and every record addresses
the season by its slug. Neither ever changes, so a link to a season keeps working.

## The submission window

`GET /v1/games/ants/seasons` lists each season's name and slug, state, submission opening and
closing times, engine identity, rules, and a summary of its boards, newest first.

| State | Submissions | Competition |
|---|---|---|
| `scheduled` | Not yet accepted | Waiting for the opening time |
| `open` | Accepted, within the rules | Versions may enter and play |
| `settling` | Closed to new submissions | Existing work and matches continue |
| `closed` | Not accepted | Historical standings kept |

The opening time is inclusive and the closing time exclusive, so submit before the closing
timestamp. A submission that arrives in time can still be in admission or its trial when the window
ends. The settling period lets that work finish, unless an administrator closes the season.

## The rules a season declares

A season carries a rules document that describes the whole contest. Every rule is optional. A season
that declares none plays under the platform's own defaults, so two seasons on an unchanged platform
can run different contests.

**Who may enter**

- A **participant list** of GitHub usernames, for a class, a lab or an invited cohort. Soma checks
  the list at each submission, so someone who signs in for the first time halfway through the term
  can enter without an edit. The list is **not public**: the API reports `participants` as
  `{"enabled": true}` and nothing more, because the roster names people. The API publishes every
  other rule in full.
- **Which organisations count as yours**, for competitors who enter from a shared account instead of
  a personal one.

**How much you may enter**

- How many **models** you may hold, and how many of them may sit in one weight class.
- How many of your **versions** may be in admission at once, across every model.
- How many **versions** you may enter, per model or in total.
- A **cooldown** between one model's submissions.

**What may be entered**

- Which **weight classes** the season runs. Admission rejects a model that measures into any other
  with `CLASS_NOT_OFFERED`.
- The **ONNX surface**: an opset range, an operator allowlist, a parameter ceiling and an adapter
  instruction budget. A season can narrow the platform's surface and never widen it: a wider one
  would admit an operator the runtime cannot execute, which would then fail at play.
- Which **element types the weights may be stored in**. A quantised-only season lists `int8` and
  nothing else. Admission measures the weights themselves and ignores the graph's inputs and
  outputs, since a network with float32 ports can hold int8 weights, as a quantised one does.
- Whether **duplicate weights** are allowed, and in what scope: across the game, within the season,
  or not even twice from you.

**How the ladder plays and how it is read**

- Which **boards** the season plays, how much **cross-class** play connects the Open ladder, and how
  many matches a version gets. The boards are the season's own: an administrator uploads them, and
  `GET /v1/games/ants/seasons/{slug}/maps` lists each one from the moment it arrives. Unlike the
  rules, the boards can change while a season runs. An administrator can put a board in play or
  take one out; the platform cancels a match queued on a board taken out, and one already running
  finishes and counts. Design for the game's limits, since the boards a season has today can change
  ([The maps](../games/ants/maps.md)).
- Whether two of **your own models may meet**. They may not unless a season says otherwise, because
  a match between two of your models would move rating between them for free.
- What a **standing** is (your best model, your best in each class, or a total), and how many of
  your models may appear on one ladder at all.
- The **rating** constants, and what counts as settled.

Read the returned `rules` before you assume any of this. `GET /v1/games/{game}/submission` reports
every restriction *before* you make a request, in the words the refusal would use, so you learn a
season's rules before a refusal teaches you them.

## How a season closes

After the submission window ends, the platform closes the season on its own once every candidate has
a verdict, the outstanding games and counting are done, and the active competitors' ratings meet the
settling policy on the ladders they can reach. The submission deadline sets no fixed time for the
final match.

An administrator can also request closure. Soma's closure clock then marks the season closed,
rejects waiting candidates with `SEASON_CLOSED`, and cancels queued matches. Matches already claimed
or running can still finish and count into that season, so the standings can take those last
updates after the close. A `SEASON_CLOSED` rejection records an administrative decision and says
nothing about whether your model met its requirements.

## What carries over

Your models persist across seasons, and their *entries* stay behind. A model you created last
season is still yours, with its name and its whole history, but none of its entries roll forward. To
compete in a new season, submit a version to it there once its window opens; you may submit the same
weights again. Promotion and predecessor rating inheritance stay within one season. Each season has
its own baseline opponents too: the administrators upload them into each season, and a baseline with
the same name in a later season is the same opponent starting again from the prior. The platform
enrolls no competitor account in a season for you.

## Historical standings

The platform keeps a closed season's standings. Read one with
`GET /v1/games/ants/leaderboard?season=summer-2026&ladder=open`, or pick a size-class ladder. Match
and version records name their season too, so you can keep results from separate fields apart in
your training notes.
