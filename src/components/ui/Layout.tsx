// Page structure: the one bordered surface, the page header with its breadcrumbs, and a section.

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

/** The one bordered surface. Stats, prose and forms sit on the page; tables, lists and grouped
 *  controls get a Panel. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('panel', className)}>{children}</div>
}

/** A string title becomes an h3; anything else (tabs, a filter bar) is drawn as given. */
export function PanelHead({ title, end, children }: { title?: ReactNode; end?: ReactNode; children?: ReactNode }) {
  return (
    <div className="panel-head">
      {typeof title === 'string' ? <h3>{title}</h3> : title}
      {children}
      {end ? <div className="end">{end}</div> : null}
    </div>
  )
}

export function PanelBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('panel-body', className)}>{children}</div>
}

export function PanelFoot({ end, children }: { end?: ReactNode; children?: ReactNode }) {
  return (
    <div className="panel-foot">
      {children}
      {end ? <span className="end">{end}</span> : null}
    </div>
  )
}

export type Crumb = { label: ReactNode; to?: string }

/** Where a page sits and the way up. The last item is the page itself. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="crumbs">
        {items.map((c, i) =>
          i === items.length - 1 || !c.to ? (
            <li aria-current={i === items.length - 1 ? 'page' : undefined} key={i}>
              {c.label}
            </li>
          ) : (
            <li key={i}>
              <Link to={c.to}>{c.label}</Link>
            </li>
          ),
        )}
      </ol>
    </nav>
  )
}

/** Breadcrumbs, the title, its badges, one line of context and the page's actions.
 *  It is a .wrap of its own: never put it inside another, or the padding doubles. */
export function PageHeader({
  crumbs,
  title,
  badges,
  actions,
  sub,
  children,
}: {
  crumbs?: Crumb[]
  title: ReactNode
  badges?: ReactNode
  actions?: ReactNode
  sub?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="wrap page-head">
      {crumbs?.length ? <Breadcrumbs items={crumbs} /> : null}
      <div className="page-title">
        <h1>{title}</h1>
        {badges}
        {actions ? <div className="actions">{actions}</div> : null}
      </div>
      {sub ? <p className="page-sub">{sub}</p> : null}
      {children}
    </header>
  )
}

/** A titled block, with an optional "see all" link at its end. */
export function Section({
  title,
  sub,
  more,
  id,
  className,
  children,
}: {
  title: ReactNode
  sub?: ReactNode
  more?: { label: string; to: string }
  id?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cx('sec', className)} id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="sec-head">
        <h2 id={id ? `${id}-h` : undefined}>{title}</h2>
        {sub ? <p>{sub}</p> : null}
        {more ? (
          <Link className="more" to={more.to}>
            {more.label} →
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  )
}
