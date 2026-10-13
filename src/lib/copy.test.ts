// Every language says everything English says, and nothing else.
//
// copy/en-GB/ is the schema and the others are held to it here, because nothing else can: a
// translation is loaded at run time by lib/lang.ts, so `tsc -b` never sees it, and a key it lacks
// falls back to English on the page without a sound. This fails instead. What it holds a
// translation to: the same files, the same keys, the same kind of value under each, the same
// placeholders in each sentence, the same link targets, closed markup, and plural forms in the
// categories the language's own rules can select. A content list (the FAQ, the credits) may be a
// different length, and each item is held to the first English item's shape.
//
// It also reads the source for `useCopy('x', …)` and `copy('x', …)` and checks that copy/en-GB/x.json
// exists, since a misnamed page would load nothing and show English in every other language.

import { describe, expect, it } from 'vitest'
import { DEFAULT_LANG, LANGUAGES } from './lang'

const FILES = import.meta.glob<unknown>('../../copy/*/*.json', { eager: true, import: 'default' })
const SOURCES = import.meta.glob<string>(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts'], { eager: true, query: '?raw', import: 'default' })

type Tree = Record<string, Record<string, unknown>>

/** language → page → its words. */
const byLang: Record<string, Tree[string]> = {}
for (const [path, words] of Object.entries(FILES)) {
  const m = /\/copy\/([^/]+)\/([^/]+)\.json$/.exec(path)
  if (!m) continue
  ;(byLang[m[1]] ??= {})[m[2]] = words
}

const CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other'])
const SLOT = /\{([A-Za-z]\w*)\}/g
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g
/** Values under these keys are addresses, dates or identifiers, the same in every language. */
const OPAQUE = new Set(['href', 'to', 'date', 'id', 'url', 'src', 'target', 'path'])

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isForms = (v: unknown): v is Record<string, string> =>
  isRecord(v) && 'other' in v && Object.keys(v).every((k) => CATEGORIES.has(k)) && Object.values(v).every((x) => typeof x === 'string')
const slots = (s: string) => new Set(Array.from(s.matchAll(SLOT), (m) => m[1]))
const links = (s: string) => Array.from(s.matchAll(LINK), (m) => m[2]).sort()
const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x))
const markupClosed = (s: string) => {
  const body = s.replace(LINK, '$1')
  return (body.match(/`/g) ?? []).length % 2 === 0 && (body.match(/\*\*/g) ?? []).length % 2 === 0
}

/** The plural categories a language's rules can ever select, by amount or by position. */
function selectable(lang: string): Set<string> {
  const out = new Set<string>()
  for (const type of ['cardinal', 'ordinal'] as const) {
    for (const c of new Intl.PluralRules(lang, { type }).resolvedOptions().pluralCategories) out.add(c)
  }
  return out
}

function walk(en: unknown, tr: unknown, path: string, lang: string, out: string[], opaque = false): void {
  if (isForms(en)) {
    if (!isRecord(tr)) {
      out.push(`${path}: plural forms in English, ${typeof tr} in ${lang}`)
      return
    }
    if (typeof tr.other !== 'string') out.push(`${path}: plural forms without "other"`)
    const can = selectable(lang)
    const want = new Set<string>()
    for (const v of Object.values(en)) for (const s of slots(v)) want.add(s)
    for (const [k, v] of Object.entries(tr)) {
      if (!CATEGORIES.has(k)) out.push(`${path}.${k}: not a plural category`)
      else if (!can.has(k)) out.push(`${path}.${k}: a form ${lang}'s plural rules never select`)
      if (typeof v !== 'string') out.push(`${path}.${k}: not a string`)
      else for (const s of slots(v)) if (!want.has(s)) out.push(`${path}.${k}: placeholder {${s}} that English has not`)
    }
    return
  }
  if (isRecord(en)) {
    if (!isRecord(tr)) {
      out.push(`${path}: an object in English, ${Array.isArray(tr) ? 'a list' : typeof tr} in ${lang}`)
      return
    }
    for (const k of Object.keys(en)) {
      if (!(k in tr)) out.push(`${path}.${k}: missing`)
      else walk(en[k], tr[k], `${path}.${k}`, lang, out, OPAQUE.has(k))
    }
    for (const k of Object.keys(tr)) if (!(k in en)) out.push(`${path}.${k}: not in English`)
    return
  }
  if (Array.isArray(en)) {
    if (!Array.isArray(tr)) {
      out.push(`${path}: a list in English, ${typeof tr} in ${lang}`)
      return
    }
    if (en.length === 0) return
    tr.forEach((item, i) => walk(en.length === tr.length ? en[i] : en[0], item, `${path}[${i}]`, lang, out))
    return
  }
  if (typeof en === 'string') {
    if (typeof tr !== 'string') {
      out.push(`${path}: a string in English, ${typeof tr} in ${lang}`)
      return
    }
    if (opaque) {
      if (en !== tr) out.push(`${path}: an address or identifier changed (${JSON.stringify(en)} → ${JSON.stringify(tr)})`)
      return
    }
    if (!same(slots(en), slots(tr))) out.push(`${path}: placeholders differ (English {${[...slots(en)].join(', ')}}, ${lang} {${[...slots(tr)].join(', ')}})`)
    if (links(en).join(' ') !== links(tr).join(' ')) out.push(`${path}: link targets differ`)
    if (!markupClosed(tr)) out.push(`${path}: unclosed \` or ** markup`)
    return
  }
  if (en !== tr) out.push(`${path}: ${JSON.stringify(en)} in English, ${JSON.stringify(tr)} in ${lang}`)
}

const english = byLang[DEFAULT_LANG]
const others = Object.keys(LANGUAGES).filter((l) => l !== DEFAULT_LANG)

describe('copy/', () => {
  it('has a folder per language in LANGUAGES, and no other', () => {
    expect(Object.keys(byLang).sort()).toEqual(Object.keys(LANGUAGES).sort())
  })

  it('names, in useCopy and copy, only files English has', () => {
    const named = new Set<string>()
    for (const src of Object.values(SOURCES)) for (const m of src.matchAll(/\b(?:useCopy|copy)\(\s*'([^']+)'/g)) named.add(m[1])
    expect([...named].filter((page) => !(page in english))).toEqual([])
  })

  for (const lang of others) {
    describe(lang, () => {
      it('has every file English has, and no other', () => {
        expect(Object.keys(byLang[lang] ?? {}).sort()).toEqual(Object.keys(english).sort())
      })
      for (const page of Object.keys(english)) {
        it(`${page}.json says what English says`, () => {
          const out: string[] = []
          walk(english[page], byLang[lang]?.[page], '', lang, out)
          expect(out).toEqual([])
        })
      }
    })
  }
})
