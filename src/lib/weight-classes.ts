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

/**
 * A class's memory: the bytes a model may carry from one turn to the next, `flat` on every board
 * plus `cell` for each of the board's cells. A season that does not say is 0 and 0, which is no
 * memory, and so is an entry from before the two numbers existed.
 */
export function memoryOf(c: SeasonWeightClass): { flat: number; cell: number } {
  return { flat: c.memory_flat_bytes ?? 0, cell: c.memory_cell_bytes ?? 0 }
}

/** The two numbers as an admin types them, by class. */
export type MemoryDraft = Record<string, { flat: string; cell: string }>

export function memoryDraft(classes: SeasonWeightClass[]): MemoryDraft {
  return Object.fromEntries(
    classes.map((c) => {
      const m = memoryOf(c)
      return [c.class, { flat: String(m.flat), cell: String(m.cell) }]
    }),
  )
}

/** The classes with the draft's memory written in, a blank read as 0. Everything else is kept as it
 *  came, so the table sent back is the one the season has with two numbers per class changed. */
export function withMemory(classes: SeasonWeightClass[], draft: MemoryDraft): SeasonWeightClass[] {
  return classes.map((c) => {
    const d = draft[c.class]
    if (!d) return c
    return { ...c, memory_flat_bytes: Number(d.flat.trim() || 0), memory_cell_bytes: Number(d.cell.trim() || 0) }
  })
}

export function memoryChanged(classes: SeasonWeightClass[], draft: MemoryDraft): boolean {
  return withMemory(classes, draft).some((c, i) => {
    const a = memoryOf(c), b = memoryOf(classes[i])
    return a.flat !== b.flat || a.cell !== b.cell
  })
}
