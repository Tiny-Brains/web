// `/admin/posts/new` and `/admin/posts/:id` — admin session only. The writer: a title, a slug, the
// text, and the post as it will read beside it (Prose, the component /blog/:slug draws with).
//
// A NEW POST BECOMES A DRAFT ON ITS FIRST SAVE, and the address moves to its id, which never changes
// however often the slug does. Until the slug is typed, it follows the title.
//
// PUBLISH PUBLISHES WHAT IS ON SCREEN: it saves the fields and publishes in one write. Unpublish only
// unpublishes, so unsaved edits stay in the form rather than going quietly live or quietly lost.
// A published post's slug is its public address, and the hint says so while it is live.

import { type ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ApiError, api, type AdminPost } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { fill, lookup } from '../lib/copy'
import { Shell } from '../components/Shell'
import { Prose } from '../components/Prose'
import { Badge, Field, IconLabel, Loading, Notice, PageHeader, PagePlaceholder, Panel, PanelBody, PanelHead, Rich } from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { AdminGate, FetchFailed } from '../components/ErrorStates'
import T from '../../copy/admin-post-edit.json'
import common from '../../copy/common.json'

const F = T.form

export default function PostEdit() {
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

  return <Writer />
}

function Frame({ post, children }: { post: AdminPost | null; children: ReactNode }) {
  return (
    <Shell title={T.tab}>
      <PageHeader
        crumbs={[
          { label: common.admin.crumb, to: '/admin/seasons' },
          { label: T.header.parent, to: '/admin/posts' },
          { label: post ? T.header.crumbEdit : T.header.crumbNew },
        ]}
        title={post ? T.header.titleEdit : T.header.titleNew}
        badges={
          <>
            <Badge tone="info">{common.admin.badge}</Badge>
            {post ? <Badge tone={post.published ? 'ok' : 'off'}>{post.published ? T.header.published : T.header.draft}</Badge> : null}
          </>
        }
      >
        <AdminTabs current="posts" />
      </PageHeader>
      <div className="wrap page-body">{children}</div>
    </Shell>
  )
}

function Writer() {
  const { id } = useParams()
  const post = useApi(`admin-post:${id ?? ''}`, () => api.adminPost(id ?? ''), Boolean(id))

  if (!id) return <Editor key="new" post={null} />
  if (post.error) {
    return (
      <Frame post={null}>
        <FetchFailed error={post.error} kind="route" />
      </Frame>
    )
  }
  if (!post.data) {
    return (
      <Frame post={null}>
        <Loading rows={8} label={T.loading} />
      </Frame>
    )
  }
  return <Editor key={post.data.id} post={post.data} />
}

/** The slug a title suggests: lower-case words joined by hyphens, as Soma's check wants them. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')
}

type Said = { ok: boolean; text: string }

function Editor({ post }: { post: AdminPost | null }) {
  const navigate = useNavigate()
  const location = useLocation()
  // A new post's first save moves the address to its id and remounts this; what it said comes along.
  const carried = (location.state as { said?: Said } | null)?.said ?? null

  const [saved, setSaved] = useState<AdminPost | null>(post)
  const [title, setTitle] = useState(post?.title ?? '')
  const [slugTyped, setSlugTyped] = useState<string | null>(post ? post.slug : null)
  const [body, setBody] = useState(post?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<Said | null>(carried)

  const slug = slugTyped ?? slugify(title)
  const dirty = !saved || title !== saved.title || slug !== saved.slug || body !== saved.body
  const ready = title.trim() !== '' && slug !== ''

  const fields = () => ({ title: title.trim(), slug, body })

  const write = async (publish: boolean | null) => {
    setSaid(null)
    if (!ready) return setSaid({ ok: false, text: T.refusals.needTitle })
    setBusy(true)
    let created: AdminPost | null = null
    try {
      if (!saved) {
        created = await api.createPost(fields())
        if (publish) created = await api.updatePost(created.id, { published: true })
        const next: Said = { ok: true, text: publish ? fill(T.said.published, { slug: created.slug }) : T.said.created }
        navigate(`/admin/posts/${created.id}`, { replace: true, state: { said: next } })
        return
      }
      const res = await api.updatePost(saved.id, publish === false ? { published: false } : { ...fields(), ...(publish ? { published: true } : {}) })
      setSaved(res)
      setSaid({
        ok: true,
        text:
          publish === true
            ? fill(T.said.published, { slug: res.slug })
            : publish === false
              ? T.said.unpublished
              : res.published
                ? T.said.savedLive
                : T.said.saved,
      })
    } catch (err) {
      // The draft was made and only the publish failed: open it, so a retry does not make another.
      if (created) {
        navigate(`/admin/posts/${created.id}`, { replace: true, state: { said: { ok: false, text: refusal(err) } } })
        return
      }
      setSaid({ ok: false, text: refusal(err) })
    } finally {
      setBusy(false)
    }
  }

  const live = saved?.published ?? false

  return (
    <Frame post={saved}>
      <div className="stack">
        {said ? <Notice tone={said.ok ? 'ok' : 'bad'} title={<Rich text={said.text} />} /> : null}
        <div className="adb-post-write">
          <Panel>
            <PanelBody>
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault()
                  void write(null)
                }}
              >
                <Field label={F.title} htmlFor="pw-title" hint={fill(F.titleHint, { n: title.length })}>
                  <input
                    className="input"
                    id="pw-title"
                    type="text"
                    maxLength={120}
                    placeholder={F.titlePlaceholder}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>

                <Field
                  label={F.slug}
                  htmlFor="pw-slug"
                  hint={<Rich text={slug ? fill(live ? F.slugLiveHint : F.slugHint, { slug }) : F.slugHintEmpty} />}
                >
                  <input
                    className="input mono"
                    id="pw-slug"
                    type="text"
                    maxLength={80}
                    placeholder={F.slugPlaceholder}
                    value={slug}
                    onChange={(e) => setSlugTyped(e.target.value)}
                  />
                </Field>

                <Field label={F.text} htmlFor="pw-text" hint={F.textHint}>
                  <textarea
                    className="input adb-post-text"
                    id="pw-text"
                    maxLength={100_000}
                    placeholder={F.textPlaceholder}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </Field>

                <div className="row">
                  <button className="btn" type="submit" disabled={busy || !ready || !dirty}>
                    {busy ? F.working : live ? F.save : F.saveDraft}
                  </button>
                  {live ? (
                    <button className="btn" type="button" disabled={busy} onClick={() => void write(false)}>
                      {F.unpublish}
                    </button>
                  ) : (
                    <button className="btn primary" type="button" disabled={busy || !ready} onClick={() => void write(true)}>
                      <IconLabel icon="i-post">{F.publish}</IconLabel>
                    </button>
                  )}
                  <Link className="btn ghost" to="/admin/posts">
                    {F.cancel}
                  </Link>
                  {saved ? (
                    dirty ? (
                      <Badge tone="wait">{F.unsaved}</Badge>
                    ) : (
                      <Badge tone="off">{F.saved}</Badge>
                    )
                  ) : null}
                </div>
              </form>
            </PanelBody>
          </Panel>

          <Panel className="adb-post-preview">
            <PanelHead icon="i-eye" title={F.preview} />
            <PanelBody>
              {title.trim() || body.trim() ? (
                <article className="stack tight">
                  {title.trim() ? <h1 className="adb-post-preview-title">{title}</h1> : null}
                  <Prose text={body} />
                </article>
              ) : (
                <p className="muted">{F.previewEmpty}</p>
              )}
            </PanelBody>
          </Panel>
        </div>
      </div>
    </Frame>
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
