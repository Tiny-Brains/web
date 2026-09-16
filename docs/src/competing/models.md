# Models and versions

A **model** is a lineage: a name you chose, and every version you have entered
under it. A **version** is one submission — two files and their two hashes.

The distinction decides almost everything else on this page. Versions of one model
replace one another — a new one that passes its trial supersedes the previous one,
inherits its rating, and takes its place on the ladder. Different models never do
that to each other. They are separate entries with separate ratings that can sit
on the same ladder at the same time, and one of yours beating another of yours is
an ordinary result.

You may hold as many models as the season allows.

## The name is the key, and it is yours

A model is identified by its name, unique among *your own* entries for a game. Its
page is addressed by id:

```
/models/{id}          the model, and its whole version history
/models/{id}/v3       one version of it
```

Three consequences follow, and all three are deliberate:

- **Two competitors may hold the same name.** A name is not an identity and
  nothing is decided on one. Who you are is your GitHub account, which is what
  signing in establishes — and that is the only thing GitHub does here.
- **The name is yours to edit, at any time.** It is a label, not an address, so
  changing it breaks no link and moves no rating.
- **There is no repository to own.** A model used to be keyed by a GitHub
  repository, verified at creation against `GET /repos/{owner}/{name}`. That
  requirement limited nothing — every ceiling on a competitor is a season rule and
  none of them mentioned a repository — while the check failed closed, so a
  rate-limited GitHub stopped anyone creating a model at all.

## Creating one

```javascript
await fetch('/v1/games/ants/models', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ name: 'Nano probe' })
});
```

That is the whole request. A name you already hold in this game is refused
`model_name_taken`; a name another competitor holds is not your problem.

**Nothing on this path reaches GitHub**, so creating a model works whether or not
GitHub does.

**Creating a model enters nothing.** It starts no clock, costs no attempt, and
puts nothing on a ladder. [Submitting a version](submitting.md) is what does that.

## Version numbers restart per model

Your second model's first version is v1. A lineage whose history began at v4
because you happened to have an earlier model would be a number no page could
explain.

You do not choose the number: the platform assigns it as one past this model's
highest. There used to be a `release_tag` you typed alongside it, naming a GitHub
release; nothing verified it, so it labelled nothing the platform could check.

## Retiring one

A retired model takes no new versions and frees its slot against the season's
limit on how many models one competitor may hold. It withdraws nothing: every
version keeps its rating, its rank and its place in every match it played, because
a standing is a record of what happened and not a claim about what you still
intend. Retiring is reversible, and it is not a way to restart a version series.

## What is per model, and what is per competitor

| | Scope |
|---|---|
| Version numbers | per model |
| One version in admission at a time | per model |
| One set of weights entered once per season | per competitor, and the season's to set |
| One active version per season | per model |
| How many models you may hold | per competitor, and the season's to set |
| How many versions may be in admission at once | per competitor, and the season's to set |
| How many models you may hold in one weight class | per competitor, and the season's to set |
| How often you may submit | per model, and the season's to set |

The four on the right are all season rules and all absent by default. What a given
season actually sets is on its own page, and `GET /v1/games/{game}/submission`
reports your standing against every one of them before you make a request.

## More

- [Submitting a version](submitting.md) — putting a version under a model
- [The life of a version](version-life.md) — what happens to it after that
- [Seasons](seasons.md) — the rules a season may declare
