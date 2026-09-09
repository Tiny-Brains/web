// The furniture every page is built from.
//
// Each of these appears on three routes or more; anything only one page draws
// stays in that page. They are thin on purpose -- the styling lives in
// layout.css and these components exist so that the class names, the element
// order and the accessible shape are decided once.

import type { ReactNode } from 'react'
import { Icon, type IconId } from './Icon'

// ---- pills -------------------------------------------------------------------------
// Never colour alone: the pill's word is the state, and the colour agrees with it.

export type PillTone = 'ok' | 'open' | 'wait' | 'settling' | 'closed' | 'scheduled' | 'bad'

export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>
}

/** The four season states, worded and toned the same way wherever one appears. */
export function SeasonPill({ state }: { state: 'scheduled' | 'open' | 'settling' | 'closed' }) {
  const tone: Record<string, PillTone> = { open: 'open', scheduled: 'scheduled', settling: 'settling', closed: 'closed' }
  const word: Record<string, string> = { open: 'Open', scheduled: 'Scheduled', settling: 'Settling', closed: 'Closed' }
  return <Pill tone={tone[state]}>{word[state]}</Pill>
}

// ---- cards -------------------------------------------------------------------------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className ? `card ${className}` : 'card'}>{children}</div>
}

export function CardHead({ title, end, children }: { title: ReactNode; end?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card-head">
      <h3>{title}</h3>
      {children}
      {end !== undefined && end !== null ? <span className="end">{end}</span> : null}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className ? `card-body ${className}` : 'card-body'}>{children}</div>
}

export function CardFoot({ children }: { children: ReactNode }) {
  return <div className="card-foot">{children}</div>
}

// ---- section and page headings ------------------------------------------------------

export function SectionHead({ title, sub, end }: { title: ReactNode; sub?: ReactNode; end?: ReactNode }) {
  return (
    <div className="sec-head">
      <h2>{title}</h2>
      {sub ? <span className="sub">{sub}</span> : null}
      {end ? <div className="end">{end}</div> : null}
    </div>
  )
}

/** A permalink's masthead: what this record is, stated rather than chosen. */
export function PageHead({
  back,
  title,
  badges,
  end,
  sub,
  className,
}: {
  back?: ReactNode
  title: ReactNode
  badges?: ReactNode
  end?: ReactNode
  sub?: ReactNode
  className?: string
}) {
  return (
    <section className={className ? `wrap page-head ${className}` : 'wrap page-head'}>
      {back}
      <div className="page-title">
        {title}
        {badges}
        {end ? <div className="end">{end}</div> : null}
      </div>
      {sub ? <p className="page-sub">{sub}</p> : null}
    </section>
  )
}

// ---- notes: a sentence in a box, never a code ---------------------------------------

export function Note({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'bad' | 'ok'
  title?: ReactNode
  children?: ReactNode
}) {
  const icon: Record<string, IconId> = { info: 'i-info', warn: 'i-clock', bad: 'i-alert', ok: 'i-check' }
  return (
    <div className={tone === 'info' ? 'note' : `note ${tone}`}>
      <Icon id={icon[tone]} />
      <div>
        {title ? <b>{title}</b> : null}
        {children}
      </div>
    </div>
  )
}

// ---- the three things a data region can be ------------------------------------------

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Loading({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skel" key={i} />
      ))}
    </div>
  )
}

/**
 * A placeholder shaped like the text it stands in for.
 *
 * `height: 1em` is what makes this hold the layout rather than approximate it:
 * an inline-block of one em sits in a line box whose height is the parent's
 * line-height, so a row of skeletons is exactly as tall as the row of text that
 * replaces it. A block of a guessed pixel height is what makes a page jump when
 * its data lands.
 */
export function Skel({ w = '100%', title }: { w?: string | number; title?: string }) {
  return (
    <span
      className="skel"
      aria-hidden="true"
      title={title}
      style={{ display: 'inline-block', height: '1em', verticalAlign: 'middle', width: typeof w === 'number' ? `${w}px` : w }}
    />
  )
}

// ---- facts, steps and key/value rows ------------------------------------------------

export type Fact = { label: ReactNode; value: ReactNode }

export function Facts({ items, cols }: { items: Fact[]; cols?: number }) {
  return (
    <div className="facts" style={cols ? ({ '--cols': cols } as React.CSSProperties) : undefined}>
      {items.map((f, i) => (
        <div key={i}>
          <small>{f.label}</small>
          <b>{f.value}</b>
        </div>
      ))}
    </div>
  )
}

export type KeyValue = { key: ReactNode; value: ReactNode; hint?: ReactNode }

export function KeyValues({ items, className }: { items: KeyValue[]; className?: string }) {
  return (
    <dl className={className ? `kvs ${className}` : 'kvs'}>
      {items.map((r, i) => (
        <div className="kv" key={i}>
          <dt>{r.key}</dt>
          <dd>
            {r.value}
            {r.hint ? <span className="hint">{r.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** submitted → admitted → trial → active, with rejection as its own end. */
export type StepTone = 'done' | 'now' | 'bad' | 'todo'
export type Step = { label: string; tone: StepTone }

export function Steps({ steps, say }: { steps: Step[]; say?: ReactNode }) {
  return (
    <div className="progress">
      <div className="steps">
        {steps.map((s) => (
          <div className={s.tone === 'todo' ? 's' : `s ${s.tone}`} key={s.label}>
            <i />
            {s.label}
          </div>
        ))}
      </div>
      {say ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>{say}</p> : null}
    </div>
  )
}

// ---- form primitives -----------------------------------------------------------------

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

export type Option = { value: string; label: string }

/** A labelled select, as the matches filter bar and the admin form both draw it. */
export function LabelledSelect({
  label,
  value,
  options,
  onChange,
  id,
}: {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  id?: string
}) {
  return (
    <label className="f" htmlFor={id}>
      <span>{label}</span>
      <select className="input" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option value={o.value} key={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
