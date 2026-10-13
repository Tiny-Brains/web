// What an empty ladder says, on /leaderboard and the home page's top ten alike.

import type { ReactNode } from 'react'
import type { SeasonWeightClass } from '../api'
import { cap, num } from '../lib/format'
import { allowsMemory, memoryOf } from '../lib/weight-classes'
import { fill } from '../lib/copy'
import { Rich } from './ui'
import { copy } from '../lib/lang'
import enCommon from '../../copy/en-GB/common.json'

export function ladderEmpty(ladder: string, classes: SeasonWeightClass[], live: boolean): ReactNode {
  const L = copy('common', enCommon).ladder
  const c = classes.find((x) => x.class === ladder)
  if (!live) return ladder === 'open' ? L.emptyClosedOpen : fill(L.emptyClosedClass, { class: ladder })
  if (!c) return <Rich text={L.emptyLive} />
  const m = allowsMemory(c) ? memoryOf(c) : null
  const vars = { class: ladder, cap: cap(c.max_bytes), flat: cap(m?.flat), cell: num(m?.cell) }
  return <Rich text={m ? L.emptyLiveClassMemory : L.emptyLiveClass} vars={vars} />
}
