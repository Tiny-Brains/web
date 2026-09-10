// Pills, notes and the three things a data region can be.

import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { Icon, type IconId } from './Icon'

// Never colour alone: the pill's word is the state, and the colour agrees with it.
export type PillTone = 'ok' | 'open' | 'wait' | 'settling' | 'closed' | 'scheduled' | 'bad'

export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>
}

/** The four season states, worded and toned the same way wherever one appears. */
const SEASON_PILL: Record<string, [PillTone, string]> = {
  open: ['open', 'Open'],
  scheduled: ['scheduled', 'Scheduled'],
  settling: ['settling', 'Settling'],
  closed: ['closed', 'Closed'],
}

export function SeasonPill({ state }: { state: keyof typeof SEASON_PILL }) {
  const [tone, word] = SEASON_PILL[state] ?? ['closed', state]
  return <Pill tone={tone as PillTone}>{word}</Pill>
}

const NOTE_ICON: Record<string, IconId> = { info: 'i-info', warn: 'i-clock', bad: 'i-alert', ok: 'i-check' }

/** A sentence in a box, never a code. */
export function Note({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'bad' | 'ok'
  title?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={cx('note', tone !== 'info' && tone)}>
      <Icon id={NOTE_ICON[tone]} />
      <div>
        {title ? <b>{title}</b> : null}
        {children}
      </div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
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

/**
 * A placeholder shaped like the text it stands in for.
 *
 * `height: 1em` is what makes this hold the layout rather than approximate it: an
 * inline-block of one em sits in a line box whose height is the parent's
 * line-height, so a row of skeletons is exactly as tall as the row of text that
 * replaces it. A block of a guessed pixel height is what makes a page jump.
 */
export function Skel({ w = '100%', title }: { w?: string | number; title?: string }) {
  return (
    <span
      className="skel skel-text"
      aria-hidden="true"
      title={title}
      style={{ width: typeof w === 'number' ? `${w}px` : w }}
    />
  )
}
