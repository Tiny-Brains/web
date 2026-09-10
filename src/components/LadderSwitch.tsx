// Open, then one ladder per weight class the season offers.
//
// Switching to a class is NOT a filter over Open: it shows that class's own
// ladder, ranked by the rating earned against that class alone. The home page
// carries this inside a card head and /leaderboard carries it at page size — one
// component, because the two must never offer different ladders.

import type { SeasonWeightClass } from '../api'
import { cx } from '../lib/cx'
import { kStyle } from '../lib/weight-classes'

export function LadderSwitch({
  classes,
  value,
  onChange,
  size = 'sm',
}: {
  classes: SeasonWeightClass[]
  value: string
  onChange: (ladder: string) => void
  size?: 'sm' | 'lg'
}) {
  const big = size === 'lg'
  return (
    <div className={big ? 'ladders' : 'filters'} role="group" aria-label="Ladder">
      <button type="button" className={cx('tab', value === 'open' && 'on')} onClick={() => onChange('open')}>
        {big ? 'Open' : 'open'}
      </button>
      {classes.map((c) => (
        <button
          type="button"
          className={cx('tab', value === c.class && 'on')}
          onClick={() => onChange(c.class)}
          key={c.class}
        >
          {big ? <i style={kStyle(c.class)} /> : null}
          {c.class}
        </button>
      ))}
    </div>
  )
}
