// Facts, key/value rows, progress steps, and the one table on the site.

import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { Empty, Skel } from './Feedback'

export type Fact = { label: ReactNode; value: ReactNode }

export function Facts({ items, cols }: { items: Fact[]; cols?: number }) {
  return (
    <div className="facts" style={cols ? ({ '--cols': cols } as React.CSSProperties) : undefined}>
      {items.map((f, i) => (
        <div key={i}>
          <small>{f.label}</small>
          <b>{f.value}</b>
        </div>
      ))}
    </div>
  )
}

export type KeyValue = { key: ReactNode; value: ReactNode; hint?: ReactNode }

export function KeyValues({ items, className }: { items: KeyValue[]; className?: string }) {
  return (
    <dl className={cx('kvs', className)}>
      {items.map((r, i) => (
        <div className="kv" key={i}>
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

/** submitted → admitted → trial → active, with rejection as its own end. */
export type StepTone = 'done' | 'now' | 'bad' | 'todo'
export type Step = { label: string; tone: StepTone }

export function Steps({ steps, say }: { steps: Step[]; say?: ReactNode }) {
  return (
    <div className="progress">
      <div className="steps">
        {steps.map((s) => (
          <div className={cx('s', s.tone !== 'todo' && s.tone)} key={s.label}>
            <i />
            {s.label}
          </div>
        ))}
      </div>
      {say ? <p className="progress-say">{say}</p> : null}
    </div>
  )
}

export type Column<T> = {
  /** Stable across a column set that changes, so React keeps the right cells. */
  key: string
  head: ReactNode
  /** Numbers right, words left. `right` also picks the mono, tabular cell. */
  align?: 'left' | 'right'
  /** The cell class, when a column needs one — `r-rank`, `r-rating`, `r-num`. */
  cellClass?: string
  /** The column that should absorb the leftover width. */
  wide?: boolean
  cell: (row: T) => ReactNode
}

/**
 * Four pages draw a table and no two want the same columns, so what they share is
 * the shell: the scroll container, the header type, the row rules and the marked
 * row. Columns are data, which is what lets a page add one conditionally.
 */
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
  /** How many rows to hold space for. Pass the page size, so the table does not
   *  change height when the real rows arrive. */
  loadingRows?: number
}) {
  if (state === 'error') return <Empty>This table could not be loaded.</Empty>
  if (state === 'ready' && rows.length === 0) return <Empty>{empty ?? 'Nothing here yet.'}</Empty>

  // LOADING IS THE SAME TABLE — same header, same columns, same line height per
  // row — so the only thing that changes when the data lands is what the cells say.
  const loading = state === 'loading'
  const body: (T | null)[] = loading ? Array.from({ length: loadingRows }, () => null) : rows

  return (
    <div className="tscroll">
      <table className="ladder">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody aria-busy={loading || undefined}>
          {body.map((r, i) => (
            <tr className={r ? rowClass?.(r) : undefined} key={r ? rowKey(r) : `skel-${i}`}>
              {columns.map((c, ci) => (
                <td
                  className={cx(c.cellClass, c.wide && 'r-model-cell', !c.cellClass && c.align === 'right' && 'r-num') || undefined}
                  key={c.key}
                >
                  {r ? c.cell(r) : <Skel w={ci === 0 ? 18 : c.wide ? '62%' : c.align === 'right' ? 42 : 54} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
