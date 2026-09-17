// The icon set, as one sprite mounted once and referenced by id: an icon appears
// hundreds of times on a busy page and only the reference should be repeated.

export type IconId =
  | 'i-medal' | 'i-draw' | 'i-dq'
  | 'i-up' | 'i-down'
  | 'i-check' | 'i-chevron' | 'i-alert' | 'i-clock' | 'i-info'
  | 'i-anchor' | 'i-settling' | 'i-flask' | 'i-live' | 'i-x'
  | 'i-keyboard' | 'i-table' | 'i-scatter' | 'i-map' | 'i-hash'
  | 'i-github'
  | 'i-calendar' | 'i-server'
  | 'i-bell' | 'i-seats' | 'i-rank' | 'i-trophy' | 'i-key' | 'i-settings' | 'i-menu' | 'i-ext' | 'i-link' | 'i-plus'

/** An icon with a label is content and is announced; one without is decoration
 *  beside text that already says the same thing, and is hidden.
 *
 *  A LABELLED ICON ALSO SHOWS ITS LABEL ON HOVER. Where an icon stands in for a word -- a class,
 *  a baseline, a settling rating -- the word is its accessible name and its tooltip, so the row
 *  loses the text and no reader loses the meaning. */
export function Icon({ id, className, label }: { id: IconId; className?: string; label?: string }) {
  return (
    <svg
      className={className ? `ico ${className}` : 'ico'}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {label ? <title>{label}</title> : null}
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
      <symbol id="i-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9.5 12 15.5 18 9.5" />
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
      {/* A baseline: the platform's reference entry, the fixed point others are measured from. */}
      <symbol id="i-anchor" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="5" r="2.2" />
        <path d="M12 7.2V21M8 11h8M4.5 13.5a7.5 7.5 0 0 0 15 0" />
      </symbol>
      {/* A provisional rating: half settled. */}
      <symbol id="i-settling" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 3.5a8.5 8.5 0 0 0 0 17Z" fill="currentColor" stroke="none" />
      </symbol>
      <symbol id="i-flask" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3h6M10 3v6l-5.4 9.4A1.7 1.7 0 0 0 6.1 21h11.8a1.7 1.7 0 0 0 1.5-2.6L14 9V3M7.2 15h9.6" />
      </symbol>
      <symbol id="i-live" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="8.5" opacity=".45" />
      </symbol>
      <symbol id="i-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
      </symbol>
      <symbol id="i-keyboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9" />
      </symbol>
      <symbol id="i-table" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </symbol>
      <symbol id="i-scatter" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 4v16h16" />
        <circle cx="9" cy="14" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="13" cy="8.5" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="17.5" cy="11.5" r="1.8" fill="currentColor" stroke="none" />
      </symbol>
      <symbol id="i-map" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5ZM9 4v13.5M15 6.5V20" />
      </symbol>
      <symbol id="i-hash" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />
      </symbol>
      {/* The admin pages: a season is a window of dates, a runner a machine in a rack. */}
      <symbol id="i-calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </symbol>
      <symbol id="i-server" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="4" width="17" height="7" rx="1.5" />
        <rect x="3.5" y="13" width="17" height="7" rx="1.5" />
        <path d="M7.5 7.5h.01M7.5 16.5h.01" />
      </symbol>
      <symbol id="i-bell" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15ZM10 20.5a2.2 2.2 0 0 0 4 0" />
      </symbol>
      <symbol id="i-seats" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="8.5" cy="8" r="3" />
        <circle cx="16.5" cy="9" r="2.4" />
        <path d="M2.8 19.5a5.8 5.8 0 0 1 11.4 0M14.5 19.2a4.5 4.5 0 0 1 7-3.4" />
      </symbol>
      <symbol id="i-rank" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20V5M6 11l6-6 6 6" />
      </symbol>
      <symbol id="i-trophy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3.5h10v4.5a5 5 0 0 1-10 0ZM12 13v3.5M8.5 20.5h7M7 5H4a3 3 0 0 0 3 4.5M17 5h3a3 3 0 0 1-3 4.5" />
      </symbol>
      <symbol id="i-key" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="15.5" r="4.5" />
        <path d="m11.3 12.2 8.7-8.7M17 6.5l2.5 2.5" />
      </symbol>
      <symbol id="i-settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1" />
      </symbol>
      <symbol id="i-menu" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 7h16M4 12h16M4 17h16" />
      </symbol>
      <symbol id="i-ext" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 5H5v14h14v-5M14 4h6v6M20 4l-9 9" />
      </symbol>
      <symbol id="i-link" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.5 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M13.5 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
      </symbol>
      <symbol id="i-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
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
