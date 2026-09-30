// WHAT TO INDEX, IN ONE PLACE. /sitemap.xml is the application's fixed addresses plus every
// chapter of the book, and the two halves are found in different ways: the routes are a list
// here, and the chapters are whatever mdBook wrote. This file is the only generator, so the
// dev server, `vite build` and the image cannot disagree about a path.
//
// THE BOOK IS NOT IN THIS REPOSITORY'S NODE BUILD. `.dockerignore` keeps docs/ out of the image's
// node context on purpose and the rendered book arrives as its own artifact, so `vite build`
// writes the application's half alone and the Dockerfile runs this again, with the book in hand,
// over the top. Nothing is lost by that: same generator, more input.
//
// LINKS ARE PATHS, because this bundle knows no host -- a deployment pins an image by tag and
// serves it wherever it likes. nginx.conf's /sitemap.xml location makes each one absolute per
// request, the way it does the feed's links and the unfurl image.
//
// THERE IS NO <lastmod>, AND THAT IS DELIBERATE. Google uses it only where it is consistently
// true, and nothing here can tell the truth: the image builds with no .git, so any date this
// could write would be the build's, claiming every page changed on every release. A sitemap
// without one is valid and is believed; one that cries wolf is ignored.

import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

// THE APPLICATION'S FIXED ADDRESSES, and only those. A match, a model, a version and a profile
// are reachable by crawling from the ladder and the match list, and their ids belong to one
// deployment; a post's slug is the API's and no build can know it. Signed-in and admin pages are
// not here and are refused in robots.txt: a crawler gets a sign-in wall, which is not a page.
//
// THIS IS App.tsx's PUBLIC ROUTES. A new one is a line here -- and, if it is a new first segment,
// a line in nginx.conf's $spa_unknown map too, or it answers 404 to a crawler.
export const APP_PATHS = [
  '/',
  '/leaderboard',
  '/matches',
  '/maps',
  '/blog',
  '/start',
  '/faq',
  '/changelog',
  '/credits',
  '/status',
  '/submit',
]

// mdBook writes these beside the chapters and not one of them is a page to offer. print.html is
// the whole book on one address -- a duplicate of every chapter at once, which is why the theme
// marks it noindex -- and 404.html answers with a 404 wherever it is served from.
const NOT_A_CHAPTER = new Set(['404.html', 'print.html', 'toc.html'])

/**
 * Every chapter mdBook rendered, as a site path. The root chapter answers at `/docs/`, which is
 * what the application links and what nginx.conf declares canonical for it; every other chapter
 * is its `.html` address, the form mdBook's own navigation uses.
 *
 * @param {string | undefined} dir the rendered book (mdBook's `build-dir`), or undefined
 * @returns {string[]} sorted site paths, or [] when the book has not been built
 */
export function bookPaths(dir) {
  if (!dir || !existsSync(join(dir, 'index.html'))) return []

  /** @type {string[]} */
  const found = []
  /** @param {string} at */
  const walk = (at) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name)
      if (statSync(path).isDirectory()) {
        walk(path)
        continue
      }
      if (!name.endsWith('.html') || NOT_A_CHAPTER.has(name)) continue
      const rel = relative(dir, path).split(sep).join('/')
      found.push(rel === 'index.html' ? '/docs/' : `/docs/${rel}`)
    }
  }
  walk(dir)
  return found.sort()
}

const esc = (/** @type {string} */ s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The sitemap, as the bundle carries it: paths, one `<url>` each.
 *
 * @param {{ bookDir?: string }} [opts]
 * @returns {string}
 */
export function sitemapXml(opts = {}) {
  const paths = [...APP_PATHS, ...bookPaths(opts.bookDir)]
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((p) => `<url><loc>${esc(p)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n')
}

// `node scripts/sitemap.mjs --book docs/book --out dist/sitemap.xml`, which is how the image
// rewrites the bundle's own copy once the book is beside it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (/** @type {string} */ name) => {
    const at = process.argv.indexOf(name)
    return at === -1 ? undefined : process.argv[at + 1]
  }
  const out = arg('--out')
  const xml = sitemapXml({ bookDir: arg('--book') })
  if (out) {
    writeFileSync(out, xml)
    process.stdout.write(`sitemap: ${xml.match(/<url>/g)?.length ?? 0} addresses -> ${out}\n`)
  } else {
    process.stdout.write(xml)
  }
}
