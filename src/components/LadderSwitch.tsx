// Open, then one ladder per weight class the season offers.
//
// Switching to a class is NOT a filter over Open: it shows that class's own
// ladder, ranked by the rating earned against that class alone. It is drawn in
// one place, the head of LadderCard, which the home page and /leaderboard share —
// so the two can never offer different ladders.

import type { SeasonWeightClass } from '../api'
import { cx } from '../lib/cx'

export function LadderSwitch({
  classes,
  value,
  onChange,
}: {
  classes: SeasonWeightClass[]
  value: string
  onChange: (ladder: string) => void
}) {
  return (
    <div className="filters" role="group" aria-label="Ladder">
      <button type="button" className={cx('tab', value === 'open' && 'on')} onClick={() => onChange('open')}>
        open
      </button>
      {classes.map((c) => (
        <button
          type="button"
          className={cx('tab', value === c.class && 'on')}
          onClick={() => onChange(c.class)}
          key={c.class}
        >
          {c.class}
        </button>
      ))}
    </div>
  )
}
