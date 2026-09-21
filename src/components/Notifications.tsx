// A notification, a list of them, what is still in progress, and a pushed one arriving.
//
// A kind is told apart by its icon's shape, and says its name to a screen reader; unread is a dot
// and a heavier title, never colour alone. What a notification carries beyond its words — a
// place, a score, a rating change, a class, an actor — is drawn as small chips and an avatar.

import { Link } from 'react-router-dom'
import { Fragment, type ReactNode } from 'react'
import type { Candidate, Notification, NotificationKind } from '../api'
import { ago, bytes, dayLabel, ordinal } from '../lib/format'
import { versionPath } from '../lib/paths'
import { cx } from '../lib/cx'
import { Icon, type IconId } from './ui'
import { Avatar } from './Avatar'
import { ClassIcon } from './Model'
import { fill } from '../lib/copy'
import common from '../../copy/common.json'

const N = common.notifications

const KIND: Record<NotificationKind, [IconId, string]> = {
  progress: ['i-clock', N.kinds.progress],
  result: ['i-trophy', N.kinds.result],
  rank: ['i-rank', N.kinds.rank],
  alert: ['i-alert', N.kinds.alert],
  season: ['i-calendar', N.kinds.season],
  account: ['i-key', N.kinds.account],
}
const KNOWN = new Set<string>(['i-clock', 'i-trophy', 'i-rank', 'i-alert', 'i-calendar', 'i-key', 'i-flask', 'i-server', 'i-bell', 'i-check', 'i-medal', 'i-anchor', 'i-live'])

function iconFor(n: Pick<Notification, 'kind' | 'icon'>): IconId {
  const explicit = n.icon ? (n.icon.startsWith('i-') ? n.icon : `i-${n.icon}`) : null
  return explicit && KNOWN.has(explicit) ? (explicit as IconId) : (KIND[n.kind]?.[0] ?? 'i-bell')
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** The structured extras a notification carries, as chips. Only what is present is drawn. */
function Chips({ n }: { n: Notification }) {
  const d = n.data ?? {}
  const place = num(d.place)
  const of = num(d.of)
  const score = num(d.score)
  const delta = num(d.delta)
  const rank = num(d.rank)
  const prev = num(d.prev_rank)
  const size = num(d.size_bytes)
  const klass = typeof d.class === 'string' ? d.class : null
  const chips: [string, ReactNode][] = []
  if (place !== null) chips.push(['place', fill(of ? N.chipPlaceOf : N.chipPlace, { place: ordinal(place), of: of ?? '' })])
  if (score !== null) chips.push(['score', fill(N.chipScore, { score })])
  if (delta !== null) chips.push(['delta', `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}`])
  if (rank !== null) chips.push(['rank', fill(prev !== null ? N.chipRankFrom : N.chipRank, { rank, previous: prev ?? '' })])
  if (klass)
    chips.push([
      'class',
      <>
        <ClassIcon k={klass} decorative />
        {klass}
      </>,
    ])
  if (size !== null) chips.push(['size', bytes(size)])
  if (chips.length === 0) return null
  return (
    <span className="ntf-chips">
      {chips.map(([key, body]) => (
        <span className="ntf-chip" key={key}>
          {body}
        </span>
      ))}
    </span>
  )
}

function NotificationIcon({ n }: { n: Notification }) {
  return (
    <span className="ntf-ic" aria-hidden="true">
      <Icon id={iconFor(n)} />
      {n.actor ? <Avatar handle={n.actor} size="xs" /> : null}
    </span>
  )
}

export function NotificationItem({ n, onOpen }: { n: Notification; onOpen?: (n: Notification) => void }) {
  const unread = !n.read_at
  const body = (
    <>
      <NotificationIcon n={n} />
      <span className="ntf-body">
        <span className="vis-hidden">{fill(N.kindPrefix, { kind: KIND[n.kind]?.[1] ?? N.kindOther })}</span>
        <b>{n.subject}</b>
        {n.description ? <small>{n.description}</small> : null}
        <Chips n={n} />
      </span>
      <span className="ntf-when">
        <time dateTime={n.created_at}>{ago(n.created_at)}</time>
        {unread ? <i className="unread-dot" role="img" aria-label={N.unread} /> : null}
      </span>
    </>
  )
  const cls = cx('ntf', n.tone, unread && 'unread')
  return n.link?.startsWith('/') ? (
    <Link className={cls} to={n.link} onClick={() => onOpen?.(n)}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** Newest first; with `grouped`, a heading for each day. */
export function NotificationList({
  items,
  grouped = false,
  onOpen,
}: {
  items: Notification[]
  grouped?: boolean
  onOpen?: (n: Notification) => void
}) {
  // Headings are worked out before rendering: a day's heading goes on its first item.
  const days = items.map((n) => dayLabel(n.created_at))
  return (
    <div className="ntfs">
      {items.map((n, i) => (
        <Fragment key={n.id}>
          {grouped && (i === 0 || days[i] !== days[i - 1]) ? <div className="mday">{days[i]}</div> : null}
          <NotificationItem n={n} onOpen={onOpen} />
        </Fragment>
      ))}
    </div>
  )
}

const PHASE: Record<Candidate['phase'], [string, number]> = {
  queued: [N.phases.queued, 1],
  verifying: [N.phases.verifying, 1],
  awaiting_trial: [N.phases.awaiting_trial, 2],
}

/** What is still moving: every version of yours between submission and the ladder. */
export function InProgress({ candidates }: { candidates: Candidate[] }) {
  if (candidates.length === 0) return null
  return (
    <>
      {candidates.map((c) => {
        const [said, step] = PHASE[c.phase] ?? [c.phase.replace(/_/g, ' '), 1]
        return (
          <Link className="inprog" to={versionPath(c.model_id, c.version)} key={c.version_id}>
            <span className="ntf-ic" aria-hidden="true">
              <Icon id="i-clock" />
            </span>
            <span className="ntf-body">
              <b>
                {c.model} v{c.version}
              </b>
              <small>{fill(N.inProgress, { phase: said, step: step + 1 })}</small>
            </span>
            <span className="mini-steps" role="img" aria-label={fill(N.steps, { step: step + 1 })}>
              {[0, 1, 2, 3].map((i) => (
                <i className={i < step ? 'done' : i === step ? 'now' : undefined} key={i} />
              ))}
            </span>
          </Link>
        )
      })}
    </>
  )
}

/** A notification that arrived while the page was open. Polite, dismissible, never takes focus. */
export function Toast({ n, onDismiss }: { n: Notification; onDismiss: () => void }) {
  return (
    <div className={cx('toast ntf', n.tone)} role="status" aria-live="polite">
      <NotificationIcon n={n} />
      <span className="ntf-body">
        <b>{n.subject}</b>
        {n.description ? <small>{n.description}</small> : null}
      </span>
      <span className="actions">
        {n.link?.startsWith('/') ? (
          <Link className="btn sm" to={n.link} onClick={onDismiss}>
            {common.shell.toast.view}
          </Link>
        ) : null}
        <button className="icon-btn" type="button" aria-label={common.shell.toast.dismiss} onClick={onDismiss}>
          <Icon id="i-x" />
        </button>
      </span>
    </div>
  )
}
