// Turning API values into the words the pages print.
//
// One place, because the same number appears on several pages and two pages
// disagreeing about how many decimals a rating has is the kind of thing nobody
// reports. en-GB throughout: the studies decided the date and thousands style.

const KIB = 1024

/** Compressed sizes, in the units the weight classes are named in. */
export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n < KIB) return `${n} B`
  if (n < KIB * KIB) return `${trim(n / KIB)} KiB`
  if (n < KIB * KIB * KIB) return `${trim(n / (KIB * KIB))} MiB`
  return `${trim(n / (KIB * KIB * KIB))} GiB`
}

/** A cap is a round number and reads wrong with a decimal point on it. */
export function cap(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n < KIB) return `${n} B`
  if (n < KIB * KIB) return `${Math.round(n / KIB)} KiB`
  if (n < KIB * KIB * KIB) return `${Math.round(n / (KIB * KIB))} MiB`
  return `${Math.round(n / (KIB * KIB * KIB))} GiB`
}

function trim(v: number): string {
  return v >= 100 ? v.toFixed(0) : v.toFixed(1)
}

export function num(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toLocaleString('en-GB')
}

/** Ratings are mu − 3σ and are printed to one decimal everywhere. */
export function rating(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toFixed(1)
}

export function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}`
}

export function flops(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const units: [number, string][] = [
    [1e12, 'TFLOP'],
    [1e9, 'GFLOP'],
    [1e6, 'MFLOP'],
    [1e3, 'kFLOP'],
  ]
  for (const [scale, unit] of units) {
    if (n >= scale) return `${trim(n / scale)} ${unit} per turn`
  }
  return `${Math.round(n)} FLOP per turn`
}

export function date(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${date(iso)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

/** "2m ago". Rendered from the client's clock against a server timestamp, so it
 *  is approximate by construction and never claims a precision it lacks. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const s = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return date(iso)
}

/** How long something has been waiting, said the way the version page says it. */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—'
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

export function ms(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)} ms`
}

/** Whole days between now and a deadline, floored -- "13 days left" must not
 *  round up to a day the reader does not have. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((t - Date.now()) / 86_400_000)
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many
}

/** A hash is 71 characters and no layout wants all of them. */
export function shortHash(h: string | null | undefined): string {
  if (!h) return '—'
  const hex = h.startsWith('sha256:') ? h.slice(7) : h
  if (hex.length <= 16) return h
  return `sha256:${hex.slice(0, 8)}…${hex.slice(-6)}`
}

/** Two letters for the avatar, from whatever the person is actually called. */
export function initials(name: string | null | undefined, handle: string): string {
  const source = (name ?? '').trim() || handle
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toLowerCase()
  return source.slice(0, 2).toLowerCase()
}

export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/** An input for <input type="date">, from an ISO timestamp. */
export function dateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** A date the admin typed, as the timestamptz Soma stores. Midnight UTC: the
 *  season boundary is a policy instant, not a local one. */
export function dateToIso(value: string): string {
  return value ? new Date(`${value}T00:00:00Z`).toISOString() : ''
}
