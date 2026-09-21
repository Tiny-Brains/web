// `/changelog` — what's new: seasons opening and closing, from the API, and the dated entries in
// copy/changelog.json, in one list newest first. Developers return to a site that changes, and
// nothing said when it had. /feed.xml is the same entries as a feed.

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { usePlatform } from '../providers/platform-context'
import { date } from '../lib/format'
import { fill } from '../lib/copy'
import { Shell } from '../components/Shell'
import { PageHeader, Rich } from '../components/ui'
import T from '../../copy/changelog.json'

type Item = { date: string; title: string; body: ReactNode; href?: string }

function More({ href }: { href: string }) {
  if (href.startsWith('http'))
    return (
      <a href={href} rel="noopener">
        {T.moreExternal}
      </a>
    )
  if (href.startsWith('/docs')) return <a href={href}>{T.more}</a>
  return <Link to={href}>{T.more}</Link>
}

export default function Changelog() {
  const { seasons, gameName, slug } = usePlatform()

  // A season's opening and closing are entries the API knows better than a file would.
  const seasonal: Item[] = seasons.flatMap((s) => {
    const items: Item[] = []
    if (s.state !== 'scheduled')
      items.push({
        date: s.submissions_open_at,
        title: fill(T.season.opened, { game: gameName, season: s.name }),
        body: fill(T.season.openedBody, { date: date(s.submissions_close_at), classes: s.weight_classes.length }),
        href: `/?game=${slug}&season=${s.slug}`,
      })
    if (s.closed_at)
      items.push({
        date: s.closed_at,
        title: fill(T.season.closed, { game: gameName, season: s.name }),
        body: fill(T.season.closedBody, { versions: s.entered_versions, matches: s.matches_played }),
        href: `/?game=${slug}&season=${s.slug}`,
      })
    return items
  })

  const items = [...seasonal, ...T.entries].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <Shell title={T.tab}>
      <PageHeader crumbs={[{ label: T.header.crumb }]} title={T.header.title} sub={<Rich text={T.header.sub} />} />
      <div className="wrap page-body">
        <div style={{ maxWidth: 860 }}>
          {items.map((x) => (
            <article className="log" key={`${x.date}:${x.title}`}>
              <time dateTime={x.date}>{date(x.date)}</time>
              <div>
                <h3>{x.title}</h3>
                <p>{x.body}</p>
                {x.href ? (
                  <p className="doclinks">
                    <More href={x.href} />
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </Shell>
  )
}
