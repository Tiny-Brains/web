// `/faq` — the dozen questions a newcomer asks, each answered in a few lines and handed to the
// chapter that answers it in full.
//
// The book is the authority and this page does not compete with it: every answer here is short,
// says nothing the book does not, and links the chapter. Numbers a season owns (the caps) are not
// written here -- the home page and the leaderboard draw them from the season -- and numbers the
// deployment owns (the turn deadline, the strike limit) are named as the book names them, with
// the reference page linked so a change there is one edit away from here.

import { Link } from 'react-router-dom'
import { Shell } from '../components/Shell'
import { PageHeader } from '../components/ui'
import T from '../../copy/faq.json'

function More({ label, href }: { label: string; href: string }) {
  if (href.startsWith('http'))
    return (
      <a href={href} rel="noopener">
        {label} ↗
      </a>
    )
  if (href.startsWith('/docs')) return <a href={href}>{label} →</a>
  return <Link to={href}>{label} →</Link>
}

export default function Faq() {
  return (
    <Shell title={T.tab}>
      <PageHeader
        crumbs={[{ label: T.header.crumbStart, to: '/start' }, { label: T.header.crumb }]}
        title={T.header.title}
        sub={T.header.sub}
      />
      <div className="wrap page-body doc">
        <div className="prose">
          {T.groups.map(({ id, title, questions }, g) => (
            <section key={id}>
              <h2 id={id} style={{ margin: '28px 0 8px', fontSize: 20 }}>
                {title}
              </h2>
              {questions.map((q, i) => (
                <details className="faq" open={g === 0 && i === 0} key={q.q}>
                  <summary>{q.q}</summary>
                  <div>
                    <p>{q.a}</p>
                    <p className="doclinks">
                      {q.more.map(({ label, href }) => (
                        <More label={label} href={href} key={href} />
                      ))}
                    </p>
                  </div>
                </details>
              ))}
            </section>
          ))}
        </div>
        <nav className="toc" aria-label={T.toc.label}>
          <b>{T.toc.heading}</b>
          {T.groups.map(({ id, title }) => (
            <a href={`#${id}`} key={id}>
              {title}
            </a>
          ))}
        </nav>
      </div>
    </Shell>
  )
}
