// A version's four stages, for the step tracker.

import type { ModelStatus } from '../api'
import type { Step } from '../components/ui'

/** A version's four stages, from its status. */
export function versionSteps(status: ModelStatus): Step[] {
  if (status === 'rejected') {
    return [
      { label: 'submitted', tone: 'done' },
      { label: 'rejected', tone: 'bad' },
      { label: 'trial', tone: 'todo' },
      { label: 'active', tone: 'todo' },
    ]
  }
  if (status === 'disabled') {
    // A baseline's alone (N29): admitted, with no trial -- it is what a trial is played against --
    // and out of play until an admin switches it on.
    return [
      { label: 'submitted', tone: 'done' },
      { label: 'admitted', tone: 'done' },
      { label: 'out of play', tone: 'now' },
    ]
  }
  const at = { testing: 1, verified: 2, active: 4, superseded: 4 }[status]
  return ['submitted', 'admitted', 'trial', 'active'].map((label, i) => ({
    label,
    tone: i < at ? 'done' : i === at ? 'now' : 'todo',
  }))
}

