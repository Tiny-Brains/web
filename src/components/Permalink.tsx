// The one gate for a page addressed by an id: a match, a model, a version.
//
// An unknown model or match id answers 200 with a null body — those routes have no `unknown`
// task — so reading only the status would leave the page loading for ever. Error →
// FetchFailed, loading → the shell with a skeleton, null data → NotFound, and each branch names
// itself in the tab.

import type { ReactNode } from 'react'
import type { AsyncResult } from '../lib/useApi'
import { Shell } from './Shell'
import { Loading } from './ui'
import { FetchFailed, NotFound, type MissingKind } from './ErrorStates'
import common from '../../copy/common.json'

const E = common.errors

export function Permalink<T>({
  result,
  kind,
  label,
  rows = 6,
  children,
}: {
  result: AsyncResult<T>
  kind: MissingKind
  label: string
  rows?: number
  children: (data: T) => ReactNode
}) {
  if (result.state === 'error') {
    return (
      <Shell title={result.error.status === 404 ? E.tabNotFound : E.tabNotLoaded}>
        <FetchFailed error={result.error} kind={kind} />
      </Shell>
    )
  }
  if (result.state === 'loading') {
    return (
      <Shell title={label}>
        <section className="wrap page-head">
          <Loading rows={rows} label={label} />
        </section>
      </Shell>
    )
  }
  if (!result.data) {
    return (
      <Shell title={E.tabNotFound}>
        <NotFound kind={kind} />
      </Shell>
    )
  }
  return <>{children(result.data)}</>
}
