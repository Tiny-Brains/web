// Somebody's face: the picture their identity provider serves, with their initials underneath it.
//
// THE PICTURE COMES FROM THE API AND IS NEVER DERIVED FROM THE HANDLE. It was once
// `github.com/<handle>.png`, which was right while GitHub was the only way in and wrong the moment
// it was not: a handle is seeded once at the first sign-in and never synced from anywhere, so for an
// account that arrived through another provider — or a GitHub login that has changed hands since —
// that address is a stranger's face. Soma caches the provider's own `picture` on the account
// (`users.avatar_url`, refreshed at every sign-in) and hands it to the routes that draw a person; a
// call site with none passes none, and no `src` is the ordinary case rather than a failure.
//
// THE INITIALS ARE DRAWN FIRST AND THE PICTURE OVER THEM, in the same grid cell, so a blocked
// third-party request, a provider that 404s, a reader offline and an account with no picture all end
// at one readable circle instead of a hole. What is remembered is the address that FAILED, not a
// flag: a flag would have to be cleared from an effect when the prop changed, and one account's
// broken picture would hide the next account's good one until that effect ran.

import { useState } from 'react'
import { initials } from '../lib/format'

type Size = 'xs' | 'sm' | 'lg'

/** The drawn size, which is also what the <img> reserves so nothing reflows when it lands. */
const PX: Record<Size, number> = { xs: 22, sm: 32, lg: 64 }

export function Avatar({
  handle,
  name,
  src,
  size = 'sm',
  alt,
}: {
  handle: string
  name?: string | null
  /** The provider's picture. Absent, null or broken is the initials. */
  src?: string | null
  size?: Size
  alt?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const px = PX[size]
  return (
    <span
      className={size === 'sm' ? 'avatar' : `avatar ${size}`}
      role={alt ? 'img' : undefined}
      aria-label={alt}
      aria-hidden={alt ? undefined : true}
    >
      <span>{initials(name, handle)}</span>
      {src && failed !== src ? (
        // alt="" always: the circle's own accessible name is `alt` on the parent, and a second one
        // here would have a screen reader read the person twice.
        <img
          src={src}
          alt=""
          width={px}
          height={px}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
        />
      ) : null}
    </span>
  )
}
