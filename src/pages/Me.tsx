// /me is an address, not a page: it opens your profile, which is your desk when it is yours (the
// versions in admission, New model, Submit, Retire and your queued matches all draw there). The
// query string rides along, so an old link to /me?new=1 still opens the New model form.

import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../providers/session-context'
import { Shell } from '../components/Shell'
import { AuthGate } from '../components/ErrorStates'
import { ProfileSkeleton } from './Profile'
import T from '../../copy/me.json'

export default function Me() {
  const { me, session } = useSession()
  const { search, hash } = useLocation()
  if (me) return <Navigate replace to={{ pathname: `/profile/${me.handle}`, search, hash }} />
  return (
    <Shell title={T.title}>
      {session.state === 'loading' ? <ProfileSkeleton /> : <AuthGate title={T.gate.title} preview={T.gate.preview} />}
    </Shell>
  )
}
