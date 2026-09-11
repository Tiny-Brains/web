// `/changelog` — what's new: seasons opening and closing, from the API, and the dated entries in
// src/changelog.ts, in one list newest first. Developers return to a site that changes, and
// nothing said when it had. /feed.xml is the same entries as a feed.

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { usePlatform } from '../providers/platform-context'
import { date } from '../lib/format'
import { CHANGELOG } from '../changelog'
import { Shell } from '../components/Shell'
import { Card, CardBody, KeyValues } from '../components/ui'

type Item = { date: string; title: string; body: ReactNode; href?: string }

function More({ href }: { href: string }) {
  if (href.startsWith('http'))
    return (
      <a href={href} rel="noopener">
        More ↗
      </a>
    )
  if (href.startsWith('/docs')) return <a href={href}>More →</a>
  return <Link to={href}>More →</Link>
}

export default function Changelog() {
  const { seasons, gameName, slug } = usePlatform()

  // A season's opening and closing are entries the API knows better than a file would.
  const seasonal: Item[] = seasons.flatMap((s) => {
    const items: Item[] = []
    if (s.state !== 'scheduled')
      items.push({
        date: s.submissions_open_at,
        title: `${gameName} season ${s.number} opened`,
        body: `Submissions open until ${date(s.submissions_close_at)}. ${s.weight_classes.length} weight classes.`,
        href: `/?game=${slug}&season=${s.number}`,
      })
    if (s.closed_at)
      items.push({
        date: s.closed_at,
        title: `${gameName} season ${s.number} closed`,
        body: `${s.entered_versions} versions entered and ${s.matches_played} matches played. The standings are final.`,
        href: `/?game=${slug}&season=${s.number}`,
      })
    return items
  })

  const items = [...seasonal, ...CHANGELOG].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <Shell title="What’s new">
      <section className="wrap lede-wrap">
        <div className="eyebrow">Changelog</div>
        <h1>
          What changed, and <i>when</i>.
        </h1>
        <p>
          Seasons opening and closing, engines cutting over, baselines arriving, pages changing. The same
          entries are a feed at <a href="/feed.xml">/feed.xml</a>.
        </p>
      </section>

      <section className="wrap sec tight">
        <Card>
          <CardBody>
            <KeyValues
              items={items.map((x) => ({
                key: date(x.date),
                value: (
                  <>
                    <b>{x.title}</b>
                    <br />
                    {x.body}
                  </>
                ),
                hint: x.href ? <More href={x.href} /> : undefined,
              }))}
            />
          </CardBody>
        </Card>
      </section>
    </Shell>
  )
}
