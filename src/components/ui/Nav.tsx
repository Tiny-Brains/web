// Moving between sibling views of one thing: tabs, a segmented control, paging.

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Icon, type IconId } from './Icon'

export type TabItem = { key: string; label: ReactNode; count?: number | null; to?: string }

/** Tabs as links when each view has an address, else as buttons. The current one is marked
 *  aria-current (links) or aria-pressed (buttons), never by colour alone. */
export function Tabs({
  items,
  current,
  label,
  onPick,
}: {
  items: TabItem[]
  current: string
  label: string
  onPick?: (key: string) => void
}) {
  return (
    <nav className="tabs" aria-label={label}>
      {items.map((t) => {
        const body = (
          <>
            {t.label}
            {t.count !== undefined && t.count !== null ? <small>{t.count.toLocaleString('en-GB')}</small> : null}
          </>
        )
        return t.to ? (
          <Link className="tab" to={t.to} aria-current={t.key === current ? 'page' : undefined} key={t.key}>
            {body}
          </Link>
        ) : (
          <button className="tab" type="button" aria-pressed={t.key === current} onClick={() => onPick?.(t.key)} key={t.key}>
            {body}
          </button>
        )
      })}
    </nav>
  )
}

export type SegItem = { key: string; label: ReactNode; icon?: IconId; title?: string }

export function Segmented({
  items,
  value,
  onChange,
  label,
}: {
  items: SegItem[]
  value: string
  onChange: (key: string) => void
  label: string
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {items.map((s) => (
        <button type="button" aria-pressed={s.key === value} title={s.title} onClick={() => onChange(s.key)} key={s.key}>
          {s.icon ? <Icon id={s.icon} /> : null}
          {s.label}
        </button>
      ))}
    </div>
  )
}

/** Cursor paging: forward while there is a next page, and back to the start once off it. */
export function Pagination({
  onNext,
  onStart,
  nextLabel = 'Next',
  startLabel = 'Back to the start',
}: {
  onNext?: (() => void) | null
  onStart?: (() => void) | null
  nextLabel?: string
  startLabel?: string
}) {
  if (!onNext && !onStart) return null
  return (
    <div className="pager">
      {onStart ? (
        <button className="btn sm" type="button" onClick={onStart}>
          ← {startLabel}
        </button>
      ) : null}
      {onNext ? (
        <button className="btn sm" type="button" onClick={onNext}>
          {nextLabel} →
        </button>
      ) : null}
    </div>
  )
}
