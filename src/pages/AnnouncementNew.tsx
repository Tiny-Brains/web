// `/admin/announcements/new` — admin session only. One line under the bar on every page, published
// at once; the list at /admin/announcements is where it is taken down, since there is no edit.
//
// THE FOUR TYPES ARE A CLOSED LIST (notice, season, maintenance, incident): the bar picks its
// colour and icon from the type, so a fifth is a change to the bar as well as to this form.
//
// THE TEXT IS ONE LINE, so it is an <input>, which cannot carry a newline, and not a textarea that
// Soma would refuse. The preview is drawn with the bar's own classes, so what the admin sees is
// what a reader gets. The end time is typed in the admin's local time and sent as an instant.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, api, type AnnouncementKind } from '../api'
import { useSession } from '../providers/session-context'
import { fill, lookup } from '../lib/copy'
import { Shell } from '../components/Shell'
import {
  Badge, Field, Icon, IconLabel, type IconId, Loading, Notice, PageHeader, Panel, PanelBody, Segmented, Switch,
} from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { AdminGate } from '../components/ErrorStates'
import T from '../../copy/admin-announcement-new.json'
import common from '../../copy/common.json'

const F = T.form
const KINDS: { key: AnnouncementKind; icon: IconId }[] = [
  { key: 'notice', icon: 'i-megaphone' },
  { key: 'season', icon: 'i-calendar' },
  { key: 'maintenance', icon: 'i-clock' },
  { key: 'incident', icon: 'i-alert' },
]
const MAX = 200

export default function AnnouncementNew() {
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

  return <Form />
}

function Form() {
  const navigate = useNavigate()
  const [kind, setKind] = useState<AnnouncementKind>('notice')
  const [text, setText] = useState('')
  const [link, setLink] = useState('')
  const [sticky, setSticky] = useState(false)
  const [ends, setEnds] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const body = text.trim()
  const href = link.trim()

  const publish = async () => {
    setError(null)
    if (!body) return setError(T.refusals.empty)
    // datetime-local has no zone: `new Date` reads it as the browser's local time, which is what
    // the hint promises the admin.
    const endsAt = ends ? new Date(ends) : null
    if (endsAt && endsAt.getTime() <= Date.now()) return setError(T.refusals.past)
    setBusy(true)
    try {
      await api.createAnnouncement({
        kind,
        body,
        link: href || null,
        dismissable: !sticky,
        ends_at: endsAt ? endsAt.toISOString() : null,
      })
      navigate('/admin/announcements')
    } catch (err) {
      setError(refusal(err))
      setBusy(false)
    }
  }

  const icon = KINDS.find((k) => k.key === kind)?.icon ?? 'i-megaphone'

  return (
    <Shell title={T.tab}>
      <PageHeader
        crumbs={[
          { label: common.admin.crumb, to: '/admin/seasons' },
          { label: T.header.parent, to: '/admin/announcements' },
          { label: T.header.crumb },
        ]}
        title={T.header.title}
        badges={<Badge tone="info">{common.admin.badge}</Badge>}
      >
        <AdminTabs current="announcements" />
      </PageHeader>

      <div className="wrap page-body">
        <div className="form-page">
          <Panel>
            <PanelBody>
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault()
                  void publish()
                }}
              >
                <Field label={F.type} hint={F.typeHint}>
                  <div>
                    <Segmented
                      label={F.type}
                      value={kind}
                      onChange={(k) => setKind(k as AnnouncementKind)}
                      items={KINDS.map((k) => ({ key: k.key, icon: k.icon, label: F.kinds[k.key] }))}
                    />
                  </div>
                </Field>

                <Field label={F.text} htmlFor="an-text" hint={fill(F.textHint, { n: text.length })}>
                  <input
                    className="input"
                    id="an-text"
                    type="text"
                    maxLength={MAX}
                    placeholder={F.textPlaceholder}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </Field>

                <Field label={F.link} htmlFor="an-link" hint={F.linkHint}>
                  <input
                    className="input mono"
                    id="an-link"
                    type="text"
                    maxLength={500}
                    placeholder={F.linkPlaceholder}
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                  />
                </Field>

                <Field label={F.ending} hint={sticky ? F.stickyHint : F.dismissableHint}>
                  <div>
                    <Switch label={F.ending} checked={sticky} onChange={setSticky} />
                  </div>
                </Field>

                <Field label={F.endsAt} htmlFor="an-ends" hint={F.endsAtHint}>
                  <div className="row">
                    <input
                      className="input mono adb-ann-when"
                      id="an-ends"
                      type="datetime-local"
                      value={ends}
                      onChange={(e) => setEnds(e.target.value)}
                    />
                    {ends ? (
                      <button className="btn sm" type="button" onClick={() => setEnds('')}>
                        {F.clear}
                      </button>
                    ) : null}
                  </div>
                </Field>

                <Field label={F.preview}>
                  {/* The bar's own markup and classes, so the colour and icon are the ones readers get. */}
                  <div className="adb-ann-preview">
                    <div className={`site-ann ${kind}`}>
                      <Icon id={icon} label={common.shell.announcements.kinds[kind]} />
                      <span>
                        {body || <span className="muted">{F.previewEmpty}</span>}
                        {href ? <a href={href} onClick={(e) => e.preventDefault()}>{F.more}</a> : null}
                      </span>
                      {!sticky ? (
                        <span className="icon-btn" aria-hidden="true" title={F.close}>
                          <Icon id="i-x" />
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Field>

                {error ? <Notice tone="bad" title={error} /> : null}

                <div className="row">
                  <button className="btn primary" type="submit" disabled={busy || !body}>
                    <IconLabel icon="i-megaphone">{busy ? F.publishing : F.publish}</IconLabel>
                  </button>
                  <Link className="btn" to="/admin/announcements">
                    {F.cancel}
                  </Link>
                </div>
              </form>
            </PanelBody>
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
