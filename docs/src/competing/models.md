# Models and versions

A **model** is a lineage: one GitHub repository, a name you chose, and every
release you have entered from it. A **version** is one of those releases.

The distinction decides almost everything else on this page. Versions of one model
replace one another — a new one that passes its trial supersedes the previous one,
inherits its rating, and takes its place on the ladder. Different models never do
that to each other. They are separate entries with separate ratings that can sit
on the same ladder at the same time, and one of yours beating another of yours is
an ordinary result.

You may hold as many models as the season allows.

## The repository is the key

A model is identified by the repository it publishes from, as `owner/name`. That
is why its page has a readable address:

```
/ants/models/alice/ants-brain          the model, and its whole version history
/ants/models/alice/ants-brain/v3       one version of it
```

Three consequences follow, and all three are deliberate:

- **The repository must be one you own, and GitHub is asked.** When you create the
  model the platform calls `GET /repos/{owner}/{name}` and compares the account id
  it reports against the account you signed in with. It compares ids and not
  logins, so renaming yourself on GitHub neither costs you the models you have nor
  hands anyone the ones you left behind. A season may additionally allow named
  organisations, which is how a lab or a class enters from a shared account — that
  allowance only applies to accounts the season lists as participants.
- **One repository is one model, platform-wide.** Not one per competitor: the
  repository is the key, and the first model created on it holds it.
- **The repository cannot be changed afterwards.** A model that could move to
  another repository would be a different entry wearing this one's ratings and its
  whole match history. Its *name* is a label and is yours to edit.

## Creating one

```javascript
await fetch('/v1/games/ants/models', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ name: 'Nano probe', url: 'https://github.com/you/ants-nano' })
});
```

`url` may be a browser URL, an ssh remote, or a bare `owner/name`; they normalise
to the same stored path. A releases or tree URL is refused `repo_invalid`, because
it names a page inside a repository rather than the repository.

**The repository has to exist and be public when you create the model.** Your
release assets are fetched without a token, so a private repository can never be
admitted from; it is refused `repo_private` here rather than discovered at your
first submission. If GitHub does not answer at all the creation is refused
`repo_unverified` — a 503, not a verdict about you. Check the spelling, and if it
is right, try again shortly.

**Creating a model enters nothing.** It starts no clock, costs no attempt, and
puts nothing on a ladder. [Submitting a version](submitting.md) is what does that.

## Version numbers restart per model

Your second model's first release is v1. A lineage whose history began at v4
because you happened to have an earlier model would be a number no page could
explain.

## Retiring one

A retired model takes no new releases and frees its slot against the season's
limit on how many models one competitor may hold. It withdraws nothing: every
version keeps its rating, its rank and its place in every match it played, because
a standing is a record of what happened and not a claim about what you still
intend. Retiring is reversible, and a retired model keeps its repository — it is
not a way to restart a version series.

## What is per model, and what is per competitor

| | Scope |
|---|---|
| Version numbers | per model |
| One version in admission at a time | per model |
| A release tag entered once per season | per model |
| One active version per season | per model |
| How many models you may hold | per competitor, and the season's to set |
| How many versions may be in admission at once | per competitor, and the season's to set |
| How many models you may hold in one weight class | per competitor, and the season's to set |
| How often you may submit | per model, and the season's to set |

The four on the right are all season rules and all absent by default. What a given
season actually sets is on its own page, and `GET /v1/games/{game}/submission`
reports your standing against every one of them before you make a request.

## More

- [Submitting a version](submitting.md) — putting a release under a model
- [The life of a version](version-life.md) — what happens to it after that
- [Seasons](seasons.md) — the rules a season may declare
