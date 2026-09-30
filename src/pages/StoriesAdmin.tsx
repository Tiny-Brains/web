// `/admin/stories` — admin session only. Every model's story, newest edit first: the list, and the
// one picked beside it with its actions. The filter (`?show=`) and the story picked (`?model=`) are
// in the address, so a held story can be sent to another admin as a link.
//
// A HELD EDIT SHOWS BESIDE THE APPROVED TEXT the public still reads. Soma's desk list carries the
// held edit whole but only the approved text's opening, so the approved text is read from the
// model's public story route; a removed story has none there, and the opening stands in for it.
//
// EACH ACTION HAS A PRECONDITION in Soma (feature needs an approved text that is not removed;
// approve and reject a held edit; remove and restore their opposites), so only the actions that
// apply are drawn, and a 409 `story_state` means another admin got there first: the list re-reads.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type AdminStory, type AdminStoryList, type StoryAction } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { useQueryState } from '../lib/selection'
import { ago, dateTime } from '../lib/format'
import { count, fill, lookup } from '../lib/copy'
import { cx } from '../lib/cx'
import { Shell } from '../components/Shell'
import { Prose } from '../components/Prose'
import { Owner } from '../components/Model'
import { Badge, type Column, DataTable, EmptyState, Field, Notice, PageHeader, PagePlaceholder, Panel, PanelBody, PanelHead, Segmented, Skel } from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { AdminGate, InlineError } from '../components/ErrorStates'
import T from '../../copy/admin-stories.json'
import common from '../../copy/common.json'

type Show = 'all' | 'held' | 'featured' | 'removed'
const SHOWS: Show[] = ['all', 'held', 'featured', 'removed']

