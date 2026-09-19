# Seasons

A season is a competition window for one game, created by an administrator.
Each submitted version belongs to one season and plays only within that field.
There can be at most one live season for a game at a time.

A season has a **name** its administrator gives it — "Summer 2026" — and a **slug**
derived from the name, `summer-2026`, which is how every link, every route and every
record addresses it. Neither ever changes, so a link to a season keeps working.

## The submission window

Read `GET /v1/games/ants/seasons` for each season's name and slug, state, submission
opening and closing times, engine identity, rules, and a summary of its boards. The
list is newest first.

| State | Submissions | Competition |
|---|---|---|
| `scheduled` | Not yet accepted | Awaiting the opening time |
| `open` | Accepted subject to rules | Versions may enter and play |
| `settling` | Closed to new submissions | Existing work and matches continue |
| `closed` | Not accepted | Historical standings retained |

The opening time is inclusive; the closing time is exclusive. Submit before the
closing timestamp. A submission received in time may still be undergoing
admission or a trial when the window ends; the settling period permits that work
to complete unless the season is administratively closed.

## The rules a season declares

A season carries a rules document, and it is the whole description of that
contest. Every rule is optional; a season that declares none behaves exactly as
the platform's own defaults, which is why two seasons can feel entirely different
without anything in the platform changing between them.

**Who may enter**

- A **participant list** of GitHub usernames — a class, a lab, an invited cohort.
  The list is matched at each submission rather than resolved once when the season
  was created, so someone who signs in for the first time halfway through the term
  is admitted without an edit. The list itself is **not public**: the API reports
  `participants` as `{"enabled": true}` and nothing more, because the roster names
  people. Every other rule is published in full.
- **Which organisations count as yours**, for competitors entering from a shared
  account rather than a personal one.

**How much you may enter**

- How many **models** you may hold, and how many of them may sit in one weight
  class.
- How many of your **versions** may be in admission at once, across every model.
- How many **versions** you may enter — per model, or in total.
- A **cooldown** between one model's submissions.

**What may be entered**

- Which **weight classes** the season runs. A model measuring into one it does not
  run is rejected `CLASS_NOT_OFFERED`.
- The **ONNX surface**: an opset range, an operator allowlist, a parameter
  ceiling, an adapter instruction budget. A season may only narrow the platform's,
  never widen it — an operator the runtime cannot execute would otherwise be
  admitted and then fail at play.
- Which **element types the weights may be stored in** — a quantised-only season
  lists `int8` and nothing else. This is measured on the weights themselves, not on
  the graph's inputs and outputs: a network with float32 ports may hold int8
  weights, which is what quantisation is.
- Whether **duplicate weights** are allowed, and in what scope: across the game,
  within the season, or not even from you twice.

**How the ladder plays and how it is read**

- Which **boards** are played — the season's own, uploaded by an administrator and
  listed at `GET /v1/games/ants/seasons/{slug}/maps` from the moment each arrives —
  how much **cross-class** play connects the Open ladder, and how many matches a
  version is given. Unlike the rules, the boards can change while a season runs: an
  administrator may put a board in play or take one out, and a match queued on a board
  taken out is cancelled, while one already running finishes and counts. So design for
  the game's limits, not for the boards a season has today ([The maps](../games/ants/maps.md)).
- Whether two of **your own models may meet**. They may not, unless a season says
  otherwise: a match between two of your models would move rating between them for
  free.
- What a **standing** is: your best model, your best in each class, or a total —
  and how many of your models may appear on one ladder at all.
- The **rating** constants, and what counts as settled.

Read the returned `rules` rather than assuming any of this. Every restriction is
reported by `GET /v1/games/{game}/submission` *before* you make a request, in the
same words the refusal would use — so a season's rules are something you can read
rather than discover.

## How a season closes

After the submission window, automatic closure waits until candidates have been
decided, outstanding games and counting work are complete, and active competitor
ratings satisfy the settling policy on reachable ladders. The submission deadline
therefore does not prescribe a fixed final-match timestamp.

An administrator can also request closure. The current closure clock marks the
season closed, rejects waiting candidates with `SEASON_CLOSED`, and cancels queued
matches. Already claimed or running matches can still finish and count into that
season, so standings can receive those last updates after an administrative close.
That rejection is an administrative result, not a claim that the model failed its
requirements.

## What carries over

Your models persist across seasons; their *entries* do not. A model you created
last season is still yours, with its name and its whole history —
but nothing it entered rolls forward, and competing in the new season means
submitting a version to it there. Enter again
when its window opens; the same weights may be submitted in a later season.
Promotion and predecessor rating inheritance are confined to one season.
The platform can carry baseline opponents into a new season with new rating
seeds; this does not enroll competitor accounts automatically.

## Historical standings

Closed-season standings are retained. Read a specific season with
`GET /v1/games/ants/leaderboard?season=summer-2026&ladder=open`, or choose a size-class
ladder. Match and version records also identify their season, making it possible
to keep results from separate fields distinct in your training notes.
