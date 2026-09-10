// The icon set, as one sprite mounted once and referenced by id: an icon appears
// hundreds of times on a busy page and only the reference should be repeated.

export type IconId =
  | 'i-medal' | 'i-draw' | 'i-dq'
  | 'i-up' | 'i-down'
  | 'i-check' | 'i-alert' | 'i-clock' | 'i-info'
  | 'i-github'

/** An icon with a label is content and is announced; one without is decoration
 *  beside text that already says the same thing, and is hidden. */
export function Icon({ id, className, label }: { id: IconId; className?: string; label?: string }) {
  return (
    <svg
      className={className ? `ico ${className}` : 'ico'}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <use href={`#${id}`} />
    </svg>
  )
}

export function Sprite() {
  return (
    <svg className="sprite" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      <symbol id="i-medal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M7.5 2.5 10.6 9.2M16.5 2.5 13.4 9.2" />
        <circle cx="12" cy="15.5" r="6" />
        <circle cx="12" cy="15.5" r="2.1" fill="currentColor" stroke="none" />
      </symbol>
      <symbol id="i-draw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 10h8M8 14h8" />
      </symbol>
      <symbol id="i-dq" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M5.6 5.6 18.4 18.4" />
      </symbol>
      <symbol id="i-up" viewBox="0 0 24 24">
        <path d="M12 5 21 19H3Z" fill="currentColor" />
      </symbol>
      <symbol id="i-down" viewBox="0 0 24 24">
        <path d="M12 19 3 5h18Z" fill="currentColor" />
      </symbol>
      <symbol id="i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12.5 9.5 18 20 6.5" />
      </symbol>
      <symbol id="i-alert" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 3.5 22 20.5H2Z" />
        <path d="M12 10v4.5" />
        <circle cx="12" cy="17.6" r="1.1" fill="currentColor" stroke="none" />
      </symbol>
      <symbol id="i-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6.6V12l3.6 2.4" />
      </symbol>
      <symbol id="i-info" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6" />
        <circle cx="12" cy="7.4" r="1.1" fill="currentColor" stroke="none" />
      </symbol>
      <symbol id="i-github" viewBox="0 0 16 16">
        <path
          fill="currentColor"
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
        />
      </symbol>
    </svg>
  )
}
