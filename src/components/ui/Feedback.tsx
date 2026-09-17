// Feedback: a state word, a notice, an empty state, a skeleton.

import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { Icon, type IconId } from './Icon'

export type BadgeTone = 'ok' | 'wait' | 'bad' | 'off' | 'info'

/** Every state word on the site. The tone is carried by the dot's shape as well as its colour,
 *  and the word is always there. */
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export type NoticeTone = 'info' | 'ok' | 'warn' | 'bad'
const NOTICE_ICON: Record<NoticeTone, IconId> = { info: 'i-info', ok: 'i-check', warn: 'i-clock', bad: 'i-alert' }

/** Told apart by the icon's shape and the title's words, not by colour. */
export function Notice({ tone = 'info', title, children }: { tone?: NoticeTone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`notice ${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon id={NOTICE_ICON[tone]} />
      <div>
        {title ? <b>{title}</b> : null}
        {children}
      </div>
    </div>
  )
}

/** Nothing here, and — in its words — what would change that. */
export function EmptyState({ children, boxed = false }: { children: ReactNode; boxed?: boolean }) {
  return <div className={cx('empty', boxed && 'boxed')}>{children}</div>
}

export function Loading({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skel" key={i} />
      ))}
    </div>
  )
}

/** A placeholder the size of the text it stands in for. */
export function Skel({ w = '100%', title }: { w?: string | number; title?: string }) {
  return (
    <span className="skel skel-text" aria-hidden="true" title={title} style={{ width: typeof w === 'number' ? `${w}px` : w }} />
  )
}
