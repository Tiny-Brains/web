// `/admin/posts` — admin session only. The blog's posts, drafts and published together, newest
// first as Soma lists them (the newest 500, without their text). A row opens the writer at
// /admin/posts/:id; a new post is written at /admin/posts/new, the desk rule.
//
// A post is addressed by its id here and by its slug in public: the slug can change while the post
// is being written, and the id is what keeps the writer's address steady across that change.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type AdminPostList, type AdminPostRow } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { ago, date, dateTime, num } from '../lib/format'
import { fill } from '../lib/copy'
import { Shell } from '../components/Shell'
import { Badge, type Column, DataTable, Icon, IconLabel, Loading, PageHeader, Panel, PanelFoot, PanelHead } from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { AdminGate, InlineError } from '../components/ErrorStates'
import T from '../../copy/admin-posts.json'
import common from '../../copy/common.json'

export default function PostsAdmin() {
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
  const list = useApi('admin-posts', () => api.adminPosts())
  const [kept, setKept] = useState<AdminPostList | null>(null)
  if (list.data && list.data !== kept) setKept(list.data)
  const data = list.data ?? kept
  const rows = data?.posts ?? []
  const published = rows.filter((p) => p.published).length
  const loading = data === null && list.state === 'loading'

  const columns: Column<AdminPostRow>[] = [
    {
      key: 'title',
      head: T.head.title,
      className: 'adb-text',
      cell: (p) => (
        <>
          <Link to={`/admin/posts/${p.id}`}>{p.title}</Link>
          <div className="adb-sub mono">{p.slug}</div>
        </>
      ),
    },
    { key: 'author', head: T.head.author, wideOnly: true, className: 'muted', cell: (p) => fill(T.by, { handle: p.author }) },
    {
      key: 'updated',
      head: T.head.updated,
      className: 'muted',
      cell: (p) => <span title={dateTime(p.updated_at)}>{ago(p.updated_at)}</span>,
    },
    {
      key: 'state',
      head: T.head.state,
      cell: (p) =>
        p.published ? (
          <span className="adb-state">
            <Badge tone="ok">{T.published}</Badge>
            <span className="muted" title={dateTime(p.published_at)}>
              {fill(T.publishedOn, { date: date(p.published_at) })}
            </span>
          </span>
        ) : (
          <Badge tone="off">{T.draft}</Badge>
        ),
    },
    {
      key: 'view',
      head: <span className="vis-hidden">{T.head.view}</span>,
      align: 'right',
      wideOnly: true,
      cell: (p) =>
        p.published ? (
          <Link to={`/blog/${p.slug}`} aria-label={fill(T.viewLabel, { title: p.title })}>
            {T.view} →
          </Link>
        ) : null,
    },
  ]

  return (
    <Shell title={T.tab}>
      <PageHeader
        crumbs={[{ label: common.admin.crumb, to: '/admin/seasons' }, { label: T.header.crumb }]}
        title={T.header.title}
        badges={<Badge tone="info">{common.admin.badge}</Badge>}
        actions={
          <Link className="btn primary" to="/admin/posts/new">
            <IconLabel icon="i-plus">{T.header.new}</IconLabel>
          </Link>
        }
      >
        <AdminTabs current="posts" />
      </PageHeader>

      <div className="wrap page-body">
        <div className="desk adb-one">
          <Panel className="fill">
            <PanelHead
              icon="i-post"
              title={T.list.title}
              end={data ? <span className="num">{fill(T.list.count, { published: num(published), drafts: num(rows.length - published) })}</span> : null}
            />
            <div className="fill-scroll">
              {list.error && !data ? (
                <InlineError error={list.error} what={T.list.what} />
              ) : (
                <DataTable
                  state={loading ? 'loading' : 'ready'}
                  columns={columns}
                  rows={rows}
                  rowKey={(p) => p.id}
                  loadingRows={5}
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
