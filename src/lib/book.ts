// The book's paths, and where each one's source lives.

const BOOK = 'https://github.com/Tiny-Brains/docs'

/** The chapter a book path names, and its source on GitHub. A book path maps one-to-one onto a
 *  file under src/: `/docs/models/adapters/` and `/docs/models/adapters.html` are both
 *  `src/models/adapters.md`, and the root is the introduction. Anything that is not a chapter
 *  path falls back to the introduction rather than building a link to nothing. */
export function chapterSource(pathname: string): { chapter: string; source: string; book: string } {
  let rest = pathname.replace(/^\/docs\/?/, '').replace(/\/+$/, '').replace(/\.html$/, '')
  if (rest === '' || rest === 'index' || rest === 'print' || !/^[a-z0-9][a-z0-9/_-]*$/.test(rest)) {
    rest = 'introduction'
  }
  return { chapter: rest, source: `${BOOK}/blob/main/src/${rest}.md`, book: BOOK }
}
