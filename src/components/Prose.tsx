// Long text a person wrote, a model's story or a team post, drawn as elements and never as HTML.
//
// A SMALL, CLOSED MARKDOWN: headings (#, ##, ###), paragraphs, bulleted and numbered lists, block
// quotes, fenced code, tables with a header row, and inside a line **bold**, *italic*, `code` and
// [words](link). Anything else is text as typed. A link is followed only when it is an app path
// (`/…`), `https://` or `mailto:`; any other target stays text, so `javascript:` never reaches an
// href. A line that is a match's address alone (`/matches/<id>` or its full URL) is an embed: the
// host draws it (a post shows a paused Player), and without a host it is a link.

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

type Block =
  | { kind: 'h'; level: 2 | 3 | 4; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'match'; id: string }

const MATCH_LINE = /^(?:https?:\/\/[^/\s]+)?\/matches\/([0-9a-f-]{36})\/?(?:[?#]\S*)?$/i

function parse(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const out: Block[] = []
  let i = 0
  const para: string[] = []
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join(' ') })
    para.length = 0
  }
  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()
    if (t === '') {
      flush()
      i++
      continue
    }
    if (t.startsWith('```')) {
      flush()
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++])
      i++
      out.push({ kind: 'code', text: body.join('\n') })
      continue
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(t)
    if (h) {
      flush()
      out.push({ kind: 'h', level: (h[1].length + 1) as 2 | 3 | 4, text: h[2] })
      i++
      continue
    }
    const m = MATCH_LINE.exec(t)
    if (m) {
      flush()
      out.push({ kind: 'match', id: m[1].toLowerCase() })
      i++
      continue
    }
    if (/^[-*]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) {
      flush()
      const ordered = /^\d/.test(t)
      const items: string[] = []
      while (i < lines.length) {
        const x = lines[i].trim()
        const item = ordered ? /^\d+[.)]\s+(.*)$/.exec(x) : /^[-*]\s+(.*)$/.exec(x)
        if (item) items.push(item[1])
        else if (x !== '' && items.length && /^\s{2,}/.test(lines[i])) items[items.length - 1] += ` ${x}`
        else break
        i++
      }
      out.push({ kind: ordered ? 'ol' : 'ul', items })
      continue
    }
    if (t.startsWith('>')) {
      flush()
      const body: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) body.push(lines[i++].trim().replace(/^>\s?/, ''))
      out.push({ kind: 'quote', text: body.join(' ') })
      continue
    }
    if (t.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1].trim())) {
      flush()
      const cells = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim())
      const head = cells(t)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
      out.push({ kind: 'table', head, rows })
      continue
    }
    para.push(t)
    i++
  }
  flush()
  return out
}

function safeHref(href: string): string | null {
  if (href.startsWith('/') && !href.startsWith('//')) return href
  if (/^https:\/\//i.test(href) || /^mailto:/i.test(href)) return href
  return null
}

/** One line's inline marks, as elements. */
function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g
  let at = 0
  let k = key
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0
    if (i > at) out.push(text.slice(at, i))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<b key={k++}>{tok.slice(2, -2)}</b>)
    else if (tok.startsWith('`')) out.push(<code key={k++}>{tok.slice(1, -1)}</code>)
    else if (tok.startsWith('[')) {
      const [, words, href] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok) ?? []
      const to = safeHref(href ?? '')
      if (!to) out.push(tok)
      else if (to.startsWith('/')) out.push(<Link to={to} key={k++}>{words}</Link>)
      else
        out.push(
          <a href={to} target="_blank" rel="noopener nofollow" key={k++}>
            {words}
          </a>,
        )
    } else out.push(<i key={k++}>{tok.slice(1, -1)}</i>)
    at = i + tok.length
  }
  if (at < text.length) out.push(text.slice(at))
  return out
}

export function Prose({
  text,
  embed,
  className,
}: {
  text: string
  /** Draws a match named on a line of its own. Without it, the line is a link to the match. */
  embed?: (id: string) => ReactNode
  className?: string
}) {
  const blocks = parse(text)
  return (
    <div className={cx('prose', className)}>
      {blocks.map((b, n) => {
        switch (b.kind) {
          case 'h': {
            const H = `h${b.level}` as 'h2' | 'h3' | 'h4'
            return <H key={n}>{inline(b.text)}</H>
          }
          case 'p':
            return <p key={n}>{inline(b.text)}</p>
          case 'ul':
          case 'ol': {
            const L = b.kind
            return (
              <L key={n}>
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it)}</li>
                ))}
              </L>
            )
          }
          case 'quote':
            return <blockquote key={n}>{inline(b.text)}</blockquote>
          case 'code':
            return (
              <pre key={n}>
                <code>{b.text}</code>
              </pre>
            )
          case 'table':
            return (
              <div className="tscroll" key={n}>
                <table className="table">
                  <thead>
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j}>{inline(c)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, x) => (
                          <td key={x}>{inline(c)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'match':
            return embed ? (
              <div className="prose-embed" key={n}>
                {embed(b.id)}
              </div>
            ) : (
              <p key={n}>
                <Link to={`/matches/${b.id}`}>{`/matches/${b.id}`}</Link>
              </p>
            )
        }
      })}
    </div>
  )
}
