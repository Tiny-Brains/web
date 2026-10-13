// Reading the site's words. Every sentence the site shows lives in web/copy/<language>/*.json --
// one file per page, and common.json for what several pages or components draw -- and the English
// is imported, so a key that is misspelt or missing fails `tsc -b` rather than a page. The current
// language's rendering of a file comes from `useCopy` and `copy` in lib/lang.ts.
//
// A text may carry {placeholders}, filled here from values the page computes (a name, a number
// already formatted, a date), and light markup, which `<Rich>` in components/ui draws. A string
// that goes into an attribute (aria-label, title, placeholder) is filled here and carries no markup.

import { locale } from './lang'

export type Vars = Record<string, string | number>

/** A text with a form per plural category, chosen by a count. English has `one` and `other`;
 *  Chinese `other` alone; a language with `few` and `many` carries those too. `other` is the one
 *  every language has, and the form a category falls back to. */
export type Forms = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>

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

const RULES = new Map<string, Intl.PluralRules>()

/** The plural rules of the current language, one instance per language and type. */
function rules(type: 'cardinal' | 'ordinal'): Intl.PluralRules {
  const key = `${locale()}/${type}`
  let r = RULES.get(key)
  if (!r) {
    r = new Intl.PluralRules(locale(), { type })
    RULES.set(key, r)
  }
  return r
}

/** The form for `n` in the current language, filled. {n} is `n` itself unless `vars` gives it
 *  already formatted. `ordinal` picks by position (1st, 2nd, 3rd) rather than by amount. */
export function count(forms: Forms, n: number, vars: Vars = {}, type: 'cardinal' | 'ordinal' = 'cardinal'): string {
  return fill(forms[rules(type).select(n)] ?? forms.other, { n, ...vars })
}
