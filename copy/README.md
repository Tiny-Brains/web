# copy

Every word the site shows, one JSON file per page. Rewording the site is an edit here and nothing
else: the pages read these files, and no sentence is written in the React code.

## Which file

| File | What it holds |
|---|---|
| `common.json` | the header, menus, bell and footer; the not-found, error, sign-in and admin walls; state badges, match rows, the ladder table, the replay frame, the size/rating plot; times ("2m ago"), form controls |
| `home.json` | `/` |
| `leaderboard.json` | `/leaderboard` |
| `matches.json` | `/matches` |
| `match.json` | one match, `/matches/{id}` |
| `maps.json` | `/maps` |
| `model.json` | one model, `/models/{id}` |
| `version.json` | one version, `/models/{id}/v{n}` and `/versions/{id}` |
| `profile.json` | `/profile/{handle}` |
| `me.json` | Your models, `/me` |
| `notifications.json` | `/me/notifications` |
| `account.json` | `/me/account` |
| `submit.json` | `/submit`, and the sentences for each reason a submission is refused |
| `signin.json` | the page GitHub sends you back to, `/signin/callback` |
| `start.json` | Get started, `/start` |
| `faq.json` | Questions, `/faq` |
| `changelog.json` | What's new, `/changelog`, and the `/feed.xml` feed built from the same entries |
| `credits.json` | `/credits` |
| `status.json` | `/status` |
| `admin-seasons.json` | `/admin/seasons`, and the sentences for each refusal of a season, map or baseline |
| `admin-season-new.json` | `/admin/seasons/new` |
| `admin-runners.json` | `/admin/runners` |
| `admin-users.json` | `/admin/users` |

Within a file the keys follow the page from top to bottom, grouped by section. To find a sentence,
search the folder for a few words of it.

## Editing a text

Change the words between the quotes and leave the key before the colon alone: the key is how the
page finds the text, and a renamed or deleted key fails the build.

```json
"hero": {
  "title": "Build the *smallest* brain that plays well.",
  "lede": "Train a neural network and submit it with its manifest. Fit the two in {cap} and you enter the lightest weight class, with a ladder of its own."
}
```

**Placeholders.** `{cap}`, `{date}`, `{n}`, `{model}` and the like are filled in by the page with a
live value — a name, a number, a date, sometimes a link or a badge. Keep each one a text already
has, spelled exactly; you can move it within the sentence. A placeholder the page does not fill
shows on the page as typed, so a new one needs a code change too.

**Markup.** Four marks are drawn where a text already uses markup or a placeholder standing for a
link or badge:

| Write | Shows |
|---|---|
| `*words*` | *italic* |
| `**words**` | **bold** |
| `` `words` `` | `code` |
| `[words](/leaderboard)` | a link: change the words, keep the target |

Buttons, tab titles, tooltips, placeholders in form fields and screen-reader labels are plain text,
where `*` and `` ` `` show as typed. Two hints show backticks on purpose: New season's
*Duplicate weights* and the `map_invalid` refusal in `admin-seasons.json`. After adding markup to a
text that had none, look at the page.

**One and many.** A text that depends on a count comes as a pair, and the page picks one:

```json
"versions": { "one": "{n} version", "other": "{n} versions" }
```

**Lists.** The FAQ's questions, `/start`'s steps, the credits, the footer's columns and the What's
new entries are arrays: adding, removing or reordering an item is an edit here and needs no code.

```json
{ "q": "Can I enter more than one model?", "a": "Yes. …", "more": [{ "label": "Models and versions", "href": "/docs/competing/models" }] }
```

A What's new entry is `{ "date": "2026-09-21", "title": …, "body": …, "href": … }`, `href` optional.
Keep `entries` newest first: the page sorts them by date, but the feed lists them in file order.

**Refusals.** The sentences for what the API refuses are keyed by the code it answers with
(`season_not_open`, `map_bad_header`, …): `refusals` in `submit.json` and `me.json`, and each
`said` under `refusals` in `admin-users.json` and `admin-seasons.json`. Reword the sentence; the code
on the left is the API's.

## JSON, briefly

- Text goes in straight double quotes: `"like this"`. Inside a text, write a straight double quote as
  `\"`; typographic quotes and apostrophes (`’ “ ”`), dashes (`—`), arrows and `·` need no escaping.
- A comma separates items, and there is none after the last one in a `{ }` or `[ ]`.
- There are no comments.
- The files are indented two spaces, with the characters written as they are, not as `\u` escapes.

## Checking an edit

```sh
npm run dev       # the site on localhost:5173; an edit here shows on save (data needs Soma: ../README.md)
npx tsc -b        # a renamed, deleted or misspelt key fails here
npm run lint      # fails when words are typed straight into a page instead of here
```

## Not here

- The link-preview title and description (what a shared link unfurls to) are in `../index.html` and
  `../nginx.conf`, which must match each other character for character: change both.
- The words on the preview image are in `../scripts/og-image.html`, rendered into `public/og.png`.
- What the API sends: notification subjects and descriptions, a version's rejection reason, a
  runner key's note. Those are Soma's (`soma/workflows/`).
- What the game sends: the Ants story on the home page and everything inside the replay viewer.
  Those are the cartridge's (`ants/`).
- The competitor guide at `/docs` is `../docs/`.

## Adding a text (for developers)

A new sentence is a new key in its page's file, read as `T.section.key` (the page imports its file
as `T`, and `common.json` as `common`). `fill()` from `src/lib/copy.ts` fills placeholders for a
plain string, `count()` picks one of a pair, and `<Rich>` from `src/components/ui` draws markup and
placeholders that are elements. A new page gets a new file here. The rules are in `../CLAUDE.md`,
under *Words*.
