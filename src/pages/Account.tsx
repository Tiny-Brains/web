// Account: your public name and the one line about you that your profile shows, your GitHub
// identity, what you are notified about, and where you are signed in.

import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { ApiError, api, type NotificationCategory, type NotificationLevel, type NotificationSetting } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { ago, date } from '../lib/format'
import { fill } from '../lib/copy'
import { Shell } from '../components/Shell'
import { Badge, type Column, DataTable, Icon, Loading, PageHeader, PagePlaceholder, Panel, PanelFoot, PanelHead, Select, Switch } from '../components/ui'
import { AuthGate, InlineError } from '../components/ErrorStates'
import { useNotifications } from '../providers/notifications-context'
import T from '../../copy/account.json'
import common from '../../copy/common.json'

const P = T.profile
const N = T.notifications
const S = T.sessions

const CATEGORY: Record<NotificationCategory, { name: string; about: string }> = N.kinds

// The categories whose volume is someone else's pick a level instead of a switch. Community is
// in the app only: its push setting is not offered.
const LEVELS: Partial<Record<NotificationCategory, { label: string; fallback: NotificationLevel; options: { value: NotificationLevel; label: string }[] }>> = {
  matches: {
    label: N.matchLevel,
    fallback: 'notable',
    options: [
      { value: 'notable', label: N.levels.notable },
      { value: 'all', label: N.levels.all },
      { value: 'off', label: N.levels.off },
    ],
  },
  community: {
    label: N.communityLevel,
    fallback: 'replies',
    options: [
      { value: 'replies', label: N.levels.replies },
      { value: 'all', label: N.levels.allComments },
      { value: 'off', label: N.levels.off },
    ],
  },
}
const APP_ONLY = new Set<NotificationCategory>(['community'])

