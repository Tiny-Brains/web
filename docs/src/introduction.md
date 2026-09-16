# Introduction

TinyBrains is a competition for small neural networks that play strategy games.
The challenge is to **build the smallest brain that plays well**: choose what
it sees, train it to make useful decisions, and find out how it performs against
other competitors' models.

You train and test your entry, then submit it to the arena. TinyBrains runs the
matches and maintains the rankings. Match results and replays help you decide
what to improve for your next version.

## The first game: Ants

In **Ants**, your model commands a colony on a grid that wraps in both directions.
Your ants explore, gather food to grow the colony, defend your hills, and attack
enemy hills. You can see only the area around your living ants, and every player
chooses their moves simultaneously.

Hills decide the score: razing an enemy hill earns points, and losing one of your
own costs points. Food and combat help you reach that objective, but do not score
points themselves. A strong model must balance exploration, growth, coordination,
and defence with incomplete information about its opponents.

Start with [Ants](games/ants.md) for the game overview, then read about
[the world](games/ants/world.md), [a turn](games/ants/turn.md), and
[ending and scoring](games/ants/scoring.md).

<div class="tb-replay" data-src="tutorials/real-match.json" data-turn="1"></div>

<p class="tb-replay-caption">A finished match, replayed from its recorded actions by the same cartridge that refereed it. Every match on the ladder produces one of these.</p>

<!-- replay-visualiser: introduction-match — filled.
Asset: tutorials/real-match.json, turn 1. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## What you build

A version has two parts, published together:

- **`model.onnx`** — your trained neural network, exported in ONNX format.
- **`manifest.json`** — what your graph takes and returns, and one declarative **adapter** per
  input that converts the game's observation into that tensor.

The game defines [what your model can see](models/observation.md) and
[the actions it can take](models/actions.md). You choose the tensor representation and network
architecture. The [manifest](models/adapters.md) connects those choices to the game, in JSONLogic
with tensor operators — the same expression engine the platform runs its own logic on. The action
side is the referee's: it reads your policy head, so the channel order is a rule of the game rather
than a program you write.

Compactness includes both parts of your entry. **Your weight class is the two files' bytes, added
together** — nothing is compressed, so no way of packing your weights into the file understates it.
An operation budget and a turn deadline also apply, so an entry must be small enough for its class
and efficient enough to play.
See [model format](models/format.md), [weight classes](models/weight-classes.md),
and [limits and budgets](reference/limits.md) for the requirements.

## How to participate

1. **Choose a season.** Check the game's season rules, eligibility requirements,
   and submission window. Each submitted version belongs to one season.
2. **Learn the game and build your entry.** Train your model, export it to ONNX, and write the
   manifest that declares and feeds it.
3. **Test before submitting.** The `tinybrains` CLI links the same two libraries a node links, so
   it makes admission's measurements on your machine: the tensors your adapters build, what they
   charge, whether the graph accepts them, and a whole match through the real engine. See
   [testing before you submit](models/testing.md).
4. **Submit and upload.** Name your entry once, submit both hashes against it, and `PUT`
   `model.onnx` and `manifest.json` to the one-shot URLs the
   submission answers with — see [submitting a version](competing/submitting.md).
5. **Complete admission and the trial.** The platform re-hashes what you uploaded, reads the graph,
   probes it, and runs your manifest over the game's reference observations. A verified version then
   plays an unrated trial. Passing makes it active and eligible for ranked matches.
6. **Review and improve.** Use your match results, replays, and rankings to find
   weaknesses. Submit a new version while the season's submission window is open.

The [trial](competing/trial.md) checks whether your entry can play successfully;
**you do not have to win it**. A completed trial passes when your version stays
below the forfeit strike limit. If admission or the trial rejects your entry,
use the reported reason to diagnose the problem before submitting again.

## How competition works

Active versions are matched automatically. Each of your models has a rating in its weight
class and on the **Open ladder**, where models of different sizes compete.
Class rankings show how well you play within a size budget; Open shows how your
entry performs against the wider field. Ratings reflect match results, and the
matchmaker selects opponents and maps to establish how strong each version is.

When a new version passes its trial, it replaces that model's previous active version
in the same season. The previous version can keep competing while the candidate
is being checked. Read [the life of a version](competing/version-life.md) for
promotion and withdrawal, and [ranking](competing/ranking.md) for how ratings
carry forward between versions.

A season's submission deadline is not necessarily its final day of play. After
submissions close, matches continue until ratings settle, unless the season is
closed by an administrator. Final standings remain available, and entering a
later season requires a submission for that season. See [seasons](competing/seasons.md)
for the full lifecycle.

## Start here

This book is for competitors building and entering models. Follow the
[quickstart](quickstart.md) for the entry sequence, or begin with
[Ants](games/ants.md) to understand the decisions your model needs to make.
As you iterate, use [matches](competing/matches.md) and
[replays](competing/replays.md) to investigate performance, and the reference
chapters to look up exact requirements and rejection reasons.
