// A version's four stages, for the step tracker.

import type { ModelStatus } from '../api'
import type { Step } from '../components/ui'
import common from '../../copy/common.json'

const S = common.steps

/** A version's four stages, from its status. */
export function versionSteps(status: ModelStatus): Step[] {
  if (status === 'rejected') {
    return [
      { label: S.submitted, tone: 'done' },
      { label: S.rejected, tone: 'bad' },
      { label: S.trial, tone: 'todo' },
      { label: S.active, tone: 'todo' },
    ]
  }
  if (status === 'disabled') {
    // A baseline's alone: admitted, with no trial -- it is what a trial is played against --
    // and out of play until an admin switches it on.
    return [
      { label: S.submitted, tone: 'done' },
      { label: S.admitted, tone: 'done' },
      { label: S.outOfPlay, tone: 'now' },
    ]
  }
  const at = { testing: 1, verified: 2, active: 4, superseded: 4 }[status]
  return [S.submitted, S.admitted, S.trial, S.active].map((label, i) => ({
    label,
    tone: i < at ? 'done' : i === at ? 'now' : 'todo',
  }))
}

