// Turning API values into the words the pages print. One place, because the same
// number appears on several pages. en-GB throughout.

const KIB = 1024
const UNITS: [number, string][] = [
  [KIB ** 3, 'GiB'],
  [KIB ** 2, 'MiB'],
  [KIB, 'KiB'],
]

const DASH = '—'

function size(n: number | null | undefined, round: (v: number) => string): string {
  if (n === null || n === undefined) return DASH
  for (const [scale, unit] of UNITS) {
    if (n >= scale) return `${round(n / scale)} ${unit}`
  }
  return `${n} B`
}

function trim(v: number): string {
  return v >= 100 ? v.toFixed(0) : v.toFixed(1)
}

/** Compressed sizes, in the units the weight classes are named in. */
export function bytes(n: number | null | undefined): string {
  return size(n, trim)
}

/** A cap is a round number and reads wrong with a decimal point on it. */
export function cap(n: number | null | undefined): string {
  return size(n, (v) => String(Math.round(v)))
}

export function num(n: number | null | undefined): string {
  return n === null || n === undefined ? DASH : n.toLocaleString('en-GB')
}

/** Ratings are mu − 3σ and are printed to one decimal everywhere. */
export function rating(n: number | null | undefined): string {
  return n === null || n === undefined ? DASH : n.toFixed(1)
}

export function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}`
}

/** Microseconds as a turn cost. The platform measures no FLOPs: there is no compute cap, and the
 *  turn deadline is the bound (devops decision 46). */
export function micros(n: number | null | undefined): string {
  if (n === null || n === undefined) return DASH
  if (n >= 1e6) return `${trim(n / 1e6)} s per turn`
  if (n >= 1e3) return `${trim(n / 1e3)} ms per turn`
  return `${Math.round(n)} µs per turn`
}

/** Milliseconds since an ISO timestamp, or null when it is absent or unparseable. */
function at(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

export function date(iso: string | null | undefined): string {
  const t = at(iso)
  if (t === null) return DASH
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function dateTime(iso: string | null | undefined): string {
  const t = at(iso)
  if (t === null) return DASH
  return `${date(iso)}, ${new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

/** "2m ago". Read from the client's clock against a server timestamp, so it is
 *  approximate by construction and never claims a precision it lacks. */
export function ago(iso: string | null | undefined): string {
  const t = at(iso)
  if (t === null) return DASH
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d < 30 ? `${d}d ago` : date(iso)
}

export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return DASH
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

export function ms(v: number | null | undefined): string {
  if (v === null || v === undefined) return DASH
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)} ms`
}

/** Whole days until a deadline, floored — "13 days left" must not round up to a
 *  day the reader does not have. */
export function daysUntil(iso: string | null | undefined): number | null {
  const t = at(iso)
  return t === null ? null : Math.floor((t - Date.now()) / 86_400_000)
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many
}

/** A hash is 71 characters and no layout wants all of them. */
export function shortHash(h: string | null | undefined): string {
  if (!h) return DASH
  const hex = h.startsWith('sha256:') ? h.slice(7) : h
  return hex.length <= 16 ? h : `sha256:${hex.slice(0, 8)}…${hex.slice(-6)}`
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
  const t = at(iso)
  return t === null ? '' : new Date(t).toISOString().slice(0, 10)
}

/** A date the admin typed, as the timestamptz Soma stores. Midnight UTC: the
 *  season boundary is a policy instant, not a local one. */
export function dateToIso(value: string): string {
  return value ? new Date(`${value}T00:00:00Z`).toISOString() : ''
}
