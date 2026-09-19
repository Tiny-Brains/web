// `/admin/users` — admin session only, linked from the account menu's Admin group and the admin tabs.
//
// WHO RUNS THE PLATFORM. A desk: a strip with the search, then every admin beside the competitors
// the search finds. The admins are never filtered, so the one to remove is never behind a search.
//
// A ROLE IS CHANGED BY ANOTHER ADMIN. Soma refuses a change to your own, so the platform always
// keeps one. The first admin is the deployment's — SOMA_ADMIN_GITHUB_IDS, by GitHub id — and is
// marked here, because removing them lasts only until their next sign-in.
//
// A GRANT IS TYPED, NOT CLICKED: the handle, in the strip, the same guard the seasons page puts on
// a close. Two rows of handles look alike, and this is the platform's highest role.

import { type ReactNode, useEffect, useState } from 'react'
import { ApiError, api, type AdminUser, type AdminUserList, type UserRole } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { ago, dateTime, num } from '../lib/format'
import { Shell } from '../components/Shell'
import { Avatar } from '../components/Avatar'
import { OwnerLink } from '../components/Model'
import { Badge, type Column, ConfirmAction, DataTable, Loading, Notice, PageHeader, Panel, PanelHead } from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { InlineError, AdminGate } from '../components/ErrorStates'

export default function UsersAdmin() {
  const { me, session } = useSession()

  if (session.state === 'loading') {
    return (
      <Shell title="Users · admin">
        <section className="wrap page-body">
          <Loading rows={3} label="Checking your session" />
        </section>
      </Shell>
    )
  }

  // A courtesy, not the control: Soma answers 403 to a non-admin whatever this page renders.
  if (!me || me.role !== 'admin') {
    return (
      <Shell title="Users · admin">
        <AdminGate signedIn={Boolean(me)} />
      </Shell>
    )
  }

  return <Desk />
}

type Pending = { user: AdminUser; role: UserRole }

