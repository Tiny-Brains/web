// The weight-class hues, as CSS. Kept out of the components so a page needing the
// colour does not have to import a component to get it.

import type { SeasonWeightClass, WeightClass } from '../api'

/** The five hues the tokens define. A class outside them — a season that added one,
 *  or a version measured before it had one — falls back to the neutral line colour. */
const KNOWN = ['nano', 'micro', 'mini', 'small', 'large']

export function classVar(k: WeightClass | null | undefined): string {
  return k && KNOWN.includes(k) ? `var(--${k})` : 'var(--line)'
}

export function kStyle(k: WeightClass | null | undefined): React.CSSProperties {
  return { '--k': classVar(k) } as React.CSSProperties
}

/**
 * Where a class stands on the season's scale: step 1 of `of` is its lightest. This is what the
 * class icon draws, as that many filled bars of `of`.
 *
 * THE ORDER IS THE SEASON'S. A season lists its classes lightest first, so a season of three
 * classes draws a meter of three bars. A class the season does not list -- a version from another
 * season, read on a permalink -- takes the order the hues are named in, and one neither knows is
 * step 0: an empty meter that still says its name.
 */
export function classStep(
  k: WeightClass | null | undefined,
  classes: SeasonWeightClass[],
): { step: number; of: number; maxBytes: number | null } {
  const i = classes.findIndex((c) => c.class === k)
  if (i >= 0) return { step: i + 1, of: classes.length, maxBytes: classes[i].max_bytes }
  const j = k ? KNOWN.indexOf(k) : -1
  return { step: j + 1, of: Math.max(classes.length || KNOWN.length, j + 1), maxBytes: null }
}
