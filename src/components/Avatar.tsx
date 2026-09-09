// Somebody's face, with their initials underneath it.
//
// SOMA DOES NOT RETURN AN AVATAR. `users` holds the GitHub id, the handle and a
// display name, and nothing else -- so the picture comes from GitHub's own
// avatar endpoint, which serves it for any public handle with no token and no
// API call. That is a request to github.com from the reader's browser, which is
// what signing in with GitHub already implies.
//
// The initials are rendered first and the picture on top of them, so a handle
// with no avatar, a blocked third-party request and a reader offline all get the
// same readable circle rather than an empty one.

import { useState } from 'react'
import { initials } from '../lib/format'

export function Avatar({
  handle,
  name,
  size = 'sm',
  alt,
}: {
  handle: string
  name?: string | null
  size?: 'sm' | 'lg'
  alt?: string
}) {
  const [broken, setBroken] = useState(false)
  // Asked for at twice the drawn size, so it is not soft on a retina screen.
  const px = size === 'lg' ? 128 : 60

  return (
    <span className={size === 'lg' ? 'avatar lg' : 'avatar'} aria-hidden={alt ? undefined : true}>
      {broken ? (
        initials(name, handle)
      ) : (
        <img
          src={`https://github.com/${encodeURIComponent(handle)}.png?size=${px}`}
          alt={alt ?? ''}
          width={px}
          height={px}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      )}
    </span>
  )
}
