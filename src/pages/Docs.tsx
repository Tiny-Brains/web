// `/docs/*` — what answers when the book is not mounted.
//
// The book is its own repository (Tiny-Brains/docs) and is served BESIDE this application, not
// by it: nginx answers /docs/ from a directory the deployment mounts, and the Vite dev server
// from ../docs/book when one has been built. So on a stack that has the book, this page is never
// reached -- the request never arrives at the SPA. On one that does not, every Docs link, footer
// link and "→ Quickstart" used to land on the generic 404 and tell a newcomer the page was not
// part of the site. It is; it is just not here.
//
// The chapter is still readable: a book path maps one-to-one onto a source file under src/, so
// the page hands the reader the same chapter on GitHub -- the text without the replays.

import { useLocation } from 'react-router-dom'
import { chapterSource } from '../lib/book'
import { Shell } from '../components/Shell'
import { KeyValues } from '../components/ui'

export default function Docs() {
  const location = useLocation()
  const { chapter, source, book } = chapterSource(location.pathname)
  const root = chapter === 'introduction'

  return (
    <Shell nav="docs">
      <section className="mid">
        <div className="code">docs · not mounted here</div>
        <h1>The book is not mounted on this deployment.</h1>
        <code className="badurl">{location.pathname}</code>
        <p>
          The competitor guide is its own repository, and a deployment serves its rendered pages at this
          address. This one does not have them, so the {root ? 'book' : 'chapter you asked for'} is on
          GitHub instead — the same text, without the embedded replays.
        </p>
        <div className="acts">
          <a className="btn primary lg" href={source} rel="noopener">
            {root ? 'Read the book on GitHub ↗' : `Read ${chapter} on GitHub ↗`}
          </a>
          {root ? null : (
            <a className="btn lg" href={book} rel="noopener">
              The whole book ↗
            </a>
          )}
        </div>
        <KeyValues
          className="what"
          items={[
            {
              key: 'Why it is not here',
              value:
                'The book is built from Tiny-Brains/docs and mounted beside the site by the deployment. Nothing in the site itself carries it.',
            },
            {
              key: 'If you run this stack',
              value:
                'Build it with mdbook build in docs/ and bring the web container up again. The Vite server serves ../docs/book the moment it exists.',
            },
          ]}
        />
      </section>
    </Shell>
  )
}
