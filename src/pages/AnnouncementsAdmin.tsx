// `/admin/announcements` — admin session only. The lines the bar draws under itself on every page:
// the live ones first, then the past ones, as Soma orders them.
//
// THERE IS NO EDIT. An announcement is taken down and another published, so the list is a record
// of exactly what readers saw. Taking one down is the only action, and it asks once more first,
// because a sticky one cannot be put back: it is republished as a new line.
//
// The bar reads the live list once a minute (components/Announcements.tsx keeps it), so a take-down
// reaches readers within that minute, not at once; the sheet says so.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type AdminAnnouncement, type AdminAnnouncementList, type AnnouncementKind } from '../api'
import { forgetAnnouncements } from '../lib/announcements'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { ago, dateTime } from '../lib/format'
import { count, fill, lookup } from '../lib/copy'
import { Shell } from '../components/Shell'
import {
  Badge, type Column, DataTable, Icon, IconLabel, type IconId, Loading, Notice, PageHeader, Panel, PanelFoot, PanelHead,
} from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { AdminGate, InlineError } from '../components/ErrorStates'
import T from '../../copy/admin-announcements.json'
import common from '../../copy/common.json'

/** The bar's own icons (components/Announcements.tsx), so a row looks like what readers saw. */
const KIND_ICON: Record<AnnouncementKind, IconId> = {
  notice: 'i-megaphone',
  season: 'i-calendar',
  maintenance: 'i-clock',
  incident: 'i-alert',
}

export default function AnnouncementsAdmin() {
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

  // A courtesy, not the control: Soma answers 403 to a non-admin whatever this page renders.
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
  const list = useApi('admin-announcements', () => api.adminAnnouncements())
  // Kept across a re-read, so the table never blanks to skeletons after a take-down.
  const [kept, setKept] = useState<AdminAnnouncementList | null>(null)
  if (list.data && list.data !== kept) setKept(list.data)
  const data = list.data ?? kept

  const [asking, setAsking] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null)

  const disable = async (a: AdminAnnouncement) => {
    setBusy(true)
    setSaid(null)
    try {
      await api.disableAnnouncement(a.id)
      forgetAnnouncements()
      setSaid({ ok: true, text: T.said.disabled })
      setAsking(null)
      list.reload()
    } catch (err) {
      setSaid({ ok: false, text: refusal(err) })
    } finally {
      setBusy(false)
    }
  }

  const rows = data?.announcements ?? []
  const live = rows.filter((a) => a.live).length
  const loading = data === null && list.state === 'loading'

  const columns: Column<AdminAnnouncement>[] = [
    {
      key: 'type',
      head: T.head.type,
      cell: (a) => (
        <span className={`adb-ann-kind ${a.kind}`}>
          <IconLabel icon={KIND_ICON[a.kind]}>{T.kinds[a.kind]}</IconLabel>
        </span>
      ),
    },
    {
      key: 'text',
      head: T.head.text,
      className: 'adb-text',
      cell: (a) => (
        <>
          <div>{a.body}</div>
          {a.link ? (
            <div className="adb-sub">
              {a.link.startsWith('/') ? (
                <Link to={a.link}>{a.link}</Link>
              ) : (
                <a href={a.link} target="_blank" rel="noopener">
                  {a.link}
                </a>
              )}
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: 'ending',
      head: T.head.ending,
      wideOnly: true,
      cell: (a) => <Badge tone="off">{a.dismissable ? T.dismissable : T.sticky}</Badge>,
    },
    {
      key: 'ends',
      head: T.head.ends,
      wideOnly: true,
      className: 'muted',
      cell: (a) => (a.ends_at ? <span title={dateTime(a.ends_at)}>{dateTime(a.ends_at)}</span> : T.noEnd),
    },
    {
      key: 'published',
      head: T.head.published,
      className: 'muted',
      cell: (a) => (
        <>
          <div>
            {a.published_by === null ? T.byClock : fill(T.by, { handle: a.published_by })} · <span title={dateTime(a.published_at)}>{ago(a.published_at)}</span>
          </div>
          {!a.live ? (
            <div className="adb-sub">
              {a.disabled_by && a.disabled_at
                ? fill(T.disabledBy, { handle: a.disabled_by, when: dateTime(a.disabled_at) })
                : fill(T.ended, { when: dateTime(a.ends_at ?? a.disabled_at) })}
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: 'act',
      head: <span className="vis-hidden">{T.head.act}</span>,
      align: 'right',
      cell: (a) =>
        !a.live ? (
          <Badge tone="off">{T.past}</Badge>
        ) : asking === a.id ? (
          <span className="adb-acts">
            <button className="btn sm danger" type="button" disabled={busy} onClick={() => void disable(a)}>
              {T.confirm}
            </button>
            <button className="btn sm" type="button" disabled={busy} onClick={() => setAsking(null)}>
              {T.keep}
            </button>
          </span>
        ) : (
          <button
            className="btn sm"
            type="button"
            onClick={() => {
              setSaid(null)
              setAsking(a.id)
            }}
          >
            {T.disable}
          </button>
        ),
    },
  ]

  return (
    <Shell title={T.tab}>
      <PageHeader
        crumbs={[{ label: common.admin.crumb, to: '/admin/seasons' }, { label: T.header.crumb }]}
        title={T.header.title}
        badges={<Badge tone="info">{common.admin.badge}</Badge>}
        actions={
          <Link className="btn primary" to="/admin/announcements/new">
            <IconLabel icon="i-plus">{T.header.new}</IconLabel>
          </Link>
        }
      >
        <AdminTabs current="announcements" />
      </PageHeader>

      <div className="wrap page-body">
        <div className="desk adb-one">
          {said ? <Notice tone={said.ok ? 'ok' : 'bad'} title={said.text} /> : null}
          <Panel className="fill">
            <PanelHead
              icon="i-megaphone"
              title={T.list.title}
              end={data ? <span className="num">{count(T.list.live, live)}</span> : null}
            />
            <div className="fill-scroll">
              {list.error && !data ? (
                <InlineError error={list.error} what={T.list.what} />
              ) : (
                <DataTable
                  state={loading ? 'loading' : 'ready'}
                  columns={columns}
                  rows={rows}
                  rowKey={(a) => a.id}
                  rowClass={(a) => (a.live ? undefined : 'adb-past')}
                  loadingRows={4}
                  empty={T.list.empty}
                />
              )}
            </div>
            <PanelFoot>
              <span className="hint">
                <Icon id="i-info" /> {T.list.foot}
              </span>
            </PanelFoot>
          </Panel>
        </div>
      </div>
    </Shell>
  )
}

function refusal(err: unknown): string {
  if (err instanceof ApiError) {
    const said = lookup(T.refusals.said, err.code)
    if (said !== undefined) return said
    if (err.status === 0) return T.refusals.unreachable
  }
  return T.refusals.fallback
}
