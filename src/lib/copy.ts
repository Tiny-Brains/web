// Reading the site's words. Every sentence the site shows lives in web/copy/*.json -- one file per
// page, and common.json for what several pages or components draw -- and is imported, so a key
// that is misspelt or missing fails `tsc -b` rather than a page.
//
// A text may carry {placeholders}, filled here from values the page computes (a name, a number
// already formatted, a date), and light markup, which `<Rich>` in components/ui draws. A string
// that goes into an attribute (aria-label, title, placeholder) is filled here and carries no markup.

export type Vars = Record<string, string | number>

/** A text with a singular and a plural form, chosen by a count. */
export type Forms = { one: string; other: string }

const SLOT = /\{([A-Za-z]\w*)\}/g

/** The text with each {name} replaced by its value. A placeholder with no value is left as
 *  written, so a missing one shows on the page rather than vanishing from a sentence. */
export function fill(text: string, vars: Vars = {}): string {
  return text.replace(SLOT, (whole, name: string) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole))
}

/** The sentence a table of API codes gives `code`, or undefined when it has none. Own keys only,
 *  so a code named like an object built-in (`constructor`) is never mistaken for a sentence. */
export function lookup(table: Record<string, string>, code: string): string | undefined {
  return Object.hasOwn(table, code) ? table[code] : undefined
}

/** The form for `n`, filled. {n} is `n` itself unless `vars` gives it already formatted. */
export function count(forms: Forms, n: number, vars: Vars = {}): string {
  return fill(n === 1 ? forms.one : forms.other, { n, ...vars })
}
