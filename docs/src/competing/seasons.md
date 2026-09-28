# Seasons

A season is a competition for one game. A platform administrator creates it, and each version you
submit belongs to one season and plays only within that field. **Seasons overlap**: a game may run
several live seasons at once, public and private, and each has its own boards, baselines,
participants, runners, standings and podium.

A season has a **name** its administrator gives it, such as "Summer 2026", and a **slug** the
platform derives from the name, `summer-2026`. Every link, every route and every record addresses
the season by its slug. Neither ever changes, so a link to a season keeps working.

## Which season a request is about

A read that names no season, and a submission that names none, is about the game's **featured**
season: the public season a platform administrator has featured, else the newest live public
season, else the newest public season. A private season is never anyone's default.

To read or enter any other season, name it by its slug: `?season=<slug>` on a read, and `season` in
a submission's body. The site's season switcher does the same, and its form submits to the season
the page is showing.

## Who may see a season, and who may enter it

A season is **public** or **private**, and its entry is **open** or **restricted**. A private
season is always restricted. Every season object carries both as `visibility` and `entry`.

| | Who sees it | Who may enter |
|---|---|---|
| Public, open | everyone | anyone signed in |
| Public, restricted | everyone | its participants |
| Private (restricted) | its participants, its season administrators and platform administrators | its participants |

**A restricted season admits its participants.** Its season administrators add them, and can do so
while the season runs, so a late member of a class can still enter. Each participant is a sign-in
provider and a login on it. When an account already holds that identity, the row is pinned to that
account at once; otherwise it waits and is pinned when the identity first signs in. A row with no
login admits every identity of that provider. Removing a participant stops their further
submissions at once and, in a private season, their view of it; a version already on the ladder
stays. The roster is not public: only the season's administrators read it.

**A season may also restrict which sign-in providers may enter it.** An identity from another
provider cannot enter, even where its login is listed. A refused account gets `not_a_participant`;
if you hold several sign-in identities, check that you signed in with one the season admits.

