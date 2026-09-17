// What changed on the platform, newest first: the entries a competitor can see the effect of.
//
// Seasons are NOT listed here -- the API knows when each opened and closed, and the What's new
// page reads them from it -- so this file carries what the API does not know: an engine
// cutover, a baseline arriving, a page changing. /feed.xml is built from this file at build
// time (vite.config.ts), so an entry here is also a feed item. Dates are the day the change
// reached the ladder, as each repository's README records it; a date this file cannot source
// from a README is a date it does not carry.

export type Entry = {
  /** ISO date, the day it reached the ladder. */
  date: string
  title: string
  body: string
  /** A page of this site, or a chapter of the book. */
  href?: string
}

export const CHANGELOG: Entry[] = [
  {
    date: '2026-09-17',
    title: 'A notifications bell, one row for any match, and a site you can find your way round',
    body: 'Signed in, a bell in the header counts what happened to your models since you last looked — admitted, rejected, a trial passed, a first place, a strike, a season closing — and new ones arrive as they happen. Choose which kinds on your account page, and allow this browser to show them while the tab is in the background. Every match now reads the same whatever its seat count: when and where, then up to four players in finishing order with their scores. The header holds the game and season, breadcrumbs take you up a level, your models live at /me, and your account and sessions at /me/account.',
    href: '/me/notifications',
  },
  {
    date: '2026-09-16',
    title: 'The leaderboard and the matches, without the reading',
    body: 'Both pages open on their rows now. A weight class is a small meter — one bar filled for nano, five for large — and a baseline, a provisional rating and a match still counting are icons, each named when you hover it. A match is its score: name 0 – 3 name, with no sentence under it, and the match page is the board and one row a seat. The size-against-rating plot is a second view of the ladder, one click from its table.',
    href: '/matches',
  },
  {
    date: '2026-09-15',
    title: 'One manifest instead of an adapter, and you upload the files',
    body: 'A submission is model.onnx and manifest.json now. The manifest declares what your graph takes and returns — a dimension may be a name, so one entry plays every board size a season runs — and carries one adapter expression per input. You no longer write the output side: the referee reads your policy head, because the channel order is a rule of the game. The size metric is the two files’ bytes rather than a compression of some of them, so no way of packing weights into a file can understate it, and every class cap moved with it. And because the platform stores no bytes of its own, a submission answers with two one-shot upload URLs for you to PUT the files to.',
    href: '/docs/models/adapters',
  },
  {
    date: '2026-09-11',
    title: 'A starter you can submit unchanged',
    body: 'Tiny-Brains/ants-starter: a trained nano entry — 85.8% agreement with the teacher the baselines are distilled from — its generated manifest, and train.py, which retrains it in one command on the baselines’ own recipe. Clone it, play it, make it yours; step 1 of Get started is that clone.',
    href: 'https://github.com/Tiny-Brains/ants-starter',
  },
  {
    date: '2026-09-11',
    title: 'The site says what a match came to, and draws the ladder',
    body: 'Every match row and page says what happened in words. The leaderboard draws strongest play per byte over the class bands, names the leader of each class, and carries a sparkline of each row’s last dozen ratings. /start shows one turn end to end and every command on it runs. A moment in a match is an address.',
    href: '/leaderboard',
  },
  {
    date: '2026-09-10',
    title: 'Three trained baselines take the ladder',
    body: 'nano-bc, 2,930 parameters in 5.9 KiB, and micro-bc, 24,001 parameters in 44.6 KiB, both distilled from one scripted teacher over 250,000 seat-turns; and micro-percell, the control with the same capacity and no receptive field. They replace untrained fixtures that held every ant still, so a trial now proves something.',
    href: 'https://github.com/Tiny-Brains/ants-baselines',
  },
  {
    date: '2026-09-10',
    title: 'The engine the ladder plays is one artifact',
    body: 'The Ants cartridge moved to digest 0807b641… as a patch. The ladder, the loader and the browser’s viewer all take it from one image, so the component that referees a match is the one that re-simulates it.',
    href: '/docs/games/ants',
  },
]
