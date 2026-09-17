// Every notification, newest first: filter by kind, show only unread, mark read. New ones arrive
// in the header's bell and as a toast on whatever page is open; this is where they are kept.

import { Link } from 'react-router-dom'
import { api, type NotificationCategory } from '../api'
import { useApi } from '../lib/useApi'
import { useQueryState } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { useNotifications } from '../providers/notifications-context'
import { Icon, Loading, PageHeader, Pagination, Panel, PanelFoot, PanelHead, Segmented, Tabs } from '../components/ui'
import { InProgress, NotificationList } from '../components/Notifications'
import { AuthGate, InlineError } from '../components/ErrorStates'
import { Shell } from '../components/Shell'

const KINDS: [NotificationCategory, string][] = [
  ['submissions', 'Submissions'],
  ['matches', 'Matches'],
  ['ratings', 'Ratings'],
  ['season', 'Season'],
  ['account', 'Account'],
  ['admin', 'Admin'],
]

export default function NotificationsPage() {
  const { me, session } = useSession()
  const bell = useNotifications()
  const [param, setParam] = useQueryState()
  const category = (param('kind') || null) as NotificationCategory | null
  const unread = param('unread') === '1'
  const cursor = param('cursor') || null
  const page = useApi(
    `ntf:${me?.id ?? ''}:${category}:${unread}:${cursor}:${bell.unread}`,
    () => api.notifications({ category, unread, cursor, limit: 30 }),
    Boolean(me),
  )

  if (session.state === 'loading') {
    return (
      <Shell title="Notifications">
        <section className="wrap page-head">
          <Loading rows={4} label="Checking your session" />
        </section>
      </Shell>
    )
  }
  if (!me) {
    return (
      <Shell title="Notifications">
        <AuthGate title="Your notifications are yours to see." preview="Admission steps, trial results, notable matches, rank changes, season dates and new sign-ins." />
      </Shell>
    )
  }

  const kinds = KINDS.filter(([k]) => k !== 'admin' || me.role === 'admin')
  const items = page.data?.notifications ?? []
  const markAll = async () => {
    await bell.markAllRead()
    page.reload()
  }

  return (
    <Shell title="Notifications">
      <PageHeader
        crumbs={[{ label: `@${me.handle}`, to: `/profile/${me.handle}` }, { label: 'Notifications' }]}
        title="Notifications"
        sub="Everything that happened to your models, your account and the season, newest first. New ones arrive in the bell as they happen."
        actions={
          <>
            <button className="btn" type="button" disabled={!page.data?.unread} onClick={() => void markAll()}>
              Mark all read
            </button>
            <Link className="btn" to="/me/account#notifications">
              <Icon id="i-settings" />
              Settings
            </Link>
          </>
        }
      />
      <div className="wrap page-body split">
        <Panel>
          <PanelHead
            title={
              <Tabs
                label="Kind"
                current={category ?? 'all'}
                onPick={(k) => setParam({ kind: k === 'all' ? '' : k, cursor: '' })}
                items={[{ key: 'all', label: 'All' }, ...kinds.map(([key, label]) => ({ key, label }))]}
              />
            }
            end={
              <Segmented
                label="Show"
                value={unread ? 'unread' : 'all'}
                onChange={(v) => setParam({ unread: v === 'unread' ? '1' : '', cursor: '' })}
                items={[
                  { key: 'all', label: 'All' },
                  { key: 'unread', label: `Unread${page.data?.unread ? ` ${page.data.unread}` : ''}` },
                ]}
              />
            }
          />
          {page.state === 'error' ? (
            <InlineError error={page.error} what="Your notifications" />
          ) : page.state === 'loading' ? (
            <Loading rows={5} label="Loading notifications" />
          ) : items.length === 0 ? (
            <p className="empty">{unread ? 'Nothing unread.' : category ? 'Nothing of this kind yet.' : 'Nothing yet. Submissions, results and season news land here.'}</p>
          ) : (
            <NotificationList items={items} grouped onOpen={(n) => void bell.markRead([n.id])} />
          )}
          {page.data?.next_cursor || cursor ? (
            <PanelFoot>
              <Pagination
                onNext={page.data?.next_cursor ? () => setParam({ cursor: page.data?.next_cursor ?? '' }) : null}
                onStart={cursor ? () => setParam({ cursor: '' }) : null}
                nextLabel="Older"
                startLabel="Newest"
              />
            </PanelFoot>
          ) : null}
        </Panel>
        <div className="stack">
          <Panel>
            <PanelHead title="In progress" end={me.candidates.length ? String(me.candidates.length) : undefined} />
            {me.candidates.length ? <InProgress candidates={me.candidates} /> : <p className="empty">Nothing of yours is between submission and the ladder.</p>}
          </Panel>
        </div>
      </div>
    </Shell>
  )
}
