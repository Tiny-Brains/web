// Data display with no domain meaning: headline numbers, labelled facts, a table, a step tracker.

import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { EmptyState, Skel } from './Feedback'

export type Stat = { label: ReactNode; value: ReactNode }

/** A page's headline numbers. */
export function StatGrid({ items, boxed = false }: { items: Stat[]; boxed?: boolean }) {
  return (
    <dl className={cx('stats', boxed && 'boxed')}>
      {items.map((s, i) => (
        <div key={i}>
          <dt>{s.label}</dt>
          <dd>{s.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export type KeyValue = { key: ReactNode; value: ReactNode; hint?: ReactNode }

export function KeyValueList({ items, className }: { items: KeyValue[]; className?: string }) {
  return (
    <dl className={cx('kvs', className)}>
      {items.map((r, i) => (
        <div style={{ display: 'contents' }} key={i}>
          <dt>{r.key}</dt>
          <dd>
            {r.value}
            {r.hint ? <span className="hint">{r.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export type StepTone = 'done' | 'now' | 'bad' | 'todo'
export type Step = { label: string; tone: StepTone }

export function StepTracker({ steps, say }: { steps: Step[]; say?: ReactNode }) {
  return (
    <div>
      <ol className="steps">
        {steps.map((s) => (
          <li className={s.tone === 'todo' ? undefined : s.tone} key={s.label}>
            {s.label}
            {s.tone === 'now' ? <span className="vis-hidden"> (current step)</span> : null}
          </li>
        ))}
      </ol>
      {say ? <p className="steps-say">{say}</p> : null}
    </div>
  )
}

export type Column<T> = {
  key: string
  head: ReactNode
  align?: 'left' | 'right'
  className?: string
  /** Hidden below 640px. */
  wideOnly?: boolean
  cell: (row: T) => ReactNode
}

/** A table that loads as itself: the same columns, skeleton rows at the same height. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClass,
  state = 'ready',
  empty,
  loadingRows = 5,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  rowClass?: (row: T) => string | undefined
  state?: 'loading' | 'ready' | 'error'
  empty?: ReactNode
  loadingRows?: number
}) {
  if (state === 'error') return <EmptyState>This table could not be loaded.</EmptyState>
  if (state === 'ready' && rows.length === 0) return <EmptyState>{empty ?? 'Nothing here yet.'}</EmptyState>
  const loading = state === 'loading'
  const body: (T | null)[] = loading ? Array.from({ length: loadingRows }, () => null) : rows
  const cls = (c: Column<T>) => cx(c.className, c.align === 'right' && 'r', c.wideOnly && 'wide-only') || undefined
  return (
    <div className="tscroll">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cls(c)}>
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody aria-busy={loading || undefined}>
          {body.map((r, i) => (
            <tr className={r ? rowClass?.(r) : undefined} key={r ? rowKey(r) : `skel-${i}`}>
              {columns.map((c, ci) => (
                <td className={cls(c)} key={c.key}>
                  {r ? c.cell(r) : <Skel w={ci === 0 ? 18 : c.align === 'right' ? 42 : 90} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
