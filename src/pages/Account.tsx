// Account: your public name, your GitHub identity, what you are notified about, and where you
// are signed in. These lived at the bottom of your public profile; the profile is public-only now.

import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { ApiError, api, type NotificationCategory, type NotificationSetting } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { ago, date } from '../lib/format'
import { Shell } from '../components/Shell'
import { Badge, DataTable, Icon, Loading, PageHeader, Panel, PanelFoot, PanelHead, Select, Switch, type Column } from '../components/ui'
import { AuthGate, InlineError } from '../components/ErrorStates'
import { useNotifications } from '../providers/notifications-context'

const CATEGORY: Record<NotificationCategory, [string, string]> = {
  submissions: ['Submissions', 'Admitted, rejected, a trial passed or failed'],
  matches: ['Matches', 'A first place, a strike or a fault — or every match'],
  ratings: ['Ratings', 'Rank changes on your ladders, a rating that settles'],
  season: ['Season', 'A season opening, closing soon, and its final standings'],
  account: ['Account', 'A new sign-in, a session signed out'],
  admin: ['Admin', 'A runner on the wrong engine, work held and silent, a close requested'],
}

export default function Account() {
  const { me, session } = useSession()
  if (session.state === 'loading') {
    return (
      <Shell title="Account">
        <section className="wrap page-head">
          <Loading rows={3} label="Checking your session" />
        </section>
      </Shell>
    )
  }
  if (!me) {
    return (
      <Shell title="Account">
        <AuthGate title="Your account is yours to see." preview="Your display name, your GitHub identity, your notifications and the browsers you are signed in on." />
      </Shell>
    )
  }
  return (
    <Shell title="Account">
      <PageHeader
        crumbs={[{ label: `@${me.handle}`, to: `/profile/${me.handle}` }, { label: 'Account' }]}
        title="Account"
        sub="Your public name, your GitHub identity, what you are notified about, and where you are signed in."
      />
      <div className="wrap page-body">
        <div className="stack" style={{ maxWidth: 920 }}>
          <ProfileSettings key={me.display_name ?? ''} />
          <NotificationSettings />
          <Sessions />
        </div>
      </div>
    </Shell>
  )
}