**To anyone else, a private season does not exist.** Every public route that names it answers as it
would for an unknown season, and its versions and matches answer `404`. Its members read it through
the signed-in copies of the public reads under `/v1/private/...`, which take the same parameters and
return the same shapes, and are never cached ([HTTP API](../reference/api.md#private-seasons)). Its
matches carry comments among the same people, and a comment there never shows on anyone's public
profile.

## Who runs a season

A **platform administrator** creates the season, with its window, its rules, its visibility and
entry, which sign-in providers may enter and which runners play it. A platform administrator also
features a season, runs its [rounds and finals](ranking.md#rounds-and-score-resets), and assigns
its **season administrators**, when it is created or later.

A season administrator runs one season: its participants, its boards and baselines, its own runner
keys and runners, messages to the season's people, and its audit log. They may edit its window,
rules and weight classes before it opens, and they may request its close. A season administrator
is an ordinary competitor everywhere else, but **may not enter a season they administer**: a
submission to it is refused with `season_admin_cannot_enter`, because their standing would be judged
by themselves.

## Who plays a season

A season's **fleet** policy says which runners play its matches (`matches`) and which admit its
submissions (`admissions`), each `own`, `platform` or `both`. `platform` is the platform's own
fleet. `own` is the season's runners, started from keys its season administrators mint on the
season's page; such a key serves that season for ever and no other. A platform administrator can
change the policy while the season runs. While the runners a season allows are all down, its matches
wait in the queue and its submissions wait in `testing`.

Waiting costs a submission none of its attempts, so nothing is lost by waiting a while. But a
submission is refused for running out of time if it waits long enough, and that says nothing about
the model — so the season's page says outright when submissions are queued and no machine the
season's policy allows has called in, and `GET /v1/status` answers the same question for the
platform (`admitters` beside `admission_queue`).

## The submission window

`GET /v1/games/ants/seasons` lists the public seasons, and `GET /v1/private/games/ants/seasons`
adds the private ones you may see: each one's name and slug, state, visibility and entry,
submission opening and closing times, engine identity, rules, and a summary of its boards and
baselines, newest first.

| State | Submissions | Competition |
|---|---|---|
| `scheduled` | Not yet accepted | Waiting for the opening time |
| `open` | Accepted, within the rules | Versions may enter and play |
| `settling` | Closed to new submissions | Existing work and matches continue |
| `closed` | Not accepted | Historical standings kept |

The opening time is inclusive and the closing time exclusive, so submit before the closing
timestamp. A submission that arrives in time can still be in admission or its trial when the window
ends. The settling period lets that work finish, unless the season's close is requested first.

## The rules a season declares

A season carries a rules document that describes the whole contest. Every rule is optional. A season
that declares none plays under the platform's own defaults, so two seasons on an unchanged platform
can run different contests. The rules are fixed once the season opens. Who may enter is not a rule:
it is the season's entry and its participants, above.

**How much you may enter**

- How many **models** you may enter into the season.
- How many of your **versions** may be in admission at once, across every model.
- How many **versions** you may enter, per model or in total.
- A **cooldown** between one model's submissions.
- How many of your models may sit in one weight class: a season may declare it, and the platform
  does not enforce it yet.

**What may be entered**

- Which **weight classes** the season runs. Admission takes the smallest class the season runs
  that fits your size, so a model measuring below a class the season skips lands in the next one
  up. A model that fits only a class the season does not run is rejected with `CLASS_NOT_OFFERED`.
- The **ONNX surface**: an opset window, an operator allowlist, a parameter ceiling and an adapter
  instruction budget. The operator list can only narrow the platform's, since a wider one would
  admit an operator the runtime cannot execute, which would then fail at play; the opset window and
  the budget are the season's own numbers.
- Whether **duplicate weights** are refused, and in what scope: weights another competitor entered
  anywhere in the game, weights another competitor entered this season, or weights any other model
  holds, yours included.

**How the ladder plays and how it is read**

- Which **boards** the season plays, how much **cross-class** play connects the Open ladder, and how
  many matches a version gets. The boards are the season's own: its administrators upload them, and
  `GET /v1/games/ants/seasons/{slug}/maps` lists each one from the moment it arrives. Unlike the
  rules, the boards can change while a season runs. An administrator can put a board in play or
  take one out; the platform cancels a match queued on a board taken out, and one already running
  finishes and counts. Design for the game's limits, since the boards a season has today can change
  ([The maps](../games/ants/maps.md)).
- Whether two of **your own models may meet**. They may not unless a season says otherwise, because
  a match between two of your models would move rating between them for free.
- How many of your models may appear on the ladder at all.
- The **rating** constants, what counts as settled, and whether the season closes on its own once
  it has settled or only when an administrator asks.

Read the returned `rules` before you assume any of this. `GET /v1/games/{game}/submission`, with
`?season=<slug>` or for the featured season, reports the window, whether you may enter, and the
limits on models, versions and cooldown *before* you make a request, in the words the refusal would
use. The submission itself answers the duplicate-weights rule, and admission judges the class and
ONNX rules once it has measured your graph.

## How a season ends

After the submission window ends, the platform closes the season on its own once every candidate has
a verdict, the outstanding games and counting are done, and the active competitors' ratings meet the
settling policy on Open. The submission deadline sets no fixed time for the final match. A season
played to [finals](ranking.md#finals) closes instead once every entry has played the finals' matches
and nothing is left in flight.

The season's administrators or a platform administrator can also request its close. Soma's withdraw
clock then marks the season closed, rejects waiting candidates with `SEASON_CLOSED`, and cancels
queued matches. Matches already claimed or running can still finish and count into that season, so
the standings can take those last updates after the close. A `SEASON_CLOSED` rejection records an
administrative decision and says nothing about whether your model met its requirements.

## Moving to a new season

Your models persist across seasons, and their *entries* stay behind. A model you created last season
is still yours, with its name and its whole history, but none of its entries roll forward: a new
season starts with no boards, no baselines, no participants and no versions. Promotion and
predecessor rating inheritance stay within one season, and the platform enrolls no competitor
account in a season for you.

The new season's administrators bring its boards and baselines in, uploading them or importing them
from another season. An imported board arrives switched off, and switching it on checks it again
under the new season's engine. An imported baseline is admitted again under the new season's rules
and lands switched off. A baseline with the same name in another season is the same opponent,
starting again from the prior.

**You bring your entries in.** Submit new files to the season as usual, or re-enter an entry as it
stood in an earlier season:

```javascript
await fetch('/v1/submissions/reenter', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    game: 'ants',
    model: '<your model_id>',
    season: '<the slug of the season it enters>',
    from: '<the slug of the season it stood in>'
  })
});
```

Re-entry takes the entry's standing in `from` (its active version there, or the newest it had in
play) and enters the same bytes into `season`, with nothing to upload. It is an ordinary submission
from there: the new season's entry, caps, cooldown, duplicate-weights rule and window all apply, and
the new `testing` version goes through [admission](admission.md) and a [trial](trial.md) again
under the new season's classes, memory and engine. The answer is `201` with the new version, or
`200` when that version is already in flight. The refusals are a submission's, plus
`404 nothing_to_reenter` when the entry had no version in play in `from`.

## Historical standings

The platform keeps a closed season's standings. Read one with
`GET /v1/games/ants/leaderboard?season=summer-2026&ladder=open`, or filter it to a size class. Match
and version records name their season too, so you can keep results from separate fields apart in
your training notes.
