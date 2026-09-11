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
