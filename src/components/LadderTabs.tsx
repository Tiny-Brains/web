// The ladders of a season as tabs: Open, then each class with its meter, each with its size.

import type { SeasonWeightClass } from '../api'
import type { LadderHead } from '../lib/useLadderHeads'
import { Tabs } from './ui'
import { ClassIcon } from './Model'

export function LadderTabs({
  classes,
  value,
  heads,
  hrefFor,
  onPick,
}: {
  classes: SeasonWeightClass[]
  value: string
  /** Sizes to print beside each tab; left out where a page does not read them. */
  heads?: Map<string, LadderHead>
  /** Tabs are links when each ladder has an address, else buttons. */
  hrefFor?: (ladder: string) => string
  onPick?: (ladder: string) => void
}) {
  const ladders = ['open', ...classes.map((c) => c.class)]
  return (
    <Tabs
      label="Ladder"
      current={value}
      onPick={onPick}
      items={ladders.map((l) => ({
        key: l,
        to: hrefFor?.(l),
        count: heads?.get(l)?.total ?? null,
        label:
          l === 'open' ? (
            'Open'
          ) : (
            <>
              <ClassIcon k={l} decorative />
              {l}
            </>
          ),
      }))}
    />
  )
}