export default function StoriesAdmin() {
  const { me, session } = useSession()

  if (session.state === 'loading') {
    return (
      <Shell title={T.tab}>
        <PagePlaceholder label={common.site.checkingSession} />
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

function tagWords(tag: string): string {
  return tag === 'link' ? T.tagLink : fill(T.tagWord, { word: tag })
}

function Desk() {
  const [get, set] = useQueryState()
  const show: Show = (SHOWS as string[]).includes(get('show')) ? (get('show') as Show) : 'all'
  const pickedId = get('model')

  const list = useApi('admin-stories', () => api.adminStories())
  const [kept, setKept] = useState<AdminStoryList | null>(null)
  if (list.data && list.data !== kept) setKept(list.data)
  const data = list.data ?? kept
  const all = data?.stories ?? []
  const rows = all.filter((s) =>
    show === 'held' ? s.held : show === 'featured' ? s.featured : show === 'removed' ? s.removed : true,
  )
  const picked = all.find((s) => s.model_id === pickedId) ?? null
  const loading = data === null && list.state === 'loading'

  const columns: Column<AdminStory>[] = [
    {
      key: 'model',
      head: T.head.model,
      className: 'adb-text',
      cell: (s) => (
        <>
          <button className="adb-story-pick" type="button" aria-pressed={s.model_id === pickedId} onClick={() => set({ model: s.model_id })}>
            {s.model}
          </button>
          <div className="adb-sub">{s.title ?? s.pending?.title ?? T.detail.untitled}</div>
        </>
      ),
    },
    { key: 'owner', head: T.head.owner, wideOnly: true, cell: (s) => <Owner handle={s.owner} baseline={s.baseline} /> },
    { key: 'updated', head: T.head.updated, className: 'muted', cell: (s) => <span title={dateTime(s.updated_at)}>{ago(s.updated_at)}</span> },
    { key: 'state', head: T.head.state, cell: (s) => <StoryBadges s={s} /> },
  ]

  return (
    <Shell title={T.tab}>
      <PageHeader
        crumbs={[{ label: common.admin.crumb, to: '/admin/seasons' }, { label: T.header.crumb }]}
        title={T.header.title}
        badges={<Badge tone="info">{common.admin.badge}</Badge>}
      >
        <AdminTabs current="stories" />
      </PageHeader>

      <div className="wrap page-body">
        <div className="desk adb-one">
          <div className="desk-lists adb-story-desk">
            <Panel className="fill">
              <PanelHead
                icon="i-post"
                title={T.list.title}
                end={data ? <span className="num">{count(T.list.count, rows.length)}</span> : null}
              >
                <Segmented
                  label={T.filter.label}
                  value={show}
                  onChange={(k) => set({ show: k === 'all' ? '' : k })}
                  items={SHOWS.map((k) => ({
                    key: k,
                    label: k === 'held' && data ? fill(T.filter.heldCount, { n: all.filter((s) => s.held).length }) : T.filter[k],
                  }))}
                />
              </PanelHead>
              <div className="fill-scroll">
                {list.error && !data ? (
                  <InlineError error={list.error} what={T.list.what} />
                ) : (
                  <DataTable
                    state={loading ? 'loading' : 'ready'}
                    columns={columns}
                    rows={rows}
                    rowKey={(s) => s.model_id}
                    rowClass={(s) => (s.model_id === pickedId ? 'adb-picked' : undefined)}
                    loadingRows={6}
                    empty={all.length ? T.list.emptyFiltered : T.list.empty}
                  />
                )}
              </div>
            </Panel>

            {picked ? (
              <Detail key={picked.model_id} s={picked} onChanged={list.reload} />
            ) : (
              <Panel className="fill">
                <PanelBody>
                  {loading ? <Skel w="60%" /> : <EmptyState>{T.detail.pick}</EmptyState>}
                </PanelBody>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </Shell>
  )
}

function StoryBadges({ s }: { s: AdminStory }) {
  return (
    <span className="adb-state">
      {s.held && s.pending ? <Badge tone="wait">{fill(T.heldTag, { tag: tagWords(s.pending.hold_tag) })}</Badge> : null}
      {s.removed ? <Badge tone="bad">{T.removed}</Badge> : null}
      {s.featured ? <Badge tone="ok">{T.featured}</Badge> : null}
      {!s.held && !s.removed && !s.featured ? <Badge tone="off">{T.live}</Badge> : null}
    </span>
  )
}

function Detail({ s, onChanged }: { s: AdminStory; onChanged: () => void }) {
  // The whole approved text, from the public route; `approved_at` is in the key so an approve
  // re-reads it. A removed story, or one never approved, has nothing there.
  const readable = s.title !== null && !s.removed
  const approved = useApi(`story:${s.model_id}:${s.approved_at ?? ''}`, () => api.modelStory(s.model_id), readable)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null)

  const act = async (action: StoryAction) => {
    setBusy(true)
    setSaid(null)
    try {
      await api.updateStory(s.model_id, { action, reason: reason.trim() || null })
      setSaid({ ok: true, text: T.said[action] })
      setReason('')
    } catch (err) {
      setSaid({ ok: false, text: refusal(err) })
    } finally {
      setBusy(false)
      // Either way the row may have moved: a success changed it, and a 409 means someone else did.
      onChanged()
    }
  }

  const actions: { action: StoryAction; primary?: boolean; danger?: boolean }[] = []
  if (s.held) actions.push({ action: 'approve', primary: true }, { action: 'reject' })
  if (s.title !== null && !s.removed) actions.push({ action: s.featured ? 'unfeature' : 'feature' })
  actions.push(s.removed ? { action: 'restore' } : { action: 'remove', danger: true })

  return (
    <Panel className="fill adb-story-detail">
      <PanelHead
        title={
          <h3>
            {s.model}{' '}
            <span className="muted">
              · <Owner handle={s.owner} baseline={s.baseline} />
            </span>
          </h3>
        }
        end={<Link to={`/models/${s.model_id}`}>{T.detail.open}</Link>}
      />
      <div className="adb-story-body">
        <StoryBadges s={s} />
        {s.removed ? <Notice tone="warn" title={T.detail.removedNote} /> : null}
        <div className={cx('adb-story-compare', s.pending && 'two')}>
          {s.pending ? (
            <section className="adb-story-col">
              <h4>{T.detail.heldTitle}</h4>
              <p className="hint">{fill(T.detail.heldWhy, { tag: tagWords(s.pending.hold_tag) })}</p>
              <div className="adb-story-text held">
                <h2>{s.pending.title}</h2>
                <Prose text={s.pending.body} />
              </div>
            </section>
          ) : null}
          <section className="adb-story-col">
            <h4>{T.detail.approvedTitle}</h4>
            {s.title === null ? (
              <p className="hint">{T.detail.noApproved}</p>
            ) : readable && approved.data ? (
              <div className="adb-story-text">
                <h2>{approved.data.title}</h2>
                <Prose text={approved.data.body} />
              </div>
            ) : readable && approved.state === 'loading' ? (
              <div className="adb-story-text" aria-label={T.detail.approvedLoading}>
                <Skel w="50%" />
                <Skel />
                <Skel w="80%" />
              </div>
            ) : (
              <div className="adb-story-text">
                <p className="hint">{T.detail.excerptNote}</p>
                <h2>{s.title}</h2>
                <p>{s.excerpt}</p>
              </div>
            )}
          </section>
        </div>
      </div>
      <div className="adb-story-acts">
        {said ? <Notice tone={said.ok ? 'ok' : 'bad'} title={said.text} /> : null}
        <Field label={T.detail.reason} htmlFor={`sr-${s.model_id}`}>
          <input
            className="input"
            id={`sr-${s.model_id}`}
            type="text"
            maxLength={300}
            placeholder={T.detail.reasonPlaceholder}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <div className="row">
          {actions.map((a) => (
            <button
              className={cx('btn sm', a.primary && 'primary', a.danger && 'danger')}
              type="button"
              disabled={busy}
              onClick={() => void act(a.action)}
              key={a.action}
            >
              {T.detail[a.action]}
            </button>
          ))}
        </div>
      </div>
    </Panel>
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
