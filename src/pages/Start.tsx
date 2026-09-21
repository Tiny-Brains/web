// `/start` — the five steps from a clone to a place on the ladder.
//
// Both hero buttons on the home page land here, so it is the first page most
// people read. It says the whole shape once and HANDS OFF TO THE BOOK rather than
// repeating it: nothing here is a second copy of a rule.
//
// EVERY COMMAND HERE IS REAL. Each block was run before it was written down: the starter's
// self-play match and `tinybrains check` against its entry, its `train.py` (which is
// ants/baselines' collect / clone / export as one command, and produced the entry it ships),
// the manifest from the book's own minimal example. The first page a developer reads must not be
// the first thing that fails when copied -- it used to clone a repository that did not exist and
// run a `drill` command nobody shipped. Each step also says what it prints when it worked, from
// those same runs, and which steps are one command and which take thought.

import { Link } from 'react-router-dom'
import { Fragment } from 'react'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { cap } from '../lib/format'
import { Shell } from '../components/Shell'
import { KeyValueList, PageHeader, Rich, StepTracker } from '../components/ui'
import { ClassScale } from '../components/Model'
import T from '../../copy/start.json'

/** The book is served by nginx at this origin, not routed by the SPA; a GitHub link is not ours
 *  at all. Only a path of this application goes through the router. */
function routed(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('/docs')
}

function DocLink({ label, href }: { label: string; href: string }) {
  if (routed(href))
    return (
      <Link className="doc" to={href}>
        {label} →
      </Link>
    )
  const out = href.startsWith('http')
  return (
    <a className="doc" href={href} rel={out ? 'noopener' : undefined}>
      {label} {out ? '↗' : '→'}
    </a>
  )
}

/** Where a line's comment starts: 0 for a line that is one (`#` or `//`), the `#` of a trailing
 *  ` # comment` on a command, and -1 for a line with none. */
function commentAt(line: string): number {
  if (line.startsWith('#') || line.startsWith('//')) return 0
  const at = line.indexOf(' # ')
  return at < 0 ? -1 : at + 1
}

/** A step's commands, line for line as the JSON has them, with each comment dimmed. */
function Code({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const at = commentAt(line)
        return (
          <Fragment key={i}>
            {i > 0 ? '\n' : null}
            {at < 0 ? line : at > 0 ? line.slice(0, at) : null}
            {at < 0 ? null : <span className="c">{line.slice(at)}</span>}
          </Fragment>
        )
      })}
    </>
  )
}

export default function Start() {
  const { season, gameName } = usePlatform()
  const classes = useWeightClasses()
  const largest = classes.at(-1) ?? null
  const M = T.measured
  const hint = largest ? (season ? M.hintLargestSeason : M.hintLargest) : season ? M.hintSeason : M.hint

  return (
    <Shell title={T.tab}>
      <PageHeader
        crumbs={[{ label: T.header.crumb }]}
        title={T.header.title}
        sub={T.header.sub}
        actions={
          <>
            <a className="btn primary" href="/docs/quickstart">
              {T.header.quickstart}
            </a>
            <Link className="btn" to="/matches">
              {T.header.watch}
            </Link>
          </>
        }
      />
      <div className="wrap page-body doc">
        <div className="prose">
          <h2 id="measured">{M.heading}</h2>
          <p className="muted">{M.body}</p>
          <div style={{ marginTop: 16 }}>
            <ClassScale classes={classes} />
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            <Rich
              text={hint}
              vars={{ cap: largest ? cap(largest.max_bytes) : '', game: gameName, season: season?.name ?? '' }}
            />
          </p>

          <h2 id="need">{T.need.heading}</h2>
          <KeyValueList items={T.need.items} />

          <h2 id="turn">{T.turn.heading}</h2>
          <ol className="steplist">
            {T.turn.stages.map(({ title, code, said, via }) => (
              <li key={title}>
                <div>
                  <h3>{title}</h3>
                  <pre className="code-block">{code}</pre>
                  <p className="see">{said}</p>
                  {via ? <p className="see"><b>{T.turn.then}</b> {via}</p> : null}
                </div>
              </li>
            ))}
          </ol>
          <p className="doclinks">
            {T.turn.docs.map(({ label, href }) => (
              <a href={href} key={href}>
                {label}
              </a>
            ))}
          </p>

          <h2 id="steps">{T.steps.heading}</h2>
          <ol className="steplist">
            {T.steps.items.map((step) => (
              <li key={step.title}>
                <div>
                  <h3>
                    {step.title}
                    <span className="tag">{step.tag}</span>
                  </h3>
                  {step.paragraphs.map((t) => (
                    <p key={t}>{t}</p>
                  ))}
                  <pre className="code-block">
                    <Code text={step.code} />
                  </pre>
                  <p className="see">
                    <b>{T.steps.see}</b> <Rich text={step.see} />
                  </p>
                  <p className="doclinks">
                    {step.docs.map(({ label, href }) => (
                      <DocLink label={label} href={href} key={href} />
                    ))}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <h2 id="after">{T.after.heading}</h2>
          <StepTracker steps={T.after.steps.map((label) => ({ label, tone: 'done' as const }))} say={T.after.say} />

          <h2 id="next">{T.next.heading}</h2>
          <div className="row">
            <Link className="btn primary" to="/submit">
              {T.next.submit}
            </Link>
            <Link className="btn" to="/faq">
              {T.next.faq}
            </Link>
            <a className="btn" href="/docs">
              {T.next.book}
            </a>
          </div>
        </div>
        <nav className="toc" aria-label={T.toc.label}>
          <b>{T.toc.heading}</b>
          {T.toc.items.map(({ id, label }) => (
            <a href={`#${id}`} key={id}>
              {label}
            </a>
          ))}
        </nav>
      </div>
    </Shell>
  )
}
