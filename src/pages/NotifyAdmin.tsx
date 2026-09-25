// `/admin/notify` — admin session only. The sent log: every notification an admin sent to an
// audience, newest first, with how many it reached and how many opened it. Sending is its own page,
// /admin/notify/new, the desk rule.
//
// THE AUDIENCE IS SAID IN WORDS, from the chips it was sent with (a union: everyone, a season's
// submitters or one class of them, models' owners, handles), since the JSON is what Soma stored and
// not what an admin reads. A season is named by its name where this game has it, else its slug.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type NotifyAudience, type NotifySend, type NotifySendList } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { usePlatform } from '../providers/platform-context'
import { ago, dateTime, num } from '../lib/format'
import { count, fill } from '../lib/copy'
import { Shell } from '../components/Shell'
import { Badge, type Column, DataTable, Icon, IconLabel, Loading, PageHeader, Panel, PanelFoot, PanelHead } from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { AdminGate, InlineError } from '../components/ErrorStates'
import T from '../../copy/admin-notify.json'
import common from '../../copy/common.json'

export default function NotifyAdmin() {
  const { me, session } = useSession()

  if (session.state === 'loading') {
    return (
      <Shell title={T.tab}>
        <section className="wrap page-body">
          <Loading rows={3} label={common.site.checkingSession} />
        </section>
      </Shell>
    )
  }

  if (!me || me.role !== 'admin') {
    return (
      <Shell title={T.tab}>
        <AdminGate signedIn={Boolean(me)} />
      </Shell>
    )
  }

  return <Desk />
}

function Desk() {
  const { seasonName } = usePlatform()
  const list = useApi('admin-notify', () => api.notifySends())
  const [kept, setKept] = useState<NotifySendList | null>(null)
  if (list.data && list.data !== kept) setKept(list.data)
  const data = list.data ?? kept
  const rows = data?.sends ?? []
  const loading = data === null && list.state === 'loading'

  const columns: Column<NotifySend>[] = [
    {
      key: 'text',
      head: T.head.text,
      className: 'adb-text',
      cell: (s) => (
        <>
          <div>{s.subject}</div>
          {s.link ? (
            <div className="adb-sub">
              <Link to={s.link}>{s.link}</Link>
            </div>
          ) : null}
        </>
      ),
    },
    { key: 'audience', head: T.head.audience, className: 'adb-text', cell: (s) => audienceWords(s.audience, seasonName) },
    {
      key: 'sent',
      head: T.head.sent,
      className: 'muted',
      cell: (s) => (
        <>
          <div>{fill(T.by, { handle: s.sent_by })}</div>
          <div className="adb-sub" title={dateTime(s.sent_at)}>
            {ago(s.sent_at)}
          </div>
        </>
      ),
    },
    { key: 'received', head: T.head.received, align: 'right', cell: (s) => num(s.recipients) },
    { key: 'opened', head: T.head.opened, align: 'right', wideOnly: true, cell: (s) => num(s.read) },
  ]

  return (
    <Shell title={T.tab}>
      <PageHeader
        crumbs={[{ label: common.admin.crumb, to: '/admin/seasons' }, { label: T.header.crumb }]}
        title={T.header.title}
        badges={<Badge tone="info">{common.admin.badge}</Badge>}
        actions={
          <Link className="btn primary" to="/admin/notify/new">
            <IconLabel icon="i-plus">{T.header.new}</IconLabel>
          </Link>
        }
      >
        <AdminTabs current="notify" />
      </PageHeader>

      <div className="wrap page-body">
        <div className="desk adb-one">
          <Panel className="fill">
            <PanelHead icon="i-bell" title={T.list.title} end={data ? <span className="num">{count(T.list.count, rows.length, { n: num(rows.length) })}</span> : null} />
            <div className="fill-scroll">
              {list.error && !data ? (
                <InlineError error={list.error} what={T.list.what} />
              ) : (
                <DataTable
                  state={loading ? 'loading' : 'ready'}
                  columns={columns}
                  rows={rows}
                  rowKey={(s) => s.id}
                  loadingRows={4}
                  empty={T.list.empty}
                />
              )}
            </div>
            <PanelFoot>
              <span className="hint">
                <Icon id="i-megaphone" /> {T.list.foot}
              </span>
            </PanelFoot>
          </Panel>
        </div>
      </div>
    </Shell>
  )
}

/** The chips a send was made with, as one line: each part a whole string from the copy. */
function audienceWords(a: NotifyAudience, seasonName: (slug: string) => string): string {
  const A = T.audience
  const parts: string[] = []
  if (a.everyone) parts.push(A.everyone)
  if (a.season) {
    const season = seasonName(a.season)
    parts.push(a.class ? fill(A.seasonClass, { class: a.class, season }) : fill(A.season, { season }))
  }
  if (a.models?.length) parts.push(count(A.models, a.models.length))
  if (a.handles?.length) {
    const shown = a.handles.slice(0, 3).map((h) => `@${h.replace(/^@/, '')}`).join(', ')
    parts.push(a.handles.length > 3 ? fill(A.handlesMore, { handles: shown, n: a.handles.length - 3 }) : fill(A.handles, { handles: shown }))
  }
  return parts.length ? parts.join(A.join) : A.unknown
}
