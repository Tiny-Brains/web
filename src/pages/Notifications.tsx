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
import { fill } from '../lib/copy'
import T from '../../copy/notifications.json'
import common from '../../copy/common.json'

const KINDS: [NotificationCategory, string][] = [
  ['submissions', T.kinds.submissions],
  ['matches', T.kinds.matches],
  ['ratings', T.kinds.ratings],
  ['season', T.kinds.season],
  ['account', T.kinds.account],
  ['admin', T.kinds.admin],
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
      <Shell title={T.title}>
        <section className="wrap page-head">
          <Loading rows={4} label={common.site.checkingSession} />
        </section>
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

  const kinds = KINDS.filter(([k]) => k !== 'admin' || me.role === 'admin')
  const items = page.data?.notifications ?? []
  const markAll = async () => {
    await bell.markAllRead()
    page.reload()
  }

  return (
    <Shell title={T.title}>
      <PageHeader
        crumbs={[{ label: `@${me.handle}`, to: `/profile/${me.handle}` }, { label: T.title }]}
        title={T.title}
        sub={T.sub}
        actions={
          <>
            <button className="btn" type="button" disabled={!page.data?.unread} onClick={() => void markAll()}>
              {T.markAll}
            </button>
            <Link className="btn" to="/me/account#notifications">
              <Icon id="i-settings" />
              {T.settings}
            </Link>
          </>
        }
      />
      <div className="wrap page-body split">
        <Panel>
          <PanelHead
            title={
              <Tabs
                label={T.kindLabel}
                current={category ?? 'all'}
                onPick={(k) => setParam({ kind: k === 'all' ? '' : k, cursor: '' })}
                items={[{ key: 'all', label: T.all }, ...kinds.map(([key, label]) => ({ key, label }))]}
              />
            }
            end={
              <Segmented
                label={T.showLabel}
                value={unread ? 'unread' : 'all'}
                onChange={(v) => setParam({ unread: v === 'unread' ? '1' : '', cursor: '' })}
                items={[
                  { key: 'all', label: T.showAll },
                  { key: 'unread', label: page.data?.unread ? fill(T.showUnreadCount, { n: page.data.unread }) : T.showUnread },
                ]}
              />
            }
          />
          {page.state === 'error' ? (
            <InlineError error={page.error} what={T.what} />
          ) : page.state === 'loading' ? (
            <Loading rows={5} label={T.loading} />
          ) : items.length === 0 ? (
            <p className="empty">{unread ? T.empty.unread : category ? T.empty.kind : T.empty.all}</p>
          ) : (
            <NotificationList items={items} grouped onOpen={(n) => void bell.markRead([n.id])} />
          )}
          {page.data?.next_cursor || cursor ? (
            <PanelFoot>
              <Pagination
                onNext={page.data?.next_cursor ? () => setParam({ cursor: page.data?.next_cursor ?? '' }) : null}
                onStart={cursor ? () => setParam({ cursor: '' }) : null}
                nextLabel={T.older}
                startLabel={T.newest}
              />
            </PanelFoot>
          ) : null}
        </Panel>
        <div className="stack">
          <Panel>
            <PanelHead title={T.inProgress.title} end={me.candidates.length ? String(me.candidates.length) : undefined} />
            {me.candidates.length ? <InProgress candidates={me.candidates} /> : <p className="empty">{T.inProgress.empty}</p>}
          </Panel>
        </div>
      </div>
    </Shell>
  )
}
