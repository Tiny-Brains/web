// `/submit` — which model, and the two files. That is the whole form.
//
// IT TAKES THE FILES, NOT THEIR HASHES. The competitor used to run `shasum` themselves, paste two
// digests, and then `curl` the files to the URLs the answer carried — three manual steps in which
// the commonest failures were hashing the wrong copy and never uploading at all. The page now
// reads each file once, hashes that buffer with `crypto.subtle`, and PUTs that same buffer, so the
// digest and the bytes cannot disagree. The digests are still shown, because they are the contract
// and they are what a rejection would name.
//
// It used to ask for a GitHub repository and a release tag as well. Neither was verified: the tag
// was a string in a unique index and the release could be missing, private or deleted without
// costing a competitor anything at admission. Both are gone, and `version` is a counter the
// platform assigns.
//
// The refusals are SENTENCES, NOT CODES. Soma answers the preflight with which one
// applies, and each is worded to name what happened, why, and the one thing that
// would change it. "not_a_participant" is also where the pre-launch invite
// allowlist lands, so it is worded so it does not read as the account's fault.
//
// A REFUSED SUBMISSION STILL SHOWS THE FORM, DISABLED: the page has to be readable
// as an explanation, not only as a door that is shut.

import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import { ApiError, api, startGitHubSignIn, type Preflight, type Season, type SubmissionResult } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useSelection } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { bytes as fmtBytes, date, daysUntil } from '../lib/format'
import { Shell } from '../components/Shell'
import { Field, Icon, KeyValueList, LabelledSelect, Loading, Notice, PageHeader, Panel, PanelBody, PanelFoot, PanelHead, Rich } from '../components/ui'
import { ClassScale } from '../components/Model'
import { AskForHelp } from '../components/Help'
import { InlineError } from '../components/ErrorStates'
import { versionPath } from '../lib/paths'
import { UploadFailed, canHashHere, pickFile, putBytes, type Picked } from '../lib/upload'
import { count, fill, lookup } from '../lib/copy'
import T from '../../copy/submit.json'
import common from '../../copy/common.json'

