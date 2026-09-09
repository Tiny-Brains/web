// Open, then one ladder per weight class the season offers.
//
// Switching to a class is NOT a filter over Open: it shows that class's own
// ladder, ranked by the rating earned against that class alone. The home page
// carries this as a tab row inside a card head; /leaderboard carries the same
// control at page size, wearing the hue it selects. One component, two sizes,
// because the two must never offer different ladders.
//
// The classes come from the season, never from a table in here -- a season can
// shift the caps or offer only some of the classes, and a Nano-only season is a
// season row rather than a platform change.

import type { SeasonWeightClass } from '../api'
import { kStyle } from '../lib/classes'

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
  return (
    <div className={size === 'lg' ? 'ladders' : 'filters'} role="group" aria-label="Ladder">
      <button type="button" className={value === 'open' ? 'tab on' : 'tab'} onClick={() => onChange('open')}>
        {size === 'lg' ? 'Open' : 'open'}
      </button>
      {classes.map((c) => (
        <button
          type="button"
          className={value === c.class ? 'tab on' : 'tab'}
          onClick={() => onChange(c.class)}
          key={c.class}
        >
          {size === 'lg' ? <i style={kStyle(c.class)} /> : null}
          {c.class}
        </button>
      ))}
    </div>
  )
}
