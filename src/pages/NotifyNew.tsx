// `/admin/notify/new` — admin session only. A line and a link that land in the bell, as their own
// kind with the megaphone, for the audience the chips name. It sends at once; Notify schedules
// nothing, and an announcement with an end time is the timed notice.
//
// THE CHIPS ARE A UNION, as Soma reads them (notify_audience()): everyone, one season's submitters
// (one class of them, if a class is picked), the owners of pasted models, and handles typed by
// hand. Each chip opens its own field, and a chip whose field is empty adds nobody.
//
// THE COUNT IS SOMA'S, asked a moment after the chips stop changing: `audience` is who the chips
// name and `recipients` those of them who take season notifications, which is who a send reaches.
// The Send button carries that number, so an admin never sends to a number they have not seen.
//
// There is no route to search models by name, so a model's owner is named by pasting its id or its
// page's address; the ids are read out of whatever is pasted.

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, api, type NotifyAudience, type NotifyCount } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { usePlatform } from '../providers/platform-context'
import { num } from '../lib/format'
import { count, fill, lookup } from '../lib/copy'
import { cx } from '../lib/cx'
import { Shell } from '../components/Shell'
import { Badge, Field, Icon, IconLabel, type IconId, Loading, Notice, PageHeader, Panel, PanelBody, Segmented, Select } from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { AdminGate } from '../components/ErrorStates'
import T from '../../copy/admin-notify-new.json'
import common from '../../copy/common.json'

const F = T.form
const MAX = 200
const MAX_MODELS = 100
const MAX_HANDLES = 500
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

type Chip = 'everyone' | 'season' | 'models' | 'handles'
const CHIPS: { key: Chip; icon: IconId }[] = [
  { key: 'everyone', icon: 'i-seats' },
  { key: 'season', icon: 'i-calendar' },
  { key: 'models', icon: 'i-flask' },
  { key: 'handles', icon: 'i-user' },
]

