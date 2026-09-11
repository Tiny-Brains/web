import type { ReactNode } from 'react'
import type { AsyncResult } from '../lib/useApi'
import { Shell, type Ctx } from './Shell'
import { Loading } from './ui'
import { FetchFailed, NotFound, type MissingKind } from './ErrorStates'

/**
 * The three ways fetching one record can fail to produce a page.
 *
 * SOMA GAP: an unknown id answers 200 with a NULL BODY. soma-models-get and
 * soma-matches-get have no `unknown` task, unlike soma-profile-get, so a
 * well-formed id naming nothing is a success rather than an error, and reading
 * only the status would leave the page loading for ever. Treated as absence,
 * which is what it is; if those workflows grow a 404 the error branch catches it.
 */
export function Permalink<T>({
  result,
  kind,
  label,
  rows = 6,
  ctx = false,
  children,
}: {
  result: AsyncResult<T>
  kind: MissingKind
  label: string
  rows?: number
  ctx?: Ctx
  children: (data: T) => ReactNode
}) {
  if (result.state === 'error') {
    return (
      <Shell>
        <FetchFailed error={result.error} kind={kind} />
      </Shell>
    )
  }
  if (result.state === 'loading') {
    return (
      <Shell ctx={ctx}>
        <section className="wrap sec tight">
          <Loading rows={rows} label={label} />
        </section>
      </Shell>
    )
  }
  if (!result.data) {
    return (
      <Shell title="Not found">
        <NotFound kind={kind} />
      </Shell>
    )
  }
  return <>{children(result.data)}</>
}
