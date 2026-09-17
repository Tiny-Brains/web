// The message template, and every page that is one: not found, unreachable, the two gates.
//
// One centred layout for all of them — a code line, a title, what happened, and the ways out —
// so a 404, a sign-in wall and an admin wall read as the same kind of page.

import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { startGitHubSignIn, type ApiError } from '../api'
import { EmptyState, Icon, KeyValueList, Panel, PanelBody, PanelFoot, PanelHead, Skel } from './ui'

export type MissingKind = 'model' | 'version' | 'match' | 'profile' | 'route'

type Missing = {
  title: string
  body: ReactNode
  actions: [string, string][]
  what?: [string, string][]
}

const MISSING: Record<MissingKind, Missing> = {
  // A MODEL IS ADDRESSED BY ITS REPOSITORY, a version by an id under it, so the two go missing
  // for different reasons and the same page cannot say both. This one used to read "there is no
  // version with that id" on a page whose address holds no id at all.
  model: {
    title: 'There is no model with that id.',
    body: `A model's address is its id, which every page that names one links to. An id that lands
      here was mistyped, belongs to a different deployment, or names an entry that was never made —
      nothing is adopted silently, so a model exists only once its owner has entered it.`,
    actions: [
      ['Browse the leaderboard', '/leaderboard'],
      ['Home', '/'],
    ],
    what: [
      ['Most likely', 'The id is truncated or mistyped — it is a uuid, and every character counts.'],
      ['Also possible', 'It belongs to a different deployment, or the entry was never made.'],
    ],
  },
  version: {
    title: 'There is no version with that id.',
    body: `The id is the right shape, so this is not a typo we can spot for you — it simply names no
      version we hold. A version id is a permalink: once one exists it does not move and it does not
      expire, so an id that resolves to nothing has never existed here.`,
    actions: [
      ['Browse the leaderboard', '/leaderboard'],
      ['Home', '/'],
    ],
    what: [
      ['Most likely', 'The link was written by hand, or a character was dropped copying it.'],
      ['Also possible', 'It belongs to a different deployment of TinyBrains.'],
    ],
  },
  match: {
    title: 'There is no match with that id.',
    body: `Every match that has been played keeps its id forever, and a match that was cancelled before
      it started keeps its id too. So this one was never scheduled.`,
    actions: [
      ['Every match played', '/matches'],
      ['Home', '/'],
    ],
    what: [
      ['Most likely', 'A mistyped or truncated link.'],
      ['Worth trying', 'Open the version you were reading about and use its list of matches.'],
    ],
  },
  profile: {
    title: 'Nobody here goes by that name.',
    body: `A profile exists once somebody has signed in, whether or not they have entered anything. This
      handle has not, or it is spelled differently — handles are GitHub's, and capitalisation does not
      matter but nothing else about the spelling is forgiven.`,
    actions: [
      ['Browse the leaderboard', '/leaderboard'],
      ['Home', '/'],
    ],
  },
  route: {
    title: 'That page is not part of this site.',
    body: (
      <>
        Some early links pointed at pages that no longer exist as pages. Games and seasons are chosen in
        the switcher in the header, not walked to: the home page in season 2 is <code>/?season=2</code>, and the
        leaderboard for one game is <code>/leaderboard?game=ants</code>.
      </>
    ),
    actions: [
      ['Home', '/'],
      ['Leaderboard', '/leaderboard'],
    ],
    what: [
      [
        'If you saved a link',
        'Open the home page and pick the game and season you wanted; the address you land on is the one to keep.',
      ],
      ['If we sent you here', 'That is our bug, not yours.'],
    ],
  },
}

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

function What({ items }: { items: [string, string][] }) {
  return (
    <div className="fine">
      <KeyValueList items={items.map(([key, value]) => ({ key, value }))} />
    </div>
  )
}

export function NotFound({ kind = 'route', what }: { kind?: MissingKind; what?: string }) {
  const location = useLocation()
  const page = MISSING[kind]
  return (
    <Message
      code="404 · not found"
      title={page.title}
      actions={page.actions.map(([label, to], i) => (
        <Link className={i === 0 ? 'btn primary lg' : 'btn lg'} to={to} key={to}>
          {label}
        </Link>
      ))}
      below={page.what ? <What items={page.what} /> : null}
    >
      <code className="badurl">{what ?? `${location.pathname}${location.search}`}</code>
      <p>{page.body}</p>
    </Message>
  )
}

function Unreachable({ error }: { error?: ApiError }) {
  return (
    <Message
      code={error?.status ? `${error.status} · something went wrong` : 'something went wrong'}
      title="We could not reach the API."
      actions={
        <>
          <button className="btn primary lg" type="button" onClick={() => window.location.reload()}>
            Reload the page
          </button>
          <Link className="btn lg" to="/status">
            System status
          </Link>
        </>
      }
      below={
        error?.requestId ? (
          <div className="fine">
            <b>Request id</b> <span className="mono">{error.requestId}</span>
          </div>
        ) : null
      }
    >
      <p>
        This is not a missing page. Whatever you asked for is very probably there — the part of TinyBrains that
        answers questions did not answer this one. Nothing has been lost: versions, ratings and finished matches
        are stored, not held in this page.
      </p>
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
        ? `${what} could not be loaded — the API did not answer. This is not an empty list.`
        : `${what} could not be loaded (${error.status} ${error.code}).`}
    </EmptyState>
  )
}

/** Every signed-in page, for a visitor: what it is, and the one way in. */
export function AuthGate({ title, preview }: { title: string; preview?: string }) {
  return (
    <Message
      code="Sign in required"
      title={title}
      actions={
        <>
          <button className="btn primary lg" type="button" onClick={startGitHubSignIn}>
            <Icon id="i-github" />
            Sign in with GitHub
          </button>
          <Link className="btn lg" to="/start">
            How to enter
          </Link>
        </>
      }
      below={
        preview ? (
          <div className="ghost" aria-hidden="true">
            <Panel>
              <PanelHead title="What appears here" end="once you are signed in" />
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
      <p>Sign in with GitHub to see this. There is no separate account to create — your GitHub login is the whole account.</p>
    </Message>
  )
}

/** Both admin pages, for anyone who is not an administrator. */
export function AdminGate({ signedIn }: { signedIn: boolean }) {
  return (
    <Message
      code="Administrators only"
      title="This page is for administrators."
      actions={
        <>
          <Link className="btn primary lg" to="/">
            Home
          </Link>
          <Link className="btn lg" to="/leaderboard">
            Leaderboard
          </Link>
        </>
      }
    >
      <p>
        {signedIn
          ? 'Your account is not an administrator. Admin pages are linked from an administrator’s account menu.'
          : 'Sign in with an administrator account to use it.'}
      </p>
    </Message>
  )
}