export default function NotifyNew() {
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

/** Every model id in what was pasted, once each: bare ids and /models/<id> addresses alike. */
function modelIds(text: string): string[] {
  return [...new Set((text.match(UUID) ?? []).map((s) => s.toLowerCase()))]
}

/** Handles separated by commas or spaces, the @ optional, once each whatever their case. */
function handleList(text: string): string[] {
  const seen = new Map<string, string>()
  for (const raw of text.split(/[\s,]+/)) {
    const h = raw.replace(/^@+/, '')
    if (h && !seen.has(h.toLowerCase())) seen.set(h.toLowerCase(), h)
  }
  return [...seen.values()]
}

function Form() {
  const navigate = useNavigate()
  const { slug: game, seasons, season: resolved } = usePlatform()

  const [subject, setSubject] = useState('')
  const [link, setLink] = useState('')
  const [on, setOn] = useState<Record<Chip, boolean>>({ everyone: false, season: false, models: false, handles: false })
  const [picked, setPicked] = useState<string | null>(null)
  const [klass, setKlass] = useState('')
  const [modelsText, setModelsText] = useState('')
  const [handlesText, setHandlesText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const seasonSlug = picked ?? resolved?.slug ?? seasons[0]?.slug ?? null
  const season = seasons.find((s) => s.slug === seasonSlug) ?? null
  const classes = season?.weight_classes ?? []
  const ids = modelIds(modelsText)
  const handles = handleList(handlesText)

  // THE AUDIENCE AS SOMA READS IT. A chip adds its key only when its field names somebody, so an
  // open chip with an empty field is not a refusal, just nobody.
  const audience: NotifyAudience = {}
  if (on.everyone) audience.everyone = true
  if (on.season && seasonSlug) {
    audience.game = game
    audience.season = seasonSlug
    if (klass && classes.some((c) => c.class === klass)) audience.class = klass
  }
  if (on.models && ids.length) audience.models = ids
  if (on.handles && handles.length) audience.handles = handles
  const valid =
    Object.keys(audience).length > 0 && ids.length <= MAX_MODELS && handles.length <= MAX_HANDLES
  const key = valid ? JSON.stringify(audience) : ''

  // One count when the chips stop changing, not one per keystroke in the handles field.
  const [asked, setAsked] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setAsked(key), 350)
    return () => clearTimeout(t)
  }, [key])
  const counted = useApi(`notify-count:${asked}`, () => api.notifyCount(JSON.parse(asked) as NotifyAudience), asked !== '')
  // The last number stays on screen, quieted, while the next one is asked for.
  const [shown, setShown] = useState<NotifyCount | null>(null)
  if (counted.data && counted.data !== shown) setShown(counted.data)
  const current = key !== '' && asked === key && counted.state === 'ready' ? counted.data : null

  const toggle = (c: Chip) => setOn((was) => ({ ...was, [c]: !was[c] }))

  const send = async () => {
    setError(null)
    const text = subject.trim()
    if (!text) return setError(T.refusals.empty)
    if (!valid) return
    setBusy(true)
    try {
      await api.sendNotify({ subject: text, link: link.trim() || null, audience })
      navigate('/admin/notify')
    } catch (err) {
      setError(refusal(err))
      setBusy(false)
    }
  }

  return (
    <Shell title={T.tab}>
      <PageHeader
        crumbs={[
          { label: common.admin.crumb, to: '/admin/seasons' },
          { label: T.header.parent, to: '/admin/notify' },
          { label: T.header.crumb },
        ]}
        title={T.header.title}
        badges={<Badge tone="info">{common.admin.badge}</Badge>}
      >
        <AdminTabs current="notify" />
      </PageHeader>

      <div className="wrap page-body">
        <div className="form-page">
          <Panel>
            <PanelBody>
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault()
                  void send()
                }}
              >
                <Field label={F.text} htmlFor="nt-text" hint={fill(F.textHint, { n: subject.length })}>
                  <textarea
                    className="input adb-notify-text"
                    id="nt-text"
                    maxLength={MAX}
                    rows={2}
                    placeholder={F.textPlaceholder}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </Field>

                <Field label={F.link} htmlFor="nt-link" hint={F.linkHint}>
                  <input
                    className="input mono"
                    id="nt-link"
                    type="text"
                    maxLength={500}
                    placeholder={F.linkPlaceholder}
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                  />
                </Field>

                <Field label={F.audience} hint={F.audienceHint}>
                  <div className="adb-notify-chips" role="group" aria-label={F.audienceLabel}>
                    {CHIPS.map((c) => (
                      <button className="adb-notify-chip" type="button" aria-pressed={on[c.key]} onClick={() => toggle(c.key)} key={c.key}>
                        <IconLabel icon={c.icon}>{F.chips[c.key]}</IconLabel>
                      </button>
                    ))}
                  </div>
                </Field>

                {on.season ? (
                  <div className="adb-notify-sub">
                    <div className="form-grid">
                      <Field label={F.season}>
                        <Select
                          label={F.season}
                          value={seasonSlug ?? ''}
                          options={seasons.map((s) => ({ value: s.slug, label: s.name }))}
                          onChange={(v) => {
                            setPicked(v)
                            setKlass('')
                          }}
                        />
                      </Field>
                    </div>
                    {classes.length ? (
                      <Field label={F.class}>
                        <div className="adb-notify-seg">
                          <Segmented
                            label={F.class}
                            value={klass}
                            onChange={setKlass}
                            items={[{ key: '', label: F.anyClass }, ...classes.map((c) => ({ key: c.class, label: c.class }))]}
                          />
                        </div>
                      </Field>
                    ) : null}
                  </div>
                ) : null}

                {on.models ? (
                  <div className="adb-notify-sub">
                    <Field
                      label={F.models}
                      htmlFor="nt-models"
                      hint={
                        ids.length > MAX_MODELS
                          ? fill(F.modelsHint.tooMany, { n: num(ids.length) })
                          : ids.length
                            ? count(F.modelsHint.some, ids.length)
                            : F.modelsHint.none
                      }
                    >
                      <textarea
                        className="input mono"
                        id="nt-models"
                        rows={3}
                        placeholder={F.modelsPlaceholder}
                        value={modelsText}
                        onChange={(e) => setModelsText(e.target.value)}
                      />
                    </Field>
                  </div>
                ) : null}

                {on.handles ? (
                  <div className="adb-notify-sub">
                    <Field
                      label={F.handles}
                      htmlFor="nt-handles"
                      hint={
                        handles.length > MAX_HANDLES
                          ? fill(F.handlesHint.tooMany, { n: num(handles.length) })
                          : handles.length
                            ? count(F.handlesHint.some, handles.length)
                            : F.handlesHint.none
                      }
                    >
                      <input
                        className="input mono"
                        id="nt-handles"
                        type="text"
                        placeholder={F.handlesPlaceholder}
                        value={handlesText}
                        onChange={(e) => setHandlesText(e.target.value)}
                      />
                    </Field>
                  </div>
                ) : null}

                <div className={cx('adb-notify-count', !current && 'stale')} aria-live="polite">
                  {key === '' ? (
                    <span className="hint">{F.count.pick}</span>
                  ) : asked === key && counted.error ? (
                    <span className="form-error">{fill(F.count.failed, { reason: refusal(counted.error) })}</span>
                  ) : shown ? (
                    <>
                      <b>{count(F.count.recipients, shown.recipients, { n: num(shown.recipients) })}</b>
                      <span className="hint">
                        {current
                          ? shown.audience > shown.recipients
                            ? count(F.count.muted, shown.audience - shown.recipients, {
                                n: num(shown.audience - shown.recipients),
                                audience: num(shown.audience),
                              })
                            : F.count.all
                          : F.count.counting}
                      </span>
                    </>
                  ) : (
                    <span className="hint">{F.count.counting}</span>
                  )}
                </div>

                {error ? <Notice tone="bad" title={error} /> : null}

                <div className="stack tight">
                  <div className="row">
                    <button className="btn primary" type="submit" disabled={busy || !subject.trim() || !current || current.recipients === 0}>
                      <IconLabel icon="i-bell">
                        {busy ? F.sending : current ? count(F.send, current.recipients, { n: num(current.recipients) }) : F.sendPlain}
                      </IconLabel>
                    </button>
                    <Link className="btn" to="/admin/notify">
                      {F.cancel}
                    </Link>
                  </div>
                  <span className="hint">
                    <Icon id="i-info" /> {F.sendHint}
                  </span>
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
