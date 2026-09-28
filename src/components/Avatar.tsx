// Somebody's initials, in a circle.
//
// SOMA RETURNS NO AVATAR, AND NO PROVIDER. An account may sign in with GitHub or with any other
// provider the deployment configures, and a handle is seeded once, at the first sign-in, not synced
// from anywhere -- so `github.com/<handle>.png` would be a stranger's face for an account that came
// from elsewhere, or for a GitHub login that has changed hands since. Until the API says which
// identity an account has, the initials are the one picture that is always right.

import { initials } from '../lib/format'

export function Avatar({
  handle,
  name,
  size = 'sm',
  alt,
}: {
  handle: string
  name?: string | null
  size?: 'xs' | 'sm' | 'lg'
  alt?: string
}) {
  return (
    <span
      className={size === 'sm' ? 'avatar' : `avatar ${size}`}
      role={alt ? 'img' : undefined}
      aria-label={alt}
      aria-hidden={alt ? undefined : true}
    >
      {initials(name, handle)}
    </span>
  )
}
