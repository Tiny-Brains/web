import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { Icon } from './Icon'

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

/** `hint` is drawn muted at the end of the option in the open list, never on the button. */
export type Option = { value: string; label: string; hint?: string }

/**
 * A select drawn from the design tokens rather than by the operating system.
 *
 * A native <select> can be dressed, but the list it opens cannot: that is the
 * system's menu, in the system's type and colours whatever the theme. So this is
 * the listbox-button pattern: a button that names the current choice, and a
 * listbox that holds focus while it is open.
 *
 * The keys are a select's: arrows, Home and End, Enter or Space to choose, Escape
 * to back out, and typing jumps to a label. Tab, a click elsewhere or the window
 * losing focus closes it without choosing.
 */
export function Select({
  label,
  value,
  options,
  onChange,
  id,
  look = 'input',
  className,
}: {
  /** What is being chosen. The button is named by it and the current choice together. */
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  id?: string
  /** `input` sits in a form and is drawn as one; `pick` is the context strip's bare heading. */
  look?: 'input' | 'pick'
  className?: string
}) {
  const auto = useId()
  const base = id ?? auto
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const typed = useRef({ text: '', at: 0 })

  const chosen = options.findIndex((o) => o.value === value)
  const current = options[chosen]

  const show = () => {
    setActive(Math.max(chosen, 0))
    setOpen(true)
  }
  const hide = () => {
    setOpen(false)
    button.current?.focus()
  }
  const choose = (i: number) => {
    hide()
    if (options[i].value !== value) onChange(options[i].value)
  }

  // Opening hands focus to the list and turns it upward when the window has no
  // room below. The side is written straight onto the element because it is
  // measured, and nothing can be measured until the list exists.
  useLayoutEffect(() => {
    const l = list.current
    const b = button.current
    if (!open || !l || !b) return
    const r = b.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    l.dataset.side = below < l.offsetHeight + 12 && r.top > below ? 'up' : 'down'
    l.focus({ preventScroll: true })
  }, [open])

  // The active option is kept in view by scrolling the list alone. scrollIntoView
  // would scroll the page as well.
  useLayoutEffect(() => {
    const l = list.current
    const o = l?.children[active] as HTMLElement | undefined
    if (!open || !l || !o) return
    if (o.offsetTop < l.scrollTop) l.scrollTop = o.offsetTop
    else if (o.offsetTop + o.offsetHeight > l.scrollTop + l.clientHeight)
      l.scrollTop = o.offsetTop + o.offsetHeight - l.clientHeight
  }, [open, active])

  // Typing moves to the next label that starts with what was typed; a pause
  // starts the word again, as it does in a native select.
  const jump = (key: string, now: number) => {
    const t = typed.current
    t.text = now - t.at > 700 ? key : t.text + key
    t.at = now
    const q = t.text.toLowerCase()
    const from = t.text.length === 1 ? active + 1 : active
    for (let k = 0; k < options.length; k++) {
      const i = (from + k) % options.length
      if (options[i].label.toLowerCase().startsWith(q)) {
        setActive(i)
        return
      }
    }
  }

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1
    const moves: Record<string, number> = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: last }
    const to = moves[e.key]
    if (typeof to === 'number') {
      e.preventDefault()
      setActive(Math.min(Math.max(to, 0), last))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'Escape') {
      // Stopped here: an Escape that closed the list has been used up.
      e.preventDefault()
      e.stopPropagation()
      hide()
    } else if (e.key.length === 1 && !e.altKey && !e.ctrlKey && !e.metaKey) {
      jump(e.key, e.timeStamp)
    }
  }

  return (
    <div className={cx('select', look === 'pick' && 'pick', className)} ref={root}>
      {/* The press is cancelled so it never takes focus from an open list. Safari does
          not focus a clicked button, so the list would read the press as a click
          away and close, and the click would then open it again. */}
      <button
        ref={button}
        id={id}
        type="button"
        className={cx('select-btn', look === 'input' && 'input')}
        aria-label={`${label}: ${current?.label ?? 'nothing chosen'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${base}-list` : undefined}
        disabled={options.length === 0}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? hide() : show())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            show()
          }
        }}
      >
        {/* Every label is stacked in one cell and only the chosen one shows, so the
            button is as wide as its widest option, as a native select is, and
            choosing never moves what sits beside it. */}
        <span className="select-value">
          <span>{current?.label}</span>
          {options.map((o) => (
            <span aria-hidden="true" key={o.value}>
              {o.label}
            </span>
          ))}
        </span>
        <Icon id="i-chevron" />
      </button>

      {open ? (
        <ul
          ref={list}
          id={`${base}-list`}
          className="select-list"
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${base}-${active}`}
          onKeyDown={onListKey}
          onBlur={(e) => {
            if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
          }}
        >
          {options.map((o, i) => (
            <li
              id={`${base}-${i}`}
              key={o.value}
              role="option"
              aria-selected={i === chosen}
              className={cx('select-opt', i === active && 'active')}
              onMouseMove={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <Icon id="i-check" />
              <span>{o.label}</span>
              {o.hint ? <small>{o.hint}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** A select with its label above it, as the matches filter bar draws it. The label
 *  sits beside the control, not round it: a <label> wrapped round the open list
 *  would forward every click on an option back to the button and reopen it. */
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
  const auto = useId()
  return (
    <div className="f">
      <label htmlFor={id ?? auto}>{label}</label>
      <Select id={id ?? auto} label={label} value={value} options={options} onChange={onChange} />
    </div>
  )
}