function Desk() {
  const [typed, setTyped] = useState('')
  const [q, setQ] = useState('')
  // One request when the typing stops, not one per key.
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 250)
    return () => clearTimeout(t)
  }, [typed])
  const list = useApi(`admin-users:${q}`, () => api.adminUsers(q || undefined))
  // Kept across a re-read, so neither table blanks while a search or a change reloads it.
  const [kept, setKept] = useState<AdminUserList | null>(null)
  if (list.data && list.data !== kept) setKept(list.data)
  const data = list.data ?? kept

  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null)

  const ask = (user: AdminUser, role: UserRole) => {
    setSaid(null)
    setPending({ user, role })
  }

  const change = async ({ user, role }: Pending) => {
    setBusy(true)
    try {
      await api.setUserRole(user.id, role)
      setSaid({
        ok: true,
        text:
          role === 'admin'
            ? `@${user.handle} is an admin.`
            : `@${user.handle} is no longer an admin.${user.by_deployment ? ' Their next sign-in restores it while SOMA_ADMIN_GITHUB_IDS lists them.' : ''}`,
      })
      setPending(null)
      list.reload()
    } catch (err) {
      setSaid({ ok: false, text: roleSaid(err) })
    } finally {
      setBusy(false)
    }
  }

  const admins = data?.admins ?? []
  const users = data?.users ?? []
  const loading = data === null && list.state === 'loading'

  return (
    <Shell title="Users · admin">
      <PageHeader
        crumbs={[{ label: 'Admin', to: '/admin/seasons' }, { label: 'Users' }]}
        title="Users"
        badges={<Badge tone="info">Admin</Badge>}
      >
        <AdminTabs current="users" />
      </PageHeader>

      <div className="wrap page-body">
        <div className="desk">
          <Panel className="desk-strip">
            <div className="strip-row">
              <input
                className="input desk-search"
                type="search"
                aria-label="Find an account"
                placeholder="Find an account"
                maxLength={64}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </div>
            {pending ? (
              <div className="strip-sheet stack tight">
                {pending.role === 'competitor' && pending.user.by_deployment ? (
                  <Notice tone="warn" title="Set by the deployment.">
                    <p>Their next sign-in makes them an admin again until their id leaves SOMA_ADMIN_GITHUB_IDS.</p>
                  </Notice>
                ) : null}
                <div className="row">
                  <ConfirmAction
                    key={`${pending.user.id}:${pending.role}`}
                    size="sm"
                    word={pending.user.handle}
                    action={pending.role === 'admin' ? 'Make admin' : 'Remove admin'}
                    busy={busy}
                    onConfirm={() => void change(pending)}
                  />
                  <button className="btn sm" type="button" onClick={() => setPending(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            {said ? (
              <div className="strip-sheet">
                <Notice tone={said.ok ? 'ok' : 'bad'} title={said.text} />
              </div>
            ) : null}
          </Panel>

          <div className="desk-lists">
            <Panel className="fill">
              <PanelHead icon="i-key" title="Admins" end={<span className="num">{num(admins.length)}</span>} />
              <div className="fill-scroll">
                {list.error && !data ? (
                  <InlineError error={list.error} what="The admins" />
                ) : (
                  <DataTable
                    state={loading ? 'loading' : 'ready'}
                    columns={columns((u) => (u.you ? null : <button className="btn sm" type="button" onClick={() => ask(u, 'competitor')}>Remove</button>))}
                    rows={admins}
                    rowKey={(u) => u.id}
                    loadingRows={3}
                    empty="No admins."
                  />
                )}
              </div>
            </Panel>

            <Panel className="fill">
              <PanelHead
                icon="i-seats"
                title="Accounts"
                end={
                  data ? (
                    <span className="num">
                      {data.matching > users.length ? `${num(users.length)} of ${num(data.matching)}` : num(data.matching)}
                    </span>
                  ) : null
                }
              />
              <div className="fill-scroll">
                {list.error && !data ? (
                  <InlineError error={list.error} what="The accounts" />
                ) : (
                  <DataTable
                    state={loading ? 'loading' : 'ready'}
                    columns={columns((u) => (
                      <button className="btn sm" type="button" onClick={() => ask(u, 'admin')}>
                        Make admin
                      </button>
                    ))}
                    rows={users}
                    rowKey={(u) => u.id}
                    loadingRows={6}
                    empty={q ? `No account matches “${q}”.` : 'Nobody else has signed in yet.'}
                  />
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </Shell>
  )
}

function columns(act: (u: AdminUser) => ReactNode): Column<AdminUser>[] {
  return [
    {
      key: 'who',
      head: 'Account',
      cell: (u) => (
        <span className="user-cell">
          <Avatar handle={u.handle} name={u.display_name} size="xs" />
          <span>
            <OwnerLink handle={u.handle} /> {u.you ? <Badge tone="info">you</Badge> : null}{' '}
            {u.by_deployment ? <Badge tone="off">deployment</Badge> : null}
            {u.display_name ? <div className="hint">{u.display_name}</div> : null}
          </span>
        </span>
      ),
    },
    {
      key: 'seen',
      head: 'Last seen',
      align: 'right',
      // Dropped on a phone, so the action stays on screen rather than behind a sideways scroll.
      wideOnly: true,
      cell: (u) =>
        u.last_seen_at ? <span title={dateTime(u.last_seen_at)}>{ago(u.last_seen_at)}</span> : <span className="muted">never</span>,
    },
    { key: 'act', head: '', align: 'right', cell: act },
  ]
}

/** Soma's refusal, as a sentence. */
function roleSaid(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'not_yourself':
        return 'Your own role is changed by another admin.'
      case 'not_a_person':
        return 'A baseline cannot be an admin.'
      case 'unknown_user':
        return 'That account no longer exists.'
      case 'admin_only':
        return 'You are no longer an admin.'
      case 'role_not_changed':
        return 'Nothing changed. Reload and try again.'
    }
    if (err.status === 0) return 'The API did not answer; nothing changed.'
  }
  return err instanceof Error ? err.message : 'The role was not changed.'
}
