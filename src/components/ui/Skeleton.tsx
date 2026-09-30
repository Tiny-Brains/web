// Placeholders: what stands on the page between asking the API and drawing the answer.
//
// A PLACEHOLDER IS THE SHAPE OF WHAT REPLACES IT. Three grey lines in the middle of an empty page
// are not a placeholder, they are a shrug: the page they stand in for is a title, a row of figures
// and a table, so when the answer lands the page grows by several hundred pixels under a reader who
// has already started reading it, and every link they were about to press has moved. These are
// sized to what follows them — the header at the header's own height, a body block where a panel
// will be — so an answer fills the page in instead of resizing it.
//
// ONE ANNOUNCEMENT PER WAIT. The container carries `role="status"` and the label; every block inside
// it is decorative and hidden, or a screen reader reads "Loading" once per grey line.

import { cx } from '../../lib/cx'
import common from '../../../copy/common.json'

const U = common.ui

const px = (v: string | number) => (typeof v === 'number' ? `${v}px` : v)

/** One block, at the size of the thing it stands in for. Decorative: the wait is announced by
 *  whatever contains it. */
export function Skeleton({
  w = '100%',
  h = 14,
  radius = 6,
  className,
}: {
  w?: string | number
  h?: string | number
  radius?: number
  className?: string
}) {
  return (
    <span
      className={cx('skel', className)}
      aria-hidden="true"
      style={{ width: px(w), height: px(h), borderRadius: `${radius}px` }}
    />
  )
}

/** A paragraph's worth of lines, the last one short, as text sets. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span className={cx('skel-lines', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} h={13} w={i === lines - 1 && lines > 1 ? '55%' : i % 2 ? '82%' : '100%'} />
      ))}
    </span>
  )
}

/** The page header's own shape: the breadcrumb line, the title and one line of context, at the
 *  heights `PageHeader` draws them at — so the title does not shift down when it arrives. */
export function SkeletonPageHeader({ crumbs = true, sub = true }: { crumbs?: boolean; sub?: boolean }) {
  return (
    <header className="wrap page-head" aria-hidden="true">
      {crumbs ? (
        <div className="skel-crumbs">
          <Skeleton w={52} h={11} radius={4} />
          <Skeleton w={78} h={11} radius={4} />
        </div>
      ) : null}
      <div className="skel-title">
        <Skeleton w="min(320px, 62%)" h={30} radius={8} />
      </div>
      {sub ? <Skeleton className="skel-sub" w="min(460px, 84%)" h={14} /> : null}
    </header>
  )
}

/**
 * A whole page, waiting.
 *
 * It is what a route draws before it knows anything at all: the split chunk still arriving, the
 * session still being checked, a permalink's entity still being read. `blocks` are where the page's
 * panels will be, so the footer sits where it is going to sit and the scroll bar does not appear a
 * moment after the reader starts moving.
 */
export function PagePlaceholder({
  label = U.loading,
  blocks = 2,
  header = true,
}: {
  label?: string
  blocks?: number
  header?: boolean
}) {
  return (
    <>
      {header ? <SkeletonPageHeader /> : null}
      <div className="wrap page-body" role="status" aria-live="polite" aria-label={label}>
        <div className="stack">
          {Array.from({ length: blocks }, (_, i) => (
            <Skeleton key={i} h={i === 0 ? 132 : 220} radius={12} />
          ))}
        </div>
      </div>
    </>
  )
}

/** A block INSIDE a page that is otherwise drawn: a panel's body, a section under a header the page
 *  could draw without the API. A whole page waiting is `PagePlaceholder`, which keeps its height. */
export function Loading({ rows = 3, label = U.loading }: { rows?: number; label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skel" aria-hidden="true" key={i} />
      ))}
    </div>
  )
}

/** A placeholder the size of the text it stands in for, inline in a line that is otherwise drawn. */
export function Skel({ w = '100%', title }: { w?: string | number; title?: string }) {
  return <span className="skel skel-text" aria-hidden="true" title={title} style={{ width: px(w) }} />
}