export default function Submit() {
  const { slug, season, gameName } = usePlatform()
  const { me, session } = useSession()
  const classes = useWeightClasses()
  const navigate = useNavigate()

  // WHICH MODEL THIS VERSION BELONGS TO, as the entry's id. A competitor may hold several, so
  // `?model=` picks one, and the preflight is read per model because every quota it reports is
  // per model or per competitor.
  const [search, setSearch] = useSearchParams()
  const chosen = search.get('model') ?? ''

  const pre = useApi(
    `preflight:${slug}:${me?.id ?? ''}:${chosen}`,
    () => api.submissionPreflight(slug, chosen || null),
    Boolean(me),
  )

  const [onnx, setOnnx] = useState<Picked | null>(null)
  const [mani, setMani] = useState<Picked | null>(null)
  const [reading, setReading] = useState<'model' | 'manifest' | null>(null)
  const [sending, setSending] = useState(false)
  const [stage, setStage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  // THE SUBMISSION ANSWERS WITH TWO ONE-SHOT UPLOAD URLS AND THE PAGE MUST NOT LEAVE UNTIL BOTH
  // FILES ARE UP. The platform holds no bytes of its own: a version with nothing in the bucket
  // sits in admission until it times out. So a successful submit replaces the form with the
  // outcome rather than navigating away, and a transfer that failed keeps the URLs on screen --
  // the VERSION IS ALREADY RECORDED at that point, and the only thing missing is the bytes.
  const [done, setDone] = useState<{ result: SubmissionResult; failed: UploadFailed | null } | null>(null)

  const p = pre.data ?? null
  const refusal = p?.refusal ?? null
  // A VERSION BELONGS TO A MODEL, and a model is made on /models first. The preflight lists the
  // caller's models; with none there is nothing to submit to, and with several the form asks
  // which. The choice is `?model=` so the preflight is read per model (every quota it reports
  // is per model) and the page is a link somebody can be sent.
  //
  // There is no free-text fallback any more. The entry is addressed by id, and a uuid is not
  // something anyone types -- with no models the answer is the /models page, not a text box.
  const models = p?.models.filter((m) => !m.retired) ?? []
  const noModel = Boolean(p) && models.length === 0
  const target = chosen
  const blocked = !me || Boolean(refusal) || noModel
  const left = daysUntil(season?.submissions_close_at)

  const canHash = canHashHere()
  const localValid = target !== '' && onnx !== null && mani !== null
  const next = p?.model?.next_version ?? null

  /** Read the file once, hash that buffer, and keep both. The manifest is parsed as well -- not to
   *  validate it, which admission does properly, but because picking the wrong file is the mistake
   *  this catches for free and a rejected version is a slot spent. */
  const pick = async (which: 'model' | 'manifest', file: File | null) => {
    if (!file) return
    setReading(which)
    setFailure(null)
    try {
      const picked = await pickFile(file)
      if (which === 'manifest') {
        try {
          JSON.parse(new TextDecoder().decode(picked.bytes))
        } catch {
          setFailure(fill(T.pick.notJson, { name: file.name }))
          return
        }
        setMani(picked)
      } else {
        setOnnx(picked)
      }
    } catch {
      setFailure(fill(T.pick.unreadable, { name: file.name }))
    } finally {
      setReading(null)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (blocked || !localValid || !onnx || !mani) return
    setSending(true)
    setFailure(null)
    try {
      setStage(T.stages.recording)
      const result = await api.submit({
        game: slug,
        model: target,
        weights_hash: onnx.hash,
        manifest_hash: mani.hash,
      })
      // FROM HERE THE VERSION EXISTS. An upload that fails is not a refused submission, so it is
      // carried into the outcome rather than thrown back at the form: the row is written, the URLs
      // are on screen, and retrying is a transfer rather than a resubmission.
      if (result.upload) {
        try {
          setStage(T.stages.uploadingModel)
          await putBytes(T.files.model, result.upload.model_onnx, onnx.bytes)
          setStage(T.stages.uploadingManifest)
          await putBytes(T.files.manifest, result.upload.manifest_json, mani.bytes)
          setDone({ result, failed: null })
        } catch (up) {
          setDone({ result, failed: up instanceof UploadFailed ? up : new UploadFailed(common.upload.aFile, 0, common.upload.incomplete) })
        }
      } else {
        navigate(versionPath(result.model_id, result.version))
      }
    } catch (err) {
      const e2 = err instanceof ApiError ? err : new ApiError(0, 'unknown', T.unknownError)
      setFailure(refusalSaid(e2.code, p) ?? e2.message)
      pre.reload()
    } finally {
      setSending(false)
      setStage(null)
    }
  }

  const fileField = (
    id: string,
    which: 'model' | 'manifest',
    label: string,
    accept: string,
    picked: Picked | null,
  ) => (
    <Field
      label={label}
      htmlFor={id}
      hint={
        picked ? (
          <Rich
            text={picked.name !== label ? T.form.pickedFrom : T.form.picked}
            vars={{ hash: <span className="hash">{picked.hash}</span>, size: fmtBytes(picked.size), name: picked.name }}
          />
        ) : reading === which ? (
          T.form.reading
        ) : (
          T.form.idle
        )
      }
    >
      <input
        className="input"
        id={id}
        type="file"
        accept={accept}
        disabled={blocked || !canHash || sending}
        onChange={(e) => void pick(which, e.target.files?.[0] ?? null)}
      />
    </Field>
  )

  return (
    <Shell title={T.tab}>
      <div>
        <PageHeader
          crumbs={[{ label: T.header.crumbModels, to: '/me' }, { label: T.header.crumb }]}
          title={T.header.title}
          sub={
            season
              ? fill(me ? T.header.subSignedIn : T.header.sub, {
                  game: gameName,
                  season: season.name,
                  handle: me?.handle ?? '',
                  window: submissionWindow(season, left),
                })
              : undefined
          }
        />
        <section className="wrap page-body stack">
          <div className="submit-state">
            {session.state === 'loading' ? null : !me ? (
              <Notice tone="info" title={T.signIn.title}>
                <p>{T.signIn.body}</p>
                <p>
                  <button className="btn" type="button" onClick={startGitHubSignIn}>
                    <Icon id="i-github" />
                    {T.signIn.button}
                  </button>
                </p>
              </Notice>
            ) : pre.state === 'loading' ? (
              <Loading rows={2} label={T.checking} />
            ) : pre.state === 'error' ? (
              <InlineError error={pre.error} what={T.checkingWhat} />
            ) : failure ? (
              <Notice tone="bad" title={T.refused}>
                <p>{failure}</p>
                <AskForHelp />
              </Notice>
            ) : refusal && p ? (
              <Refusal refusal={refusal} pre={p} />
            ) : noModel ? (
              <Notice tone="info" title={fill(T.noModel.title, { game: gameName })}>
                <p>
                  <Rich text={T.noModel.body} />
                </p>
              </Notice>
            ) : null}
          </div>

          {done ? (
            <Uploaded result={done.result} failed={done.failed} />
          ) : (
          <div className="split">
            <div className="stack">
              <Panel>
              <PanelBody>
              <form className={blocked ? 'form blocked' : 'form'} onSubmit={submit}>
                {models.length > 0 ? (
                  <LabelledSelect
                    label={T.form.model}
                    id="f-model"
                    value={models.some((m) => m.model_id === chosen) ? chosen : ''}
                    options={[
                      { value: '', label: T.form.modelPrompt },
                      ...models.map((m) => ({ value: m.model_id, label: m.model })),
                    ]}
                    // MERGED, NOT REPLACED. A bare object replaces the whole query string, so
                    // picking a model on /submit?game=x dropped the game and the season the
                    // selection exists to carry.
                    onChange={(v) => {
                      const params = new URLSearchParams(search)
                      if (v) params.set('model', v)
                      else params.delete('model')
                      setSearch(params)
                    }}
                  />
                ) : null}

                <div className="form">
                  {fileField('f-mh', 'model', T.files.model, '.onnx,application/octet-stream', onnx)}
                  {fileField('f-jh', 'manifest', T.files.manifest, '.json,application/json', mani)}
                  {canHash ? (
                    <p className="hint">
                      <Rich text={next ? T.form.hintNext : T.form.hint} vars={{ next }} />
                    </p>
                  ) : (
                    <Notice tone="info" title={T.form.noHash.title}>
                      <p>
                        <Rich text={T.form.noHash.body} />
                      </p>
                    </Notice>
                  )}
                </div>

                <div className="row">
                  <button
                    className="btn primary lg"
                    type="submit"
                    disabled={blocked || !localValid || sending || reading !== null}
                  >
                    {stage ?? (next ? fill(T.form.submitNext, { next }) : T.form.submit)}
                  </button>
                  <span className="muted">{T.form.reassure}</span>
                </div>
              </form>
              </PanelBody>
              </Panel>
            </div>

            <div className="stack">
              <Panel>
                <PanelHead title={T.checks.title} />
                <PanelBody>
                  <ul className="checks">
                    {T.checks.items.map((c) => (
                      <li key={c}>
                        <Icon id="i-check" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </PanelBody>
                <PanelFoot>
                  <a href="/docs/models/adapters">{T.checks.more}</a>
                </PanelFoot>
              </Panel>

              <Panel>
                <PanelHead title={T.next.title} />
                <PanelBody>
                  <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 10, fontSize: 14 }}>
                    {T.next.items.map(({ name, said }) => (
                      <li key={name}>
                        <b>{name}</b> <span className="muted">— {said}</span>
                      </li>
                    ))}
                  </ol>
                </PanelBody>
              </Panel>

              <Panel>
                <PanelHead title={T.classes.title} end={T.classes.end} />
                <PanelBody>
                  <ClassScale classes={classes} />
                  <p className="hint" style={{ marginTop: 10 }}>
                    {season ? fill(T.classes.hintSeason, { season: season.name }) : T.classes.hint}
                  </p>
                </PanelBody>
              </Panel>
            </div>
          </div>
          )}
        </section>
      </div>
    </Shell>
  )
}

/** THE OUTCOME, AND THE ONE CASE THAT IS NOT A FAILURE. Soma stores no bytes: a submission records
 *  the two hashes and answers with two one-shot PUT URLs signed for the PUBLIC endpoint, and
 *  admission has nothing to fetch until both files are in the bucket. This page now does that
 *  transfer, so the ordinary outcome is "both are up".
 *
 *  When the transfer fails the VERSION STILL EXISTS — the row was written before the first byte
 *  moved — so this must not read like a refusal. The URLs are still good, and `curl` is the way out
 *  of whatever stopped the browser: a blocked request, a proxy, an object store answering no CORS
 *  preflight. Resubmitting is the second-best answer and is deliberately described as such: it
 *  re-mints only inside the version's thirty-minute upload window, for what is left of it, and
 *  once that has passed the admit clock rejects an empty version and submitting again spends a
 *  version number. */
function Uploaded({ result, failed }: { result: SubmissionResult; failed: UploadFailed | null }) {
  const up = result.upload
  const version = versionPath(result.model_id, result.version)

  if (!failed) {
    return (
      <div className="stack">
        <Notice tone="ok" title={fill(T.uploaded.title, { model: result.model, version: result.version })}>
          <p>{T.uploaded.body}</p>
        </Notice>
        <Panel>
          <PanelHead title={T.uploaded.entered} end={`v${result.version}`} />
          <PanelBody>
            <KeyValueList
              items={[
                { key: T.files.model, value: <span className="hash">{result.weights_hash}</span> },
                { key: T.files.manifest, value: <span className="hash">{result.manifest_hash}</span> },
              ]}
            />
          </PanelBody>
          <PanelFoot>
            <Link className="btn primary" to={version}>
              {T.uploaded.watch}
            </Link>
          </PanelFoot>
        </Panel>
      </div>
    )
  }

  return (
    <div className="stack">
      <Notice tone="bad" title={fill(T.uploadFailed.title, { model: result.model, version: result.version, which: failed.which })}>
        <p>
          <Rich
            text={T.uploadFailed.body}
            vars={{ reason: failed.message, expires: up?.expires_in ?? T.uploadFailed.expiresDefault }}
          />
        </p>
        <p className="hint">
          <Rich text={T.uploadFailed.again} />
        </p>
        <AskForHelp />
      </Notice>

      <Panel>
        <PanelHead title={T.uploadFailed.finish} end={T.uploadFailed.finishEnd} />
        <PanelBody>
          <pre className="code-block">
            <span className="c">{T.uploadFailed.comment}</span>
            {'\n'}{T.uploadFailed.putModel} <span className="c">'</span>
            {up?.model_onnx}
            <span className="c">'</span>
            {'\n'}{T.uploadFailed.putManifest} <span className="c">'</span>
            {up?.manifest_json}
            <span className="c">'</span>
          </pre>
          <p className="hint">
            <Rich text={T.uploadFailed.put} />
          </p>
        </PanelBody>
        <PanelFoot>
          <Link className="btn primary" to={version}>
            {T.uploadFailed.watch}
          </Link>
        </PanelFoot>
      </Panel>
    </div>
  )
}

/** When this season takes submissions, said in the tense that applies now. */
function submissionWindow(season: Season, left: number | null): string {
  if (season.state === 'open' && left !== null && left >= 0)
    return count(T.window.open, left, { date: date(season.submissions_close_at) })
  if (season.state === 'closed') return T.window.closed
  if (season.state === 'scheduled') return fill(T.window.scheduled, { date: date(season.submissions_open_at) })
  return fill(T.window.past, { date: date(season.submissions_close_at) })
}

function Refusal({ refusal, pre }: { refusal: NonNullable<Preflight['refusal']>; pre: Preflight }) {
  const { href } = useSelection()

  if (refusal === 'season_not_open') {
    const s = pre.season
    const R = T.refusal.seasonNotOpen
    return (
      <Notice tone="info" title={s ? fill(R.title, { season: s.name }) : R.titleNone}>
        <p>
          <Rich
            text={!s ? R.bodyNone : s.state === 'scheduled' ? R.bodyScheduled : R.bodySettling}
            vars={{
              date: s ? date(s.state === 'scheduled' ? s.submissions_open_at : s.submissions_close_at) : '',
              ladders: href('/leaderboard'),
            }}
          />
        </p>
      </Notice>
    )
  }

  if (refusal === 'not_a_participant') {
    return (
      <Notice tone="info" title={T.refusal.notAParticipant.title}>
        <p>{T.refusal.notAParticipant.body}</p>
        <AskForHelp />
      </Notice>
    )
  }

  if (refusal === 'version_in_flight') {
    return (
      <Notice tone="warn" title={T.refusal.versionInFlight.title}>
        <p>
          {pre.model?.in_flight ? (
            <Rich
              text={T.refusal.versionInFlight.body}
              vars={{
                model: pre.model.model,
                version: pre.model.in_flight.version,
                phase: pre.model.in_flight.phase.replace(/_/g, ' '),
                path: `/versions/${pre.model.in_flight.version_id}`,
              }}
            />
          ) : (
            T.refusal.versionInFlight.bodyUnknown
          )}
        </p>
      </Notice>
    )
  }

  return (
    <Notice tone="bad" title={T.refusal.weightsEntered.title}>
      <p>{T.refusal.weightsEntered.body}</p>
      <AskForHelp />
    </Notice>
  )
}

/** POST /v1/submissions refuses with the same reasons the preflight names, which is
 *  what lets a refusal arriving at submit time be worded like one that arrived
 *  before it. */
function refusalSaid(code: string, pre: Preflight | null): string | null {
  const said = lookup(T.refusals, code) ?? null
  // The in-flight version is the one insertion a refusal carries: ` (v3)`, or nothing.
  return said === null ? null : fill(said, { inFlight: pre?.model?.in_flight ? ` (v${pre.model.in_flight.version})` : '' })
}
