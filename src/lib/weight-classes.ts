// The weight-class hues, as CSS. Kept out of the components so a page needing the
// colour does not have to import a component to get it.

import type { WeightClass } from '../api'

/** The five hues the tokens define. A class outside them — a season that added one,
 *  or a version measured before it had one — falls back to the neutral line colour. */
const KNOWN = ['nano', 'micro', 'mini', 'small', 'large']

export function classVar(k: WeightClass | null | undefined): string {
  return k && KNOWN.includes(k) ? `var(--${k})` : 'var(--line)'
}

export function kStyle(k: WeightClass | null | undefined): React.CSSProperties {
  return { '--k': classVar(k) } as React.CSSProperties
}
