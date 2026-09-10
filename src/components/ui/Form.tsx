import type { ReactNode } from 'react'

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
