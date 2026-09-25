// `/blog/:slug` — one team post, at a reading measure.
//
// The kind, the title, who wrote it and when, then the text through `Prose`. A line that is a
// match's address alone is drawn as a paused Player (the viewer's `player` tier, never autoplay),
// with a link to its watch page; each embed reads its own match, so one gone private costs that
// line and not the post. At the foot, three more stories. An admin sees Edit.
//
// A post that is unknown, or not published, answers 404 `unknown_post`: NotFound. Posts have no
// comments: comments are a match's and a model's.

import { Link, useParams } from 'react-router-dom'
import { api, type Post as PostBody } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { date } from '../lib/format'
import { fill } from '../lib/copy'
import { Shell } from '../components/Shell'
import { Icon, PageHeader, Section, Skel } from '../components/ui'
import { Prose } from '../components/Prose'
import { Replay } from '../components/Replay'
import { Avatar } from '../components/Avatar'
import { FetchFailed, NotFound } from '../components/ErrorStates'
import { StorySkeleton, StoryTile } from './Stories'
import T from '../../copy/post.json'
import common from '../../copy/common.json'

const E = common.errors

/** The player's board inside a 70ch column, and what its slot holds while the match loads. */
const EMBED_BOARD = 'min(52vh, 380px)'
const EMBED_SLOT = 460

export default function Post() {
  const { slug = '' } = useParams()
  const post = useApi(`post:${slug}`, () => api.post(slug))

  if (post.state === 'error') {
    return (
      <Shell title={post.error.status === 404 ? E.tabNotFound : E.tabNotLoaded} reading>
        {post.error.status === 404 ? <NotFound /> : <FetchFailed error={post.error} kind="route" />}
      </Shell>
    )
  }
  return (
    <Shell title={post.data?.title ?? T.tab} reading>
      {post.data ? <Article post={post.data} /> : <ArticleSkeleton />}
      <div className="wrap post-foot">
        <MoreStories slug={slug} />
      </div>
    </Shell>
  )
}

function Header({ post }: { post: PostBody | null }) {
  const { me } = useSession()
  return (
    <PageHeader
      crumbs={[
        { label: T.back, to: '/blog', icon: 'i-post' },
        { label: T.kind, icon: 'i-post' },
      ]}
      title={post ? post.title : <Skel w="80%" title={T.loading} />}
      actions={
        post && me?.role === 'admin' ? (
          <Link className="btn sm" to={`/admin/posts/${post.id}`}>
            <Icon id="i-post" />
            {T.edit}
          </Link>
        ) : null
      }
      sub={
        post ? (
          <span className="post-meta">
            <Avatar handle={post.author} size="xs" />
            <Link to={`/profile/${encodeURIComponent(post.author)}`}>{fill(T.by, { handle: post.author })}</Link>
            <span aria-hidden="true">·</span>
            <time dateTime={post.published_at}>{date(post.published_at)}</time>
          </span>
        ) : (
          <Skel w="40%" />
        )
      }
    />
  )
}

function Article({ post }: { post: PostBody }) {
  return (
    <article className="post">
      <Header post={post} />
      <div className="wrap page-body">
        <Prose className="post-prose" text={post.body} embed={(id) => <PostMatch id={id} />} />
      </div>
    </article>
  )
}

/** The post while it loads: its header and a few lines of text, in their places. */
function ArticleSkeleton() {
  return (
    <div className="post" aria-busy="true">
      <Header post={null} />
      <div className="wrap page-body">
        <div className="post-skel">
          <Skel />
          <Skel />
          <Skel w="90%" />
          <Skel w="60%" />
        </div>
      </div>
    </div>
  )
}

/** A match named on a line of its own: a paused Player and the way to its page. */
function PostMatch({ id }: { id: string }) {
  const match = useApi(`post-match:${id}`, () => api.match(id))
  if (match.state === 'error') {
    return (
      <p className="post-embed-note">
        {match.error.status === 404 ? T.embed.missing : fill(T.embed.failed, { status: match.error.status, code: match.error.code })}{' '}
        <Link to={`/matches/${id}`}>{`/matches/${id}`}</Link>
      </p>
    )
  }
  return (
    <figure className="post-embed">
      <Replay match={match.data} tier="player" autoplay={false} height={EMBED_SLOT} stageHeight={EMBED_BOARD} />
      <figcaption>
        <Link to={`/matches/${id}`}>
          <Icon id="i-matches" />
          {T.embed.watch} →
        </Link>
      </figcaption>
    </figure>
  )
}

/** Three more, newest first, this one left out: four are asked for so three remain when it is
 *  among them. */
function MoreStories({ slug }: { slug: string }) {
  const list = useApi('post-more', () => api.stories({ limit: 4 }))
  if (list.state === 'error') return null
  const others = (list.data?.stories ?? []).filter((s) => !(s.kind === 'team' && s.slug === slug)).slice(0, 3)
  if (list.state === 'ready' && others.length === 0) return null
  return (
    <Section title={T.more} icon="i-post" more={{ label: T.all, to: '/blog', icon: 'i-post' }}>
      <div className="post-more">
        {list.state === 'loading'
          ? Array.from({ length: 3 }, (_, i) => <StorySkeleton key={i} />)
          : others.map((s) => <StoryTile s={s} key={s.kind === 'team' ? s.id : s.model_id} />)}
      </div>
    </Section>
  )
}
