// Cards and headings. Thin on purpose: the styling lives in layout.css and these
// exist so the class names, element order and accessible shape are decided once.

import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('card', className)}>{children}</div>
}

export function CardHead({ title, end, children }: { title: ReactNode; end?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card-head">
      <h3>{title}</h3>
      {children}
      {end ? <span className="end">{end}</span> : null}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('card-body', className)}>{children}</div>
}

export function CardFoot({ children }: { children: ReactNode }) {
  return <div className="card-foot">{children}</div>
}

export function SectionHead({ title, sub, end }: { title: ReactNode; sub?: ReactNode; end?: ReactNode }) {
  return (
    <div className="sec-head">
      <h2>{title}</h2>
      {sub ? <span className="sub">{sub}</span> : null}
      {end ? <div className="end">{end}</div> : null}
    </div>
  )
}

/** A permalink's masthead: what this record is, stated rather than chosen. */
export function PageHead({
  back,
  title,
  badges,
  end,
  sub,
  className,
}: {
  back?: ReactNode
  title: ReactNode
  badges?: ReactNode
  end?: ReactNode
  sub?: ReactNode
  className?: string
}) {
  return (
    <section className={cx('wrap page-head', className)}>
      {back}
      <div className="page-title">
        {title}
        {badges}
        {end ? <div className="end">{end}</div> : null}
      </div>
      {sub ? <p className="page-sub">{sub}</p> : null}
    </section>
  )
}
