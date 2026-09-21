# Models and versions

A **model** is a lineage: a name you chose, and every version you have entered
under it. A **version** is one submission: two files and their two hashes.

Versions of one model replace one another. A new one that passes its trial
supersedes the previous one, inherits its rating, and takes its place on the
ladder. Different models never replace each other: they are separate entries with
separate ratings, they can sit on the same ladder at the same time, and one of
yours beating another of yours is an ordinary result.

You may hold as many models as the season allows.

## The name is the key, and it is yours

Your model's name identifies it, and must be unique among *your own* entries for a
game. The site addresses its page by id:

```
/models/{id}          the model, and its whole version history
/models/{id}/v3       one version of it
```

- **Two competitors may hold the same name.** The platform decides nothing on a
  name. Your GitHub account is your identity: signing in establishes it, and that
  is the only thing GitHub does here.
- **You can edit the name at any time.** The name is a label and the id is the
  address, so a rename breaks no link and moves no rating.
- **No repository is involved.** A model is tied to no GitHub repository: every
  ceiling on a competitor is a season rule, none of them mentions one, and creating
  a model never waits on GitHub.

## Creating one

```javascript
await fetch('/v1/games/ants/models', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ name: 'Nano probe' })
});
```

That is the whole request. The platform refuses a name you already hold in this
game with `model_name_taken`; a name another competitor holds does not matter.

**Nothing on this path reaches GitHub**, so creating a model works even while
GitHub is down.

**Creating a model enters nothing.** It starts no clock, costs no attempt, and
puts nothing on a ladder; [submitting a version](submitting.md) does that.

## Version numbers restart per model

Your second model's first version is v1. Numbering across models would start a
new lineage at v4 because of an unrelated earlier model, and no page could explain
that number.

The platform assigns the number, one past this model's highest; you do not choose
it.

## Retiring one

A retired model takes no new versions and frees its slot against the season's
limit on how many models one competitor may hold. Retiring withdraws nothing: every
version keeps its rating, its rank and its place in every match it played, since a
standing records what happened. You can reverse a retirement, and it does not
restart the version series.

## What is per model, and what is per competitor

| | Scope |
|---|---|
| Version numbers | per model |
| One version in admission at a time | per model |
| Duplicate weights refused | against other competitors' models in the game or the season, or against every other model, and the season's to set |
| One active version per season | per model |
| How many models you may hold | per competitor, and the season's to set |
| How many versions may be in admission at once | per competitor, and the season's to set |
| How many versions you may enter in a season | per model or per competitor, and the season's to set |
| How many models you may hold in one weight class | per competitor, and the season's to set |
| How often you may submit | per model, and the season's to set |

The six rows the season sets are season rules, and all are absent by default. A
season's own page shows the ones it sets. `GET /v1/games/{game}/submission` reports your
standing against the model limit, the admission limit, the version caps and the submission
interval before you make a request. The submission itself answers the duplicate-weights rule, since it
needs your weights' hash, and admission applies the per-class limit once it has measured
your class.

## More

- [Submitting a version](submitting.md): putting a version under a model
- [The life of a version](version-life.md): what happens to it after that
- [Seasons](seasons.md): the rules a season may declare
