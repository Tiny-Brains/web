# Introduction

TinyBrains is a competition for small neural networks that play strategy games. Your goal is to
**build the smallest brain that plays well**: choose what it sees, train it to make useful
decisions, and find out how it performs against other competitors' models.

You train and test your entry, then submit it to the arena. TinyBrains runs the matches and keeps
the rankings, and you read the results and replays to decide what your next version should improve.

## The first game: Ants

In **Ants**, your model commands a colony on a grid that wraps in both directions. Your ants
explore, gather food to grow the colony, defend your hills and attack enemy hills. You see only the
area around your living ants, and all players choose their moves at the same time.

Hills decide the score: you earn points for razing an enemy hill and lose one for each of your own
hills you lose. Food and combat score nothing; they are how you get to the hills. A strong model
balances exploration, growth, coordination and defence while it sees only part of what its
opponents do.

Start with [Ants](games/ants.md) for the game overview, then read [the world](games/ants/world.md),
[a turn](games/ants/turn.md) and [ending and scoring](games/ants/scoring.md).

<div class="tb-replay" data-src="tutorials/real-match.json" data-turn="1"></div>

<p class="tb-replay-caption">A finished ladder match, replayed from its recorded actions by the cartridge that refereed it. The platform records one of these for every match on the ladder.</p>

<!-- replay-visualiser: introduction-match — filled.
Asset: tutorials/real-match.json, turn 1. Regenerate with tutorials/build.sh.
The prose above the slot stands alone: a page whose viewer fails to load still teaches the rule.
-->

## What you build

A version has two parts, which you submit together:

- **`model.onnx`**: your trained neural network, exported as ONNX.
- **`manifest.json`**: your graph's inputs and outputs, and one declarative **adapter** per input
  that turns the game's observation into that tensor.

The game defines [what your model can see](models/observation.md) and
[the actions it can take](models/actions.md). You choose the tensor representation and the network
architecture, and the [manifest](models/adapters.md) connects those choices to the game. You write
it in JSONLogic with tensor operators, the expression engine the platform runs its own logic on.
The referee owns the action side: it reads your policy head, so the channel order is a rule of the
game and you write no program for it.

Size counts both files. **Your weight class is the two files' bytes, added together.** The platform
compresses nothing, so no way of packing your weights into the file understates the total. An
operation budget and a turn deadline also apply, and an entry has to fit its class and play within
both. [Model format](models/format.md), [weight classes](models/weight-classes.md) and
[limits and budgets](reference/limits.md) give the requirements.

## How to participate

1. **Choose a season.** Read the game's season rules, eligibility requirements and submission
   window. Each version you submit belongs to one season.
2. **Learn the game and build your entry.** Train your model, export it to ONNX, and write the
   manifest that declares and feeds it.
3. **Test before submitting.** The `tinybrains` CLI links the two libraries a node links, so it
   takes admission's measurements on your machine: the tensors your adapters build, what they
   charge, whether the graph accepts them, and a whole match through the real engine. See
   [testing before you submit](models/testing.md).
4. **Submit and upload.** Name your entry once, submit both hashes against it, and `PUT`
   `model.onnx` and `manifest.json` to the one-shot URLs the submission returns. See
   [submitting a version](competing/submitting.md).
5. **Complete admission and the trial.** The platform re-hashes what you uploaded, reads the graph,
   probes it, and runs your manifest over the game's reference observations. A verified version
   then plays an unrated trial, and a version that passes becomes active and enters ranked matches.
6. **Review and improve.** Find weaknesses in your match results, replays and rankings, and submit a
   new version while the season's submission window is open.

The [trial](competing/trial.md) checks that your entry can play, and **you do not have to win it**:
a completed trial passes if your version stays below the forfeit strike limit. If admission or the
trial rejects your entry, read the reported reason and fix the problem before you submit again.

## How competition works

The matchmaker pairs active versions without any action from you. Each of your models has a rating
in its weight class and on the **Open ladder**, where models of different sizes compete. Your class
ranking shows how well you play within a size budget, and Open shows how your entry does against
the wider field. Ratings come from match results, and the matchmaker picks opponents and maps to
measure how strong each version is.

A new version that passes its trial replaces that model's previous active version in the same
season, and the previous version can keep competing while the platform checks the candidate.
[The life of a version](competing/version-life.md) covers promotion and withdrawal, and
[ranking](competing/ranking.md) covers how ratings carry forward between versions.

Play can continue past a season's submission deadline. After submissions close, matches go on until
ratings settle, unless an administrator closes the season. Final standings stay available, and you
enter a later season by submitting to it. [Seasons](competing/seasons.md) has the full lifecycle.

## Start here

This book is for competitors who build and enter models. Follow the [quickstart](quickstart.md) for
the entry sequence, or begin with [Ants](games/ants.md) for the decisions your model has to make.
As you iterate, [matches](competing/matches.md) and [replays](competing/replays.md) show how your
versions play, and the reference chapters give exact requirements and rejection reasons.
