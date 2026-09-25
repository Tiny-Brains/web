// `/blog` — Stories: the team's posts and the model stories an admin featured, in one list, newest
// first. A post opens at `/blog/:slug`; a model story opens on its model page, where it lives, so
// this page is a door to it and never a copy.
//
// The kind is in the query string (`?kind=team|model`, omitted for All). Twenty a page, then Load
// more on Soma's cursor: the pages already read stay, and a new kind starts over. `total` is
// counted on the first page only, which is the one the header reads.
//
// `StoryTile` and `StorySkeleton` are the post page's "More stories" too.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type StoryCard, type StoryKind } from '../api'
import { useApi } from '../lib/useApi'
import { useQueryState } from '../lib/selection'
import { ago, excerpt, num } from '../lib/format'
import { cx } from '../lib/cx'
import { fill } from '../lib/copy'
import { Shell } from '../components/Shell'
import { EmptyState, Icon, PageHeader, Segmented, Skel } from '../components/ui'
import { ClassBadge } from '../components/Model'
import { Avatar } from '../components/Avatar'
import { InlineError } from '../components/ErrorStates'
import T from '../../copy/stories.json'

const PAGE = 20
const KINDS: StoryKind[] = ['all', 'team', 'model']

type More = { kind: StoryKind; items: StoryCard[]; cursor: string | null }

export default function Stories() {
  const [q, setQ] = useQueryState()
  const kind: StoryKind = KINDS.find((k) => k === q('kind')) ?? 'all'

  const first = useApi(`stories:${kind}`, () => api.stories({ kind, limit: PAGE }))
  // The pages Load more read after the first, tagged with the kind they were read under, so a kind
  // arriving by the address (Back) never shows another kind's pages.
  const [more, setMore] = useState<More | null>(null)
  const [busy, setBusy] = useState(false)
  const [moreError, setMoreError] = useState<ApiError | null>(null)
  const extra = more?.kind === kind ? more : null
  const items = [...(first.data?.stories ?? []), ...(extra?.items ?? [])]
  const cursor = extra ? extra.cursor : (first.data?.next_cursor ?? null)

  const loadMore = () => {
    if (!cursor || busy) return
    setBusy(true)
    setMoreError(null)
    api.stories({ kind, cursor, limit: PAGE }).then(
      (r) => {
        setMore({ kind, items: [...(extra?.items ?? []), ...r.stories], cursor: r.next_cursor })
        setBusy(false)
      },
      (err: unknown) => {
        setMoreError(err instanceof ApiError ? err : new ApiError(0, 'network', String(err)))
        setBusy(false)
      },
    )
  }

  const total = first.data?.total ?? null

  return (
    <Shell title={T.tab}>
      <PageHeader
        crumbs={[{ label: T.title, icon: 'i-post' }]}
        title={T.title}
        icon="i-post"
        badges={total !== null && total > 0 ? <span className="stories-count">{num(total)}</span> : null}
      />
      <div className="wrap page-body">
        <div className="stack">
          <div className="stories-filters">
            <Segmented label={T.filter.label} items={T.filter.options} value={kind} onChange={(k) => {
                setMore(null)
                setMoreError(null)
                setQ({ kind: k === 'all' ? '' : k })
              }} />
          </div>

          {first.state === 'error' ? (
            <InlineError error={first.error} what={T.error} />
          ) : first.state === 'loading' ? (
            <div className="stories-grid" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <StorySkeleton key={i} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState boxed>{kind === 'all' ? T.empty : T.emptyKind[kind]}</EmptyState>
          ) : (
            <>
              <div className="stories-grid">
                {items.map((s) => (
                  <StoryTile s={s} key={s.kind === 'team' ? s.id : s.model_id} />
                ))}
              </div>
              {moreError ? <p className="muted stories-more-error">{fill(T.moreError, { status: moreError.status, code: moreError.code })}</p> : null}
              {cursor ? (
                <button type="button" className="btn stories-load" onClick={loadMore} disabled={busy}>
                  {busy ? T.loadingMore : T.loadMore}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Shell>
  )
}

/** A story as a card: its kind, the title, the first two lines, who wrote it and when. A post
 *  opens its page; a model story opens the model it is about. */
export function StoryTile({ s }: { s: StoryCard }) {
  const to = s.kind === 'team' ? `/blog/${encodeURIComponent(s.slug)}` : `/models/${s.model_id}`
  return (
    <Link className="stories-card" to={to}>
      <span className={cx('stories-kind', s.kind)}>
        <Icon id={s.kind === 'team' ? 'i-post' : 'i-flask'} />
        <span className="stories-kind-word">{s.kind === 'team' ? T.card.team : fill(T.card.model, { model: s.model })}</span>
        {s.kind === 'model' && s.class ? (
          <span className="push">
            <ClassBadge k={s.class} />
          </span>
        ) : null}
      </span>
      <h3>{s.title}</h3>
      <p>{excerpt(s.excerpt)}</p>
      <span className="stories-by">
        <Avatar handle={s.author} size="xs" />
        <span className="stories-handle">{fill(T.card.by, { handle: s.author })}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={s.at}>{ago(s.at)}</time>
      </span>
    </Link>
  )
}

/** A card while the list loads, in the card's own shape. */
export function StorySkeleton() {
  return (
    <div className="stories-card" aria-hidden="true">
      <Skel w="35%" />
      <Skel w="85%" />
      <span className="stories-skel-lines">
        <Skel />
        <Skel w="70%" />
      </span>
      <Skel w="45%" />
    </div>
  )
}
