// The message template, and every page that is one: not found, unreachable, the two gates.
//
// One centred layout for all of them — a code line, a title, what happened, and the ways out —
// so a 404, a sign-in wall and an admin wall read as the same kind of page.

import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { startGitHubSignIn, type ApiError } from '../api'
import { EmptyState, Icon, KeyValueList, Panel, PanelBody, PanelFoot, PanelHead, Rich, Skel } from './ui'
import { fill } from '../lib/copy'
import common from '../../copy/common.json'

export type MissingKind = 'model' | 'version' | 'match' | 'profile' | 'route'

const E = common.errors

/** The centred template: a code line, a title, a paragraph, the ways out, and anything below. */
export function Message({
  code,
  title,
  children,
  actions,
  below,
}: {
  code: string
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  below?: ReactNode
}) {
  return (
    <section className="wrap">
      <div className="message">
        <div className="code">{code}</div>
        <h1>{title}</h1>
        {children}
        {actions ? <div className="acts">{actions}</div> : null}
        {below}
      </div>
    </section>
  )
}

function What({ items }: { items: { key: string; value: string }[] }) {
  return (
    <div className="fine">
      <KeyValueList items={items} />
    </div>
  )
}

export function NotFound({ kind = 'route', what }: { kind?: MissingKind; what?: string }) {
  const location = useLocation()
  const page = E.notFound[kind]
  return (
    <Message
      code={E.notFound.code}
      title={page.title}
      actions={page.actions.map(({ label, to }, i) => (
        <Link className={i === 0 ? 'btn primary lg' : 'btn lg'} to={to} key={to}>
          {to === '/leaderboard' ? <Icon id="i-leaderboard" /> : to === '/matches' ? <Icon id="i-matches" /> : null}
          {label}
        </Link>
      ))}
      below={page.hints.length ? <What items={page.hints} /> : null}
    >
      <code className="badurl">{what ?? `${location.pathname}${location.search}`}</code>
      <p>
        <Rich text={page.body} />
      </p>
    </Message>
  )
}

function Unreachable({ error }: { error?: ApiError }) {
  return (
    <Message
      code={error?.status ? fill(E.api.codeStatus, { status: error.status }) : E.api.code}
      title={E.api.title}
      actions={
        <>
          <button className="btn primary lg" type="button" onClick={() => window.location.reload()}>
            {E.api.reload}
          </button>
          <Link className="btn lg" to="/status">
            {E.api.status}
          </Link>
        </>
      }
      below={
        error?.requestId ? (
          <div className="fine">
            <b>{E.api.requestId}</b> <span className="mono">{error.requestId}</span>
          </div>
        ) : null
      }
    >
      <p>{E.api.body}</p>
    </Message>
  )
}

export function FetchFailed({ error, kind }: { error: ApiError; kind: MissingKind }) {
  return error.status === 404 ? <NotFound kind={kind} /> : <Unreachable error={error} />
}

export function InlineError({ error, what }: { error: ApiError; what: string }) {
  return (
    <EmptyState>
      {error.status === 0
        ? fill(E.inline.unreachable, { what })
        : fill(E.inline.failed, { what, status: error.status, code: error.code })}
    </EmptyState>
  )
}

/** Every signed-in page, for a visitor: what it is, and the one way in. */
export function AuthGate({ title, preview }: { title: string; preview?: string }) {
  return (
    <Message
      code={E.signIn.code}
      title={title}
      actions={
        <>
          <button className="btn primary lg" type="button" onClick={startGitHubSignIn}>
            <Icon id="i-github" />
            {E.signIn.button}
          </button>
          <Link className="btn lg" to="/start">
            {E.signIn.how}
          </Link>
        </>
      }
      below={
        preview ? (
          <div className="ghost" aria-hidden="true">
            <Panel>
              <PanelHead title={E.signIn.previewTitle} end={E.signIn.previewEnd} />
              <PanelBody>
                <div className="stack" style={{ gap: 10 }}>
                  <Skel w="70%" />
                  <Skel w="90%" />
                  <Skel w="55%" />
                </div>
              </PanelBody>
              <PanelFoot>
                <span className="muted">{preview}</span>
              </PanelFoot>
            </Panel>
          </div>
        ) : null
      }
    >
      <p>{E.signIn.body}</p>
    </Message>
  )
}

/** Both admin pages, for anyone who is not an administrator. */
export function AdminGate({ signedIn }: { signedIn: boolean }) {
  return (
    <Message
      code={E.admin.code}
      title={E.admin.title}
      actions={
        <>
          <Link className="btn primary lg" to="/">
            {E.admin.home}
          </Link>
          <Link className="btn lg" to="/leaderboard">
            <Icon id="i-leaderboard" />
            {E.admin.leaderboard}
          </Link>
        </>
      }
    >
      <p>{signedIn ? E.admin.bodySignedIn : E.admin.bodySignedOut}</p>
    </Message>
  )
}
