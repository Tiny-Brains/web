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
import { Icon, Notice } from '../components/ui'
import { Message } from '../components/ErrorStates'
import T from '../../copy/signin.json'

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
      <Shell title={T.tab}>
        <Message code={T.pending.code} title={T.pending.title}>
          <p>{T.pending.body}</p>
        </Message>
      </Shell>
    )
  }
  return (
    <Shell title={T.tab}>
      <Message
        code={T.failed.code}
        title={T.failed.title}
        actions={
          <>
            <button className="btn primary lg" type="button" onClick={startGitHubSignIn}>
              <Icon id="i-github" />
              {T.failed.retry}
            </button>
            <Link className="btn lg" to="/">
              {T.failed.home}
            </Link>
          </>
        }
        below={
          <>
            <Notice tone="info" title={T.failed.notice.title}>
              <p>{T.failed.notice.body}</p>
            </Notice>
            <div className="fine">
              <b>{T.failed.reasonsHeading}</b>
              <ul>
                {T.failed.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          </>
        }
      >
        <p>{T.failed.body}</p>
      </Message>
    </Shell>
  )
}
