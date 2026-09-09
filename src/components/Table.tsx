// The one table on the site.
//
// Four pages draw a table and no two want the same columns: the home page's
// leaderboard card has five, /leaderboard has six or seven depending on the
// ladder, a profile's versions have eight, and the seasons admin has six of its
// own. What they share is the shell -- the scroll container, the header type, the
// row rules and the marked row -- so that is what this is. Columns are data,
// which is also what lets a page add one conditionally without a second table.

import type { ReactNode } from 'react'
import { Empty, Skel } from './ui'

export type Column<T> = {
  /** Stable across a column set that changes, so React keeps the right cells. */
  key: string
  head: ReactNode
  /** Numbers right, words left. `right` also picks the mono, tabular cell. */
  align?: 'left' | 'right'
  /** The cell class, when a column needs one -- `r-rank`, `r-rating`, `r-num`. */
  cellClass?: string
  /** The column that should absorb the leftover width. */
  wide?: boolean
  cell: (row: T) => ReactNode
}

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

  // LOADING IS THE SAME TABLE. Same header, same column set, same cell padding
  // and the same line height per row -- so the only thing that changes when the
  // data lands is what the cells say, never where anything is.
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
              {columns.map((c, ci) => {
                const cls = [c.cellClass, c.wide ? 'r-model-cell' : '', !c.cellClass && c.align === 'right' ? 'r-num' : '']
                  .filter(Boolean)
                  .join(' ')
                return (
                  <td className={cls || undefined} key={c.key}>
                    {r ? c.cell(r) : <Skel w={ci === 0 ? 18 : c.wide ? '62%' : c.align === 'right' ? 42 : 54} />}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