function ProfileSettings() {
  const { me, refresh } = useSession()
  const [name, setName] = useState(me?.display_name ?? '')
  // Remounted by its key when the saved name changes, so the field starts from it.
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | string>('idle')
  if (!me) return null
  const save = async () => {
    setState('saving')
    try {
      await api.updateMe(name.trim() || null)
      await refresh()
      setState('saved')
    } catch (err) {
      setState(err instanceof ApiError ? String(err.detail ?? err.message) : 'It could not be saved.')
    }
  }
  return (
    <Panel>
      <PanelHead title="Profile" />
      <div className="settings">
        <div className="setting">
          <div className="lab">
            <b>
              <label htmlFor="display-name">Display name</label>
            </b>
            <small>Shown on your profile and beside your models.</small>
          </div>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <input
              className="input"
              id="display-name"
              style={{ maxWidth: 300 }}
              value={name}
              maxLength={60}
              placeholder={me.handle}
              onChange={(e) => {
                setName(e.target.value)
                setState('idle')
              }}
            />
            <button className="btn" type="submit" disabled={state === 'saving'}>
              {state === 'saving' ? 'Saving…' : 'Save'}
            </button>
            {state === 'saved' ? <Badge tone="ok">Saved</Badge> : state !== 'idle' && state !== 'saving' ? <span className="form-error">{state}</span> : null}
          </form>
        </div>
        <div className="setting">
          <div className="lab">
            <b>Handle</b>
            <small>From GitHub; it cannot be changed here.</small>
          </div>
          <div>
            @{me.handle} · <Link to={`/profile/${me.handle}`}>View your public profile</Link>
          </div>
        </div>
        <div className="setting">
          <div className="lab">
            <b>Sign-in</b>
            <small>TinyBrains keeps your GitHub login and nothing else.</small>
          </div>
          <div>
            GitHub ·{' '}
            <a href={`https://github.com/${me.handle}`} rel="noopener">
              @{me.handle}
              <Icon id="i-ext" label="opens another site" />
            </a>
            <div className="hint">Member since {date(me.created_at)}. There is no password to change.</div>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function NotificationSettings() {
  const settings = useApi('notification-settings', () => api.notificationSettings())
  const [rows, setRows] = useState<NotificationSetting[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = rows ?? settings.data?.settings ?? []

  const change = async (category: NotificationCategory, body: { app?: boolean; push?: boolean; level?: 'all' | 'notable' | 'off' }) => {
    setBusy(category)
    setError(null)
    try {
      const next = await api.updateNotificationSetting({ category, ...body })
      setRows(next.settings)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That setting was not saved.')
    } finally {
      setBusy(null)
    }
  }

  const columns: Column<NotificationSetting>[] = [
    {
      key: 'kind',
      head: 'Kind',
      className: 'wrapcell',
      cell: (s) => (
        <span className="who">
          <b>{CATEGORY[s.category]?.[0] ?? s.category}</b>
          <small>{CATEGORY[s.category]?.[1]}</small>
        </span>
      ),
    },
    {
      key: 'app',
      head: 'In the app',
      cell: (s) =>
        s.category === 'matches' ? (
          <Select
            look="pick"
            label="Match notifications"
            value={s.app && s.level !== 'off' ? (s.level ?? 'notable') : 'off'}
            options={[
              { value: 'notable', label: 'Notable only' },
              { value: 'all', label: 'Every match' },
              { value: 'off', label: 'Off' },
            ]}
            onChange={(v) => void change('matches', v === 'off' ? { app: false, level: 'off' } : { app: true, level: v as 'all' | 'notable' })}
          />
        ) : (
          <Switch checked={s.app} locked={s.locked} busy={busy === s.category} label={`${CATEGORY[s.category]?.[0]} in the app`} onChange={(v) => void change(s.category, { app: v })} />
        ),
    },
    {
      key: 'push',
      head: 'Push to this browser',
      cell: (s) => <Switch checked={s.push} busy={busy === s.category} label={`Push ${CATEGORY[s.category]?.[0]}`} onChange={(v) => void change(s.category, { push: v })} />,
    },
  ]

  return (
    <div id="notifications">
      <Panel>
        <PanelHead title="Notifications" end={<Link to="/me/notifications">See them →</Link>} />
        {settings.state === 'error' ? (
          <InlineError error={settings.error} what="Your notification settings" />
        ) : (
          <DataTable columns={columns} rows={current} state={settings.state} loadingRows={5} rowKey={(s) => s.category} />
        )}
        <PanelFoot>
          <BrowserPermission />
          <span className="hint">{error ?? 'Submissions and account alerts always appear in the app.'}</span>
        </PanelFoot>
      </Panel>
    </div>
  )
}

/** Push reaches this browser only once the browser allows it, and only while a tab is open:
 *  a notification to a closed browser needs Web Push, which the platform does not send yet. */
function BrowserPermission() {
  const { refresh } = useNotifications()
  const supported = typeof Notification !== 'undefined'
  const [permission, setPermission] = useState(supported ? Notification.permission : 'denied')
  if (!supported) return <span className="hint">This browser cannot show notifications.</span>
  if (permission === 'granted') return <Badge tone="ok">Allowed in this browser</Badge>
  if (permission === 'denied') return <Badge tone="off">Blocked in this browser’s settings</Badge>
  return (
    <button
      className="btn sm"
      type="button"
      onClick={() =>
        void Notification.requestPermission().then((p) => {
          setPermission(p)
          refresh()
        })
      }
    >
      <Icon id="i-bell" />
      Allow in this browser
    </button>
  )
}

function Sessions() {
  const { signOut } = useSession()
  const navigate = useNavigate()
  const sessions = useApi('sessions', () => api.sessions())
  const [busy, setBusy] = useState<string | null>(null)
  const revoke = async (sid: string) => {
    setBusy(sid)
    try {
      await api.revokeSession(sid)
      sessions.reload()
    } finally {
      setBusy(null)
    }
  }
  const rows = sessions.data ?? []
  return (
    <Panel>
      <PanelHead title="Sessions" end={rows.length ? `${rows.length} signed in` : undefined} />
      {sessions.state === 'loading' ? (
        <Loading rows={2} label="Loading sessions" />
      ) : sessions.state === 'error' ? (
        <InlineError error={sessions.error} what="Your sessions" />
      ) : (
        rows.map((s) => (
          <div className="sess" key={s.sid}>
            <div>
              {s.current ? <b>This browser · </b> : null}
              {s.user_agent ?? 'an unnamed browser'}
              <small>
                {s.current ? 'active now' : `last used ${ago(s.last_seen_at)}`} · expires {date(s.expires_at)}
              </small>
            </div>
            {s.current ? (
              <Badge tone="ok">Current</Badge>
            ) : (
              <button className="btn sm danger" type="button" disabled={busy === s.sid} onClick={() => void revoke(s.sid)}>
                Sign out
              </button>
            )}
          </div>
        ))
      )}
      <PanelFoot end="Your versions keep playing while you are signed out.">
        <button className="btn danger" type="button" onClick={() => void signOut().then(() => navigate('/'))}>
          Sign out
        </button>
        {rows.length > 1 ? (
          <button className="btn danger" type="button" disabled={busy === 'others'} onClick={() => void revoke('others')}>
            Sign out everywhere else
          </button>
        ) : null}
      </PanelFoot>
    </Panel>
  )
}
