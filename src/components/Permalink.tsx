// The one gate for a page addressed by an id: a match, a model, a version.
//
// Two answers mean "no such thing": an unknown model id answers 200 with a null body (that route
// has no `unknown` task, so reading only the status would leave the page loading for ever), and an
// unknown or private match or version answers 404. Both are NotFound; any other error is
// FetchFailed, and each branch names itself in the tab.
//
// LOADING IS THE PAGE'S OWN SHAPE, NOT A BOX OF GREY LINES. A permalink is the one page a reader
// arrives at cold — from a link somebody sent them — so its wait is the one they see most, and a
// short placeholder followed by a tall page is a page that jumps as they start reading it.

import type { ReactNode } from 'react'
import type { AsyncResult } from '../lib/useApi'
import { Shell } from './Shell'
import { PagePlaceholder } from './ui'
import { FetchFailed, NotFound, type MissingKind } from './ErrorStates'
import common from '../../copy/common.json'

const E = common.errors

export function Permalink<T>({
  result,
  kind,
  label,
  blocks = 2,
  children,
}: {
  result: AsyncResult<T>
  kind: MissingKind
  label: string
  /** How many panel-sized blocks the page it is standing in for has. */
  blocks?: number
  children: (data: T) => ReactNode
}) {
  if (result.state === 'error' && result.error.status === 404) {
    return (
      <Shell title={E.tabNotFound}>
        <NotFound kind={kind} />
      </Shell>
    )
  }
  if (result.state === 'error') {
    return (
      <Shell title={E.tabNotLoaded}>
        <FetchFailed error={result.error} kind={kind} />
      </Shell>
    )
  }
  if (result.state === 'loading') {
    return (
      <Shell title={label}>
        <PagePlaceholder label={label} blocks={blocks} />
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
