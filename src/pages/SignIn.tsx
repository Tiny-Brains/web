// `/signin` -- the provider chooser. The deployment's providers come from
// GET /v1/auth-providers, so an unconfigured provider never becomes a button that 404s, and
// which providers exist follows the deployment's config rather than a build. A single provider
// passes straight through, so a one-provider deployment sees no chooser -- the same one click it
// always had. Sign-in itself is a full-page navigation (startSignIn), never a fetch, so the
// state cookie and the return land on the right origin.

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { authProviders, startSignIn, type AuthProvider } from '../api'
import { useApi } from '../lib/useApi'
import { Shell } from '../components/Shell'
import { Icon, PageHeader, Panel, PanelBody } from '../components/ui'
import { Message } from '../components/ErrorStates'
import { AskForHelp } from '../components/Help'
import { fill } from '../lib/copy'
import type { IconId } from '../components/ui/Icon'
import T from '../../copy/signin.json'

const iconFor = (slug: string): IconId => (slug === 'github' ? 'i-github' : 'i-key')

export default function SignIn() {
  const providers = useApi<AuthProvider[]>('auth-providers', authProviders)
  const only = providers.state === 'ready' && providers.data.length === 1 ? providers.data[0] : null

  // One provider: pass straight through, so a single-provider deployment sees no chooser.
  useEffect(() => {
    if (only) startSignIn(only.slug)
  }, [only])

  if (providers.state === 'loading' || only) {
    return (
      <Shell title={T.chooser.tab}>
        <Message code={T.chooser.tab} title={only ? T.chooser.redirecting : T.chooser.loadingTitle} />
      </Shell>
    )
  }
  if (providers.state === 'error') {
    return (
      <Shell title={T.chooser.tab}>
        <Message
          code={T.chooser.failedCode}
          title={T.chooser.failedTitle}
          actions={
            <>
              <button className="btn primary lg" type="button" onClick={providers.reload}>
                {T.chooser.failedRetry}
              </button>
              <Link className="btn lg" to="/">
                {T.failed.home}
              </Link>
            </>
          }
          below={<AskForHelp />}
        >
          <p>{T.chooser.failedBody}</p>
        </Message>
      </Shell>
    )
  }
  if (providers.data.length === 0) {
    return (
      <Shell title={T.chooser.tab}>
        <Message code={T.chooser.emptyCode} title={T.chooser.emptyTitle} below={<AskForHelp />}>
          <p>{T.chooser.emptyBody}</p>
        </Message>
      </Shell>
    )
  }
  return (
    <Shell title={T.chooser.title}>
      <PageHeader title={T.chooser.title} icon="i-key" sub={T.chooser.subtitle} />
      <div className="wrap page-body">
        <Panel className="signin-choices">
          <PanelBody>
            <div className="stack">
              {providers.data.map((p) => (
                <button
                  key={p.slug}
                  className="btn primary lg signin-choice"
                  type="button"
                  onClick={() => startSignIn(p.slug)}
                >
                  <Icon id={iconFor(p.slug)} />
                  {fill(T.chooser.continueWith, { provider: p.label })}
                </button>
              ))}
            </div>
          </PanelBody>
        </Panel>
      </div>
    </Shell>
  )
}
