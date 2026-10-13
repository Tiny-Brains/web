# copy

Every word the site shows, one folder per language and one JSON file per page. `en-GB/` is the
original; every other folder is its translation, file for file and key for key. Rewording the site
is an edit here and nothing else: the pages read these files, and no sentence is written in the
React code.

## Which file

| File | What it holds |
|---|---|
| `common.json` | the header, menus, bell and footer; the not-found, error, sign-in and admin walls; state badges, match rows, the ladder table, the replay frame, the size/rating plot; times ("2m ago", "1st"), form controls |
| `home.json` | `/` |
| `leaderboard.json` | `/leaderboard` |
| `matches.json` | `/matches` |
| `match.json` | one match, `/matches/{id}` |
| `maps.json` | `/maps` |
| `model.json` | one model and its versions: `/models/{id}`, `/models/{id}/{version}` and `/versions/{id}` |
| `profile.json` | `/profile/{handle}` |
| `me.json` | Your models, `/me` |
| `notifications.json` | `/me/notifications` |
| `account.json` | `/me/account` |
| `submit.json` | `/submit`, and the sentences for each reason a submission is refused |
| `signin.json` | `/signin`, and the page a provider sends you back to, `/signin/callback` |
| `start.json` | Get started, `/start` |
| `faq.json` | Questions, `/faq` |
| `changelog.json` | What's new, `/changelog`; the `/feed.xml` feed is built from the English entries |
| `credits.json` | `/credits` |
| `status.json` | `/status` |
| `stories.json` | the blog, `/blog` |
| `post.json` | one post, `/blog/{slug}` |
| `season-admin.json` | a season admin's desk, `/season-admin` |
| `admin-seasons.json` | `/admin/seasons`, and the sentences for each refusal of a season, map or baseline |
| `admin-season-new.json` | `/admin/seasons/new` |
| `admin-season-rounds.json` | `/admin/seasons/rounds` |
| `admin-runners.json` | `/admin/runners` |
| `admin-users.json` | `/admin/users` |
| `admin-user.json` | one account's desk, `/admin/users/{handle}` |
| `admin-comments.json` | `/admin/comments` |
| `admin-announcements.json` | `/admin/announcements` |
| `admin-announcement-new.json` | `/admin/announcements/new` |
| `admin-notify.json` | `/admin/notify` |
| `admin-notify-new.json` | `/admin/notify/new` |
| `admin-posts.json` | `/admin/posts` |
| `admin-post-edit.json` | `/admin/posts/new` and `/admin/posts/{id}` |
| `admin-stories.json` | `/admin/stories` |
| `admin-picks.json` | `/admin/picks` |
| `admin-audit.json` | `/admin/audit` |

Within a file the keys follow the page from top to bottom, grouped by section. To find a sentence,
search the folder for a few words of it.

## Editing a text

Change the words between the quotes and leave the key before the colon alone: the key is how the
page finds the text, and a renamed or deleted key fails the build.

```json
"hero": {
  "title": "Build the *smallest* brain that plays well.",
  "lede": "Train a neural network and submit it with its manifest. Fit both in {cap} and you enter the lightest weight class, on a ladder of models your size."
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

**One and many.** A text that depends on a count comes with a form per plural category, and the
page picks one by the language's rules. English has `one` and `other`:

```json
"versions": { "one": "{n} version", "other": "{n} versions" }
```

Chinese has `other` alone; a language with `few` and `many` carries those too. Every language
gives `other`, which is also what a category the language lacks falls back to.

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

## Languages

The site speaks the languages listed in `src/lib/lang.ts` (`LANGUAGES`), one folder here for each.
A reader gets their browser's language when the site has it, else English, and can pick another in
the account menu or the footer; the choice is kept in that browser.

**Translating a text** is the same edit as rewording one, in the language's folder: the key stays,
each placeholder stays, the markup stays with the words inside it translated, and a link's target
stays. A value that is an address, a date or an identifier — under `href`, `to`, `date`, `id`, an
API code, a file name, a command — is the same in every language.

**A new key in `en-GB/` is a new key in every folder.** Until a language has it, the page says that
sentence in English, and `npm test` names what is missing.

**Adding a language:** copy `en-GB/` to a folder named by the language's BCP 47 tag (`zh-CN`,
`fr-FR`), translate the values, and add the tag with the language's own name for itself to
`LANGUAGES`. Nothing else: the site finds the folder, the switches draw it, and `npm test` holds it
to the English shape.

**Not translated:** the link-preview title and description, the feed, and what the API and the
cartridge send, which are English in every language. The competitor guide at `/docs` speaks the
same languages, from its own catalogues: `../docs/README.md`, *Languages*.

## JSON, briefly

- Text goes in straight double quotes: `"like this"`. Inside a text, write a straight double quote as
  `\"`; typographic quotes and apostrophes (`’ “ ”`), dashes (`—`), arrows and `·` need no escaping.
- A comma separates items, and there is none after the last one in a `{ }` or `[ ]`.
- There are no comments.
- The files are indented two spaces, with the characters written as they are, not as `\u` escapes.

## Checking an edit

```sh
npm run dev       # the site on localhost:5173; an edit here shows on save (data needs Soma: ../README.md)
npx tsc -b        # a renamed, deleted or misspelt key in en-GB/ fails here
npm test          # every other language against en-GB/: files, keys, placeholders, links, plural forms
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
- The competitor guide at `/docs` is `../docs/`, translated through `../docs/po/<language>.po`.

## Adding a text (for developers)

A new sentence is a new key in its page's file under `en-GB/`, and the same key in every other
folder. A page imports its English file as `en` and reads it in the reader's language inside the
component, `const T = useCopy('<page>', en)` (`common.json` as `useCopy('common', enCommon)`);
code that is not a component reads `copy('<page>', en)`. `fill()` from `src/lib/copy.ts` fills
placeholders for a plain string, `count()` picks a plural form by the language's rules, and
`<Rich>` from `src/components/ui` draws markup and placeholders that are elements. A new page gets
a new file in every folder. The rules are in `../CLAUDE.md`, under *Words*.
