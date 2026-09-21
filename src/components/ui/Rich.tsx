// A text from web/copy, drawn: its {placeholders} filled and its markup turned into elements.
//
//   *words*          italic, <i>
//   **words**        bold, <b>
//   `words`          code, <code>
//   [words](target)  a link: a path of this application is a router <Link>; the book (/docs), a
//                    file (/feed.xml) and another site are a plain <a>
//   {name}           a value from `vars` -- a string, a number, or an element such as a badge or
//                    a link the page builds itself. A target may carry string placeholders too.
//
// The markup is parsed into React elements; nothing is ever inserted as HTML.

import { Link } from 'react-router-dom'
import { Fragment, type ReactNode } from 'react'
import { fill } from '../../lib/copy'

export type RichVars = Record<string, ReactNode>

const TOKEN = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*|\{([A-Za-z]\w*)\}/g

/** A path this application routes: not the book, and not a file. */
function routed(to: string): boolean {
  return to.startsWith('/') && !/^\/docs(\/|$|#|\?)/.test(to) && !/\.[a-z0-9]+(?:[?#]|$)/i.test(to.split(/[?#]/)[0])
}

function textVars(vars: RichVars): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(vars)) if (typeof v === 'string' || typeof v === 'number') out[k] = v
  return out
}

function draw(text: string, vars: RichVars, key: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const k = `${key}.${i++}`
    const [whole, code, label, target, bold, italic, slot] = m
    if (code !== undefined) out.push(<code key={k}>{code}</code>)
    else if (label !== undefined) {
      const to = fill(target, textVars(vars))
      const body = draw(label, vars, k)
      out.push(
        routed(to) ? (
          <Link to={to} key={k}>
            {body}
          </Link>
        ) : (
          <a href={to} rel={to.startsWith('http') ? 'noopener' : undefined} key={k}>
            {body}
          </a>
        ),
      )
    } else if (bold !== undefined) out.push(<b key={k}>{draw(bold, vars, k)}</b>)
    else if (italic !== undefined) out.push(<i key={k}>{draw(italic, vars, k)}</i>)
    else if (slot !== undefined) out.push(Object.hasOwn(vars, slot) ? <Fragment key={k}>{vars[slot]}</Fragment> : whole)
    last = at + whole.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function Rich({ text, vars = {} }: { text: string; vars?: RichVars }) {
  return <>{draw(text, vars, 'r')}</>
}
