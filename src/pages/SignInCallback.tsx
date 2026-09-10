// `/signin/callback` — where GitHub sends you back.
//
// Almost always a page nobody reads, so the WHOLE DESIGN PROBLEM IS THE FAILURE:
// the state cookie never arrived. That failure is invisible from the outside — the
// request succeeds, the log says nothing, and the only symptom is that you are
// still signed out.
//
// Orion's oauth2_login answers one fixed 401 whether the state cookie was missing,
// consent was refused, or GitHub did not answer, and nginx turns that into a
// redirect here with ?error=incomplete. That loses which of the three it was, so
// this page leads with the missing state cookie — the common case, and the one
// that traps a sign-in begun on localhost and finished on 127.0.0.1.

import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect } from 'react'
import { startGitHubSignIn } from '../api'
import { useSession } from '../providers/session-context'
import { Shell } from '../components/Shell'
import { Icon, Note } from '../components/ui'

const REASONS = [
  `You started the sign-in on one address and came back on another. The cookie belongs to the exact host
   that set it, so a sign-in begun at one hostname cannot be finished at a different one — even when both
   are this same site.`,
  'Your browser is blocking cookies for this site, or you are in a window that discards them.',
  'You left the GitHub page open for a long time. The cookie is deliberately short-lived.',
  'You opened the callback link directly, or opened it twice. It is good once.',
  `You declined GitHub's consent screen, or GitHub did not answer. Both land here too — the sign-in
   channel reports one status for all three, so this page cannot tell them apart.`,
]

export default function SignInCallback() {
  const [params] = useSearchParams()
  const { session, me } = useSession()
  const navigate = useNavigate()
  const failed = params.get('error')

  // A completed sign-in lands here with the cookie already set, so the only thing
  // left to do is get out of the way.
  useEffect(() => {
    if (!failed && me) {
      const to = params.get('next')
      navigate(to && to.startsWith('/') ? to : '/', { replace: true })
    }
  }, [failed, me, navigate, params])

  if (!failed && (session.state === 'loading' || me)) {
    return (
      <Shell>
        <section className="mid narrow">
          <div className="eyebrow">Signing in</div>
          <h1>
            Finishing your sign-in
            <span className="wait-dots">
              <i />
              <i />
              <i />
            </span>
          </h1>
          <p>
            GitHub sent you back. We are checking that it was really you who started this, and then you go
            straight to where you were.
          </p>
          <p className="muted fine-print">
            This normally takes less than a second. If it is still here in ten, something below went wrong
            and this page will say which.
          </p>
        </section>
      </Shell>
    )
  }

  return (
    <Shell>
      <section className="mid narrow">
        <div className="eyebrow">Signing in</div>
        <h1>We could not confirm it was you who started this.</h1>
        <p>
          Sign-in sets a short-lived cookie in your browser before it sends you to GitHub, and checks for it
          when you come back. That cookie did not arrive, so we stopped rather than sign anyone in on the
          strength of a link.
        </p>
        <Note tone="info" title="Nothing is wrong with your account.">
          <p>
            Starting again from the same address usually just works. Your versions and your rating were
            never involved.
          </p>
        </Note>
        <div className="acts">
          <button className="btn primary lg" type="button" onClick={startGitHubSignIn}>
            <Icon id="i-github" />
            Try signing in again
          </button>
          <Link className="btn lg" to="/">
            Back to the home page
          </Link>
        </div>
        <div className="fine">
          <b>If it keeps happening, one of these is why.</b>
          <ul>
            {REASONS.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </section>
    </Shell>
  )
}
