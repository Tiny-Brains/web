// The site's languages, and the words of the one the reader chose.
//
// EVERY WORD LIVES IN copy/<language>/<page>.json, AND copy/en-GB/ IS THE SCHEMA. A page imports
// its English file -- so a misspelt key fails `tsc -b`, and the English rides the chunk that needs
// it -- and reads the current language's rendering of it through `useCopy`. A translation is laid
// over the English key by key, so a sentence a language lacks is said in English rather than not
// at all; `copy.test.ts` fails on the lack, so it is never shipped unseen.
//
// THE LANGUAGE IS THE READER'S, like the theme: a stored choice, else the browser's languages,
// else English. There is no path prefix, no cookie and nothing the server sees, so a crawler, the
// unfurl titles in nginx.conf and the feed read English.
//
// ADDING A LANGUAGE is a folder and a line: copy copy/en-GB/ to copy/<tag>/, translate the
// values (copy/README.md says how), and add the tag to LANGUAGES. The glob below finds the
// folder, the test holds it to the English shape, and the switches in the shell draw it.
//
// WHO MAY READ WHAT. A component calls `useCopy`, which re-renders it when the language changes
// and waits, through Suspense, for a translation that has not arrived. A plain function --
// `lib/format.ts`, a refusal table, a helper beside a page -- calls `copy`, which answers at once
// with what is loaded: right during a render and in a handler, because the component that got
// there first waited for it. NOTHING AT MODULE LEVEL READS EITHER: a `const P = T.profile` at the
// top of a file is evaluated once, in the language of the moment the chunk loaded, and never again.

import { use, useSyncExternalStore } from 'react'
import enCommon from '../../copy/en-GB/common.json'

/** Every language the site speaks, by BCP 47 tag: the folder under copy/, the `lang` on <html>,
 *  the locale `Intl` formats with, and the stored choice. `name` is the language's own name for
 *  itself, which is the one word that is the same in every language. `excerpt` is how many of
 *  its characters make a card's two lines. */
export const LANGUAGES = {
  'en-GB': { name: 'English', excerpt: 240 },
  'zh-CN': { name: '简体中文', excerpt: 120 },
} as const

export type Lang = keyof typeof LANGUAGES
export const DEFAULT_LANG: Lang = 'en-GB'
const TAGS = Object.keys(LANGUAGES) as Lang[]
const KEY = 'tb.lang'

// One loader per translated file, each its own chunk, so a page's words in another language come
// with the page and not with the shell. English is left out because every page imports its own
// English file statically; the exclusion names the default language because a glob is literal.
const FILES = import.meta.glob<unknown>(['../../copy/*/*.json', '!../../copy/en-GB/*.json'], { import: 'default' })

let current: Lang = DEFAULT_LANG
/** `${lang}/${page}` → that page's words in that language, laid over the English. */
const ready = new Map<string, object>()
const inFlight = new Map<string, Promise<object>>()
const listeners = new Set<() => void>()

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const snapshot = () => current

function stored(): Lang | null {
  try {
    const v = localStorage.getItem(KEY)
    return TAGS.find((t) => t === v) ?? null
  } catch {
    // Reading storage can throw outright, not only return null.
    return null
  }
}

/** The browser's first language the site has: by the whole tag, then by the language alone, so
 *  en-US is English and zh-TW is the Chinese there is until a closer one is added. */
function detected(): Lang {
  let wants: readonly string[] = []
  try {
    wants = navigator.languages?.length ? navigator.languages : [navigator.language]
  } catch {
    // No navigator (a test, a hostile embedding): English.
  }
  for (const want of wants) {
    const w = want.toLowerCase()
    const exact = TAGS.find((t) => t.toLowerCase() === w)
    if (exact) return exact
    const primary = w.split('-')[0]
    const near = TAGS.find((t) => t.split('-')[0].toLowerCase() === primary)
    if (near) return near
  }
  return DEFAULT_LANG
}

const CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other'])
const isForms = (o: object): boolean => 'other' in o && Object.values(o).every((v) => typeof v === 'string')

/** The English with each value the translation gives in its place. An object is read key by key,
 *  so a key the translation lacks is English; a list is taken whole, because the FAQ's questions
 *  are content and not a schema; a plural object may carry categories English has no use for. */
function over(en: unknown, tr: unknown): unknown {
  if (typeof en === 'string') return typeof tr === 'string' ? tr : en
  if (Array.isArray(en)) return Array.isArray(tr) ? tr : en
  if (en && typeof en === 'object') {
    if (!tr || typeof tr !== 'object' || Array.isArray(tr)) return en
    const t = tr as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(en)) out[k] = over(v, t[k])
    if (isForms(en)) for (const [k, v] of Object.entries(t)) if (!(k in out) && CATEGORIES.has(k) && typeof v === 'string') out[k] = v
    return out
  }
  return en
}

function load<T extends object>(lang: Lang, page: string, en: T): Promise<T> {
  const key = `${lang}/${page}`
  let p = inFlight.get(key)
  if (!p) {
    const file = FILES[`../../copy/${lang}/${page}.json`]
    if (!file && import.meta.env.DEV) console.error(`copy/${lang}/${page}.json: no such file, so the page stays in English`)
    p = (file ? file() : Promise.resolve({})).then((raw) => {
      if (import.meta.env.DEV && raw && typeof raw === 'object' && !Object.keys(raw).every((k) => k in en)) {
        console.error(`copy/${lang}/${page}.json has keys copy/en-GB/${page}.json lacks: is "${page}" the right file for this import?`)
      }
      const words = over(en, raw) as object
      ready.set(key, words)
      return words
    })
    // A fetch that failed is tried again by the next render, not remembered as failed for ever.
    p.catch(() => inFlight.delete(key))
    inFlight.set(key, p)
  }
  return p as Promise<T>
}

/** A page's words in the current language: `en` is the page's English file, imported by the
 *  page, and `page` names it (`copy/<lang>/<page>.json`). English answers at once; another
 *  language answers from what is loaded, or suspends until it is. */
export function useCopy<T extends object>(page: string, en: T): T {
  const lang = useSyncExternalStore(subscribe, snapshot, snapshot)
  if (lang === DEFAULT_LANG) return en
  return (ready.get(`${lang}/${page}`) as T | undefined) ?? use(load(lang, page, en))
}

/** The same words for code that is not a component: what is loaded now, else the English. */
export function copy<T extends object>(page: string, en: T): T {
  return current === DEFAULT_LANG ? en : ((ready.get(`${current}/${page}`) as T | undefined) ?? en)
}

/** The locale `Intl` formats dates and numbers with: the language's tag. */
export function locale(): Lang {
  return current
}

export function useLanguage(): [Lang, (lang: Lang) => void] {
  return [useSyncExternalStore(subscribe, snapshot, snapshot), choose]
}

/** Called before the first render, so the shell is never painted in a language the reader did
 *  not ask for and then redrawn. */
export async function initLanguage(): Promise<void> {
  await apply(stored() ?? detected(), false)
}

function choose(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // Not remembering is a smaller failure than not switching.
  }
  void apply(lang, true)
}

/** The shell's words first, so nothing above the page is ever drawn half-translated; each page's
 *  own follow through `useCopy`, behind the router's Suspense boundary. A shell that cannot be
 *  fetched leaves the site in English rather than down. */
async function apply(lang: Lang, notify: boolean): Promise<void> {
  let next = lang
  if (next !== DEFAULT_LANG) {
    try {
      await load(next, 'common', enCommon)
    } catch {
      next = DEFAULT_LANG
    }
  }
  current = next
  document.documentElement.lang = next
  if (notify) for (const fn of listeners) fn()
}
