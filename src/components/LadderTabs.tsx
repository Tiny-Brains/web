// The ladders of a season: Open, then each class with its meter. As tabs (each with its size, or
// each a link), or as a segment where the ladder is one filter among several (/leaderboard's row).

import type { SeasonWeightClass } from '../api'
import type { LadderHead } from '../lib/useLadderHeads'
import { Segmented, Tabs } from './ui'
import { ClassIcon } from './Model'
import common from '../../copy/common.json'

export function LadderTabs({
  classes,
  value,
  heads,
  hrefFor,
  onPick,
  look = 'tabs',
}: {
  classes: SeasonWeightClass[]
  value: string
  /** Sizes to print beside each tab; left out where a page does not read them. */
  heads?: Map<string, LadderHead>
  /** Tabs are links when each ladder has an address, else buttons. */
  hrefFor?: (ladder: string) => string
  onPick?: (ladder: string) => void
  /** `seg`: a segmented control, always buttons, no sizes. */
  look?: 'tabs' | 'seg'
}) {
  const ladders = ['open', ...classes.map((c) => c.class)]
  const label = (l: string) =>
    l === 'open' ? (
      common.ladder.open
    ) : (
      <>
        <ClassIcon k={l} decorative />
        {l}
      </>
    )
  if (look === 'seg') {
    return (
      <Segmented
        label={common.ladder.tabs}
        value={value}
        onChange={(l) => onPick?.(l)}
        items={ladders.map((l) => ({ key: l, label: label(l) }))}
      />
    )
  }
  return (
    <Tabs
      label={common.ladder.tabs}
      current={value}
      onPick={onPick}
      items={ladders.map((l) => ({
        key: l,
        to: hrefFor?.(l),
        count: heads?.get(l)?.total ?? null,
        label: label(l),
      }))}
    />
  )
}