export default function Account() {
  const { me, session } = useSession()
  if (session.state === 'loading') {
    return (
      <Shell title={T.title}>
        <PagePlaceholder label={common.site.checkingSession} />
      </Shell>
    )
  }
  if (!me) {
    return (
      <Shell title={T.title}>
        <AuthGate title={T.gate.title} preview={T.gate.preview} />
      </Shell>
    )
  }
  return (
    <Shell title={T.title}>
      <PageHeader
        crumbs={[{ label: `@${me.handle}`, to: `/profile/${me.handle}` }, { label: T.title }]}
        title={T.title}
        sub={T.sub}
      />
      <div className="wrap page-body">
        <div className="stack" style={{ maxWidth: 920 }}>
          {/* NOT KEYED ON THE SAVED NAME. It was, and `save()` awaits `refresh()` before setting
              'saved', so both updates landed in one render with the key already changed: the
              instance unmounted, the green Saved badge was discarded with its state, and BioSetting
              -- a child, seeding its own state from `me.bio` -- silently threw away an unsaved bio.
              Editing both fields and saving the name lost the bio with no message. The field is
              already the thing that was sent, so there is nothing to resync and nothing to remount
              for. */}
          <ProfileSettings />
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
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | string>('idle')
  if (!me) return null
  const save = async () => {
    setState('saving')
    try {
      await api.updateMe(name.trim() || null)
      // The field now holds exactly what was sent, which is what the remount used to achieve.
      setName(name.trim())
      await refresh()
      setState('saved')
    } catch (err) {
      setState(err instanceof ApiError ? String(err.detail ?? err.message) : P.notSaved)
    }
  }
  return (
    <Panel>
      <PanelHead title={P.title} />
      <div className="settings">
        <div className="setting">
          <div className="lab">
            <b>
              <label htmlFor="display-name">{P.displayName}</label>
            </b>
            <small>{P.displayNameAbout}</small>
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
              {state === 'saving' ? P.saving : P.save}
            </button>
            {state === 'saved' ? <Badge tone="ok">{P.saved}</Badge> : state !== 'idle' && state !== 'saving' ? <span className="form-error">{state}</span> : null}
          </form>
        </div>
        <BioSetting />
        <div className="setting">
          <div className="lab">
            <b>{P.handle}</b>
            <small>{P.handleAbout}</small>
          </div>
          <div>
            @{me.handle} · <Link to={`/profile/${me.handle}`}>{P.viewProfile}</Link>
          </div>
        </div>
        <div className="setting">
          <div className="lab">
            <b>{P.signIn}</b>
            <small>{P.signInAbout}</small>
          </div>
          <div>
            {/* No provider is named, and no link to one: the API does not say which provider an
                account signs in with, and a handle is only seeded from a login once. */}
            {P.signInWith}
            <div className="hint">{fill(P.memberSince, { date: date(me.created_at) })}</div>
          </div>
        </div>
      </div>
    </Panel>
  )
}

/** The one line under your name on your profile: plain text, up to 160 characters, held to the
 *  word list the way a comment is. A link stays text. */
function BioSetting() {
  const { me, refresh } = useSession()
  const [bio, setBio] = useState(me?.bio ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | string>('idle')
  if (!me) return null
  const save = async () => {
    setState('saving')
    try {
      await api.updateMe({ bio: bio.trim() || null })
      await refresh()
      setState('saved')
    } catch (err) {
      setState(bioRefusal(err))
    }
  }
  return (
    <div className="setting">
      <div className="lab">
        <b>
          <label htmlFor="bio">{P.bio}</label>
        </b>
        <small>{P.bioAbout}</small>
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
          id="bio"
          style={{ maxWidth: 480 }}
          value={bio}
          maxLength={BIO_MAX}
          placeholder={P.bioPlaceholder}
          aria-describedby="bio-count"
          onChange={(e) => {
            setBio(e.target.value)
            setState('idle')
          }}
        />
        <button className="btn" type="submit" disabled={state === 'saving'}>
          {state === 'saving' ? P.saving : P.save}
        </button>
        <span className="hint" id="bio-count">
          {fill(P.bioCount, { n: bio.length, max: BIO_MAX })}
        </span>
        {state === 'saved' ? <Badge tone="ok">{P.saved}</Badge> : state !== 'idle' && state !== 'saving' ? <span className="form-error">{state}</span> : null}
      </form>
    </div>
  )
}

const BIO_MAX = 160

/** A refusal as a sentence: which word the list holds back, or how long the line may be. */
function bioRefusal(err: unknown): string {
  if (!(err instanceof ApiError)) return P.notSaved
  if (err.code === 'bio_word_listed') {
    const word = (err.body as { word?: unknown } | undefined)?.word
    return typeof word === 'string' && word ? fill(P.bioWordListed, { word }) : P.bioWordListedAny
  }
  if (err.code === 'bio_too_long') return fill(P.bioTooLong, { max: BIO_MAX })
  return err.status === 0 ? P.notSaved : String(err.detail ?? err.message)
}

function NotificationSettings() {
  const settings = useApi('notification-settings', () => api.notificationSettings())
  const [rows, setRows] = useState<NotificationSetting[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = rows ?? settings.data?.settings ?? []

  const change = async (category: NotificationCategory, body: { app?: boolean; push?: boolean; level?: NotificationLevel }) => {
    setBusy(category)
    setError(null)
    try {
      const next = await api.updateNotificationSetting({ category, ...body })
      setRows(next.settings)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : N.notSaved)
    } finally {
      setBusy(null)
    }
  }

  const columns: Column<NotificationSetting>[] = [
    {
      key: 'kind',
      head: N.head.kind,
      className: 'wrapcell',
      cell: (s) => (
        <span className="who">
          <b>{CATEGORY[s.category]?.name ?? s.category}</b>
          <small>{CATEGORY[s.category]?.about}</small>
        </span>
      ),
    },
    {
      key: 'app',
      head: N.head.app,
      cell: (s) => {
        const levels = LEVELS[s.category]
        return levels ? (
          <Select
            look="pick"
            label={levels.label}
            value={s.app && s.level !== 'off' ? (s.level ?? levels.fallback) : 'off'}
            options={levels.options}
            onChange={(v) => void change(s.category, v === 'off' ? { app: false, level: 'off' } : { app: true, level: v as NotificationLevel })}
          />
        ) : (
          <Switch checked={s.app} locked={s.locked} busy={busy === s.category} label={fill(N.inApp, { kind: CATEGORY[s.category]?.name })} onChange={(v) => void change(s.category, { app: v })} />
        )
      },
    },
    {
      key: 'push',
      head: N.head.push,
      cell: (s) =>
        APP_ONLY.has(s.category) ? null : (
          <Switch checked={s.push} busy={busy === s.category} label={fill(N.push, { kind: CATEGORY[s.category]?.name })} onChange={(v) => void change(s.category, { push: v })} />
        ),
    },
  ]

  return (
    <div id="notifications">
      <Panel>
        <PanelHead title={N.title} end={<Link to="/me/notifications">{N.seeThem}</Link>} />
        {settings.state === 'error' ? (
          <InlineError error={settings.error} what={N.what} />
        ) : (
          <DataTable columns={columns} rows={current} state={settings.state} loadingRows={5} rowKey={(s) => s.category} />
        )}
        <PanelFoot>
          <BrowserPermission />
          <span className="hint">{error ?? N.always}</span>
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
  if (!supported) return <span className="hint">{N.browser.unsupported}</span>
  if (permission === 'granted') return <Badge tone="ok">{N.browser.granted}</Badge>
  if (permission === 'denied') return <Badge tone="off">{N.browser.denied}</Badge>
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
      {N.browser.ask}
    </button>
  )
}

function Sessions() {
  const { signOut } = useSession()
  const navigate = useNavigate()
  const sessions = useApi('sessions', () => api.sessions())
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A REFUSAL IS DRAWN, not swallowed. Both call sites are `void revoke(...)`, and with no catch a
  // rejection -- Soma answers 404 unknown_session for a sid already revoked or expired, and a
  // network failure throws ApiError(0, ...) -- escaped unhandled, skipped the reload, and drew
  // nothing: the button re-enabled with the row still listed, which reads as a button that does not
  // work. Every other write on this page says why it refused.
  const revoke = async (sid: string) => {
    setBusy(sid)
    setError(null)
    try {
      await api.revokeSession(sid)
      sessions.reload()
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail ?? err.message) : S.notRevoked)
      sessions.reload()
    } finally {
      setBusy(null)
    }
  }
  const rows = sessions.data ?? []
  return (
    <Panel>
      <PanelHead title={S.title} end={rows.length ? fill(S.count, { n: rows.length }) : undefined} />
      {error ? <p className="form-error">{error}</p> : null}
      {sessions.state === 'loading' ? (
        <Loading rows={2} label={S.loading} />
      ) : sessions.state === 'error' ? (
        <InlineError error={sessions.error} what={S.what} />
      ) : (
        rows.map((s) => (
          <div className="sess" key={s.sid}>
            <div>
              {s.current ? <b>{S.thisBrowser} · </b> : null}
              {s.user_agent ?? S.unnamed}
              <small>
                {s.current
                  ? fill(S.activeNow, { expires: date(s.expires_at) })
                  : fill(S.lastUsed, { when: ago(s.last_seen_at), expires: date(s.expires_at) })}
              </small>
            </div>
            {s.current ? (
              <Badge tone="ok">{S.current}</Badge>
            ) : (
              <button className="btn sm danger" type="button" disabled={busy === s.sid} onClick={() => void revoke(s.sid)}>
                {S.revoke}
              </button>
            )}
          </div>
        ))
      )}
      <PanelFoot end={S.stillPlaying}>
        <button className="btn danger" type="button" onClick={() => void signOut().then(() => navigate('/'))}>
          {S.signOut}
        </button>
        {rows.length > 1 ? (
          <button className="btn danger" type="button" disabled={busy === 'others'} onClick={() => void revoke('others')}>
            {S.signOutOthers}
          </button>
        ) : null}
      </PanelFoot>
    </Panel>
  )
}
