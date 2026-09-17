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
import { bytes as fmtBytes, date, daysUntil, plural } from '../lib/format'
import { Shell } from '../components/Shell'
import { Field, Icon, KeyValueList, LabelledSelect, Loading, Notice, PageHeader, Panel, PanelBody, PanelFoot, PanelHead } from '../components/ui'
import { ClassScale } from '../components/Model'
import { InlineError } from '../components/ErrorStates'
import { versionPath } from '../lib/paths'
import { UploadFailed, canHashHere, pickFile, putBytes, type Picked } from '../lib/upload'

const CHECKS = [
  'Both hashes match what arrived, byte for byte.',
  'The manifest declares shapes the graph actually has, and its adapters run inside the operation budget.',
  'Model and manifest together fit a weight class — that measurement decides which.',
  'These weights have not been entered in this season before.',
]

const NEXT: [string, string][] = [
  ['uploaded', 'This page hashes both files and PUTs them straight to the object store. Nothing goes through the site.'],
  ['submitted', 'We re-hash what arrived and check the list above.'],
  ['admitted', 'It is measured, given a class, and queued.'],
  ['trial', 'One match against a baseline. It has to finish below the strike limit; it does not have to win.'],
  ['active', 'It replaces this model\u2019s previous version and starts earning a rating on Open and on its class. Your other models keep playing.'],
]

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
          setFailure(`${file.name} is not JSON, so it is not a manifest. Pick manifest.json.`)
          return
        }
        setMani(picked)
      } else {
        setOnnx(picked)
      }
    } catch {
      setFailure(`${file.name} could not be read.`)
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
      setStage('Recording the version…')
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
          setStage('Uploading model.onnx…')
          await putBytes('model.onnx', result.upload.model_onnx, onnx.bytes)
          setStage('Uploading manifest.json…')
          await putBytes('manifest.json', result.upload.manifest_json, mani.bytes)
          setDone({ result, failed: null })
        } catch (up) {
          setDone({ result, failed: up instanceof UploadFailed ? up : new UploadFailed('a file', 0, 'the upload did not complete') })
        }
      } else {
        navigate(versionPath(result.model_id, result.version))
      }
    } catch (err) {
      const e2 = err instanceof ApiError ? err : new ApiError(0, 'unknown', 'It could not be submitted.')
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
          <>
            <span className="hash">{picked.hash}</span> · {fmtBytes(picked.size)}
            {picked.name !== label ? ` · from ${picked.name}` : ''}
          </>
        ) : reading === which ? (
          'Reading and hashing…'
        ) : (
          'Read and hashed here; the file itself is uploaded when you submit.'
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
    <Shell title="Submit a version">
      <div>
        <PageHeader
          crumbs={[{ label: 'Your models', to: '/me' }, { label: 'Submit a version' }]}
          title="Submit a version"
          sub={season ? `Into ${gameName} season ${season.number}${me ? `, as @${me.handle}` : ''}. ${submissionWindow(season, left)}` : undefined}
        />
        <section className="wrap page-body stack">
          <div className="submit-state">
            {session.state === 'loading' ? null : !me ? (
              <Notice tone="info" title="Sign in to submit a version.">
                <p>
                  A version belongs to an account, and GitHub is how the platform knows which one.
                  Signing in is the whole account — there is nothing else to fill in.
                </p>
                <p>
                  <button className="btn" type="button" onClick={startGitHubSignIn}>
                    <Icon id="i-github" />
                    Sign in with GitHub
                  </button>
                </p>
              </Notice>
            ) : pre.state === 'loading' ? (
              <Loading rows={2} label="Checking whether you may submit" />
            ) : pre.state === 'error' ? (
              <InlineError error={pre.error} what="Whether you may submit" />
            ) : failure ? (
              <Notice tone="bad" title="That submission was refused.">
                <p>{failure}</p>
              </Notice>
            ) : refusal && p ? (
              <Refusal refusal={refusal} pre={p} />
            ) : noModel ? (
              <Notice tone="info" title={`You have no model in ${gameName} yet.`}>
                <p>
                  A version belongs to a model, and a model is a name.{' '}
                  <Link to="/me?new=1">Make one on Your models</Link> — it is one field and enters
                  nothing — then come back here to submit its first version.
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
                    label="Model"
                    id="f-model"
                    value={models.some((m) => m.model_id === chosen) ? chosen : ''}
                    options={[
                      { value: '', label: 'Which of your models is this a version of?' },
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
                  {fileField('f-mh', 'model', 'model.onnx', '.onnx,application/octet-stream', onnx)}
                  {fileField('f-jh', 'manifest', 'manifest.json', '.json,application/json', mani)}
                  {canHash ? (
                    <p className="hint">
                      Both files are hashed in your browser and uploaded straight to the object store —
                      nothing is sent through the site, and the platform re-hashes what arrives.
                      {next ? ` This would be v${next}.` : ''}{' '}
                      See <a href="/docs/competing/submitting">submitting a version</a>.
                    </p>
                  ) : (
                    <Notice tone="info" title="This browser cannot hash the files here.">
                      <p>
                        <code>crypto.subtle</code> exists only over https or on localhost, and this page
                        was served over neither. Submit through the API instead —{' '}
                        <a href="/docs/competing/submitting">submitting a version</a> has the two calls.
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
                    {stage ?? (next ? `Submit version ${next}` : 'Submit')}
                  </button>
                  <span className="muted">
                    Submitting replaces nothing yet. Your active version keeps playing until the new one
                    passes its trial.
                  </span>
                </div>
              </form>
              </PanelBody>
              </Panel>
            </div>

            <div className="stack">
              <Panel>
                <PanelHead title="What the platform checks" />
                <PanelBody>
                  <ul className="checks">
                    {CHECKS.map((c) => (
                      <li key={c}>
                        <Icon id="i-check" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </PanelBody>
                <PanelFoot>
                  <a href="/docs/models/adapters">What a manifest declares →</a>
                </PanelFoot>
              </Panel>

              <Panel>
                <PanelHead title="What happens next" />
                <PanelBody>
                  <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 10, fontSize: 14 }}>
                    {NEXT.map(([name, said]) => (
                      <li key={name}>
                        <b>{name}</b> <span className="muted">— {said}</span>
                      </li>
                    ))}
                  </ol>
                </PanelBody>
              </Panel>

              <Panel>
                <PanelHead title="The weight classes" end="model + manifest" />
                <PanelBody>
                  <ClassScale classes={classes} />
                  <p className="hint" style={{ marginTop: 10 }}>
                    You do not pick a class. The measured size picks it — the graph's bytes plus the
                    manifest's — and an entry over the largest cap is refused.
                    {season ? ` These are season ${season.number}'s caps; a season can change them.` : ''}
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
 *  re-mints only while the version is still `testing`, and the admit clock rejects an empty one
 *  within about a minute, after which submitting again spends a version number. */
function Uploaded({ result, failed }: { result: SubmissionResult; failed: UploadFailed | null }) {
  const up = result.upload
  const version = versionPath(result.model_id, result.version)

  if (!failed) {
    return (
      <div className="stack">
        <Notice tone="ok" title={`${result.model} v${result.version} is in. Both files uploaded.`}>
          <p>
            Your browser hashed both files and PUT them straight to the object store — nothing went
            through the site. Admission re-hashes what arrived, measures it into a class and runs the
            probe; the version page carries the verdict, usually within minutes.
          </p>
        </Notice>
        <Panel>
          <PanelHead title="What was entered" end={`v${result.version}`} />
          <PanelBody>
            <KeyValueList
              items={[
                { key: 'model.onnx', value: <span className="hash">{result.weights_hash}</span> },
                { key: 'manifest.json', value: <span className="hash">{result.manifest_hash}</span> },
              ]}
            />
          </PanelBody>
          <PanelFoot>
            <Link className="btn primary" to={version}>
              Watch admission →
            </Link>
          </PanelFoot>
        </Panel>
      </div>
    )
  }

  return (
    <div className="stack">
      <Notice tone="bad" title={`${result.model} v${result.version} is recorded, but ${failed.which} did not upload.`}>
        <p>
          The version exists — {failed.message}. <b>Finish it with the commands below</b>: both URLs
          are one-shot, good for {up?.expires_in ?? '30m'}, and admission starts the moment the second
          file lands. That is the recovery, and it costs nothing.
        </p>
        <p className="hint">
          Submitting again works too, but only for a minute or so: while this version is still
          waiting it answers with fresh URLs for the same version, and once admission has given up on
          it — <code>ARTIFACT_MISSING</code> or <code>MANIFEST_MISSING</code> — the next submission is
          a new version with a new number.
        </p>
      </Notice>

      <Panel>
        <PanelHead title="Finish the upload" end="from the directory holding the two files" />
        <PanelBody>
          <pre className="code-block">
            <span className="c"># the same PUTs the page was making, from a shell</span>
            {'\n'}curl -T model.onnx <span className="c">'</span>
            {up?.model_onnx}
            <span className="c">'</span>
            {'\n'}curl -T manifest.json <span className="c">'</span>
            {up?.manifest_json}
            <span className="c">'</span>
          </pre>
          <p className="hint">
            A <code>PUT</code> with the file as the whole body; no headers and no account needed. Anything
            whose SHA-256 is not what you declared is refused at admission with the hash it measured.
          </p>
        </PanelBody>
        <PanelFoot>
          <Link className="btn primary" to={version}>
            Watch admission →
          </Link>
        </PanelFoot>
      </Panel>
    </div>
  )
}

/** When this season takes submissions, said in the tense that applies now. */
function submissionWindow(season: Season, left: number | null): string {
  if (season.state === 'open' && left !== null && left >= 0)
    return `Submissions close ${date(season.submissions_close_at)}, ${left} ${plural(left, 'day')} from now.`
  if (season.state === 'closed') return 'It is closed.'
  if (season.state === 'scheduled') return `Submissions open ${date(season.submissions_open_at)}.`
  return `Submissions closed ${date(season.submissions_close_at)}.`
}

function Refusal({ refusal, pre }: { refusal: NonNullable<Preflight['refusal']>; pre: Preflight }) {
  const { href } = useSelection()

  if (refusal === 'season_not_open') {
    const s = pre.season
    return (
      <Notice tone="info" title={s ? `Season ${s.number} is not taking submissions.` : 'No season is taking submissions.'}>
        <p>
          {!s
            ? 'This game has no open season. A season is scheduled by an administrator, and submitting starts working on its opening date with no action from you.'
            : s.state === 'scheduled'
              ? `It opens on ${date(s.submissions_open_at)}. Until then there is nothing to enter — the form below is what you will use when it does.`
              : `Submissions closed on ${date(s.submissions_close_at)} and the season is settling: the matches already queued are being played out and the ratings are being counted. The next season opens when an administrator schedules it.`}{' '}
          Your models are still on <Link to={href('/leaderboard')}>their ladders</Link>.
        </p>
      </Notice>
    )
  }

  if (refusal === 'not_a_participant') {
    return (
      <Notice tone="info" title="Your account is not a participant in this season yet.">
        <p>
          Signing in worked — this season is only open to invited accounts while the platform is in its
          first run. Nothing is wrong with your model. When the season opens to everyone,
          this page starts working with no action from you.
        </p>
      </Notice>
    )
  }

  if (refusal === 'version_in_flight') {
    return (
      <Notice tone="warn" title="This model already has a version in flight.">
        <p>
          {pre.model?.in_flight ? (
            <>
              {pre.model.model} v{pre.model.in_flight.version} is{' '}
              {pre.model.in_flight.phase.replace(/_/g, ' ')}, and one version of a model goes
              through admission at a time. Wait for{' '}
              <Link to={`/versions/${pre.model.in_flight.version_id}`}>it to finish</Link> — if it
              is rejected you can submit again immediately. Your other models are unaffected.
            </>
          ) : (
            'One version of a model goes through admission at a time.'
          )}
        </p>
      </Notice>
    )
  }

  return (
    <Notice tone="bad" title="These weights are already entered in this season.">
      <p>
        A season may count one entry per set of weights, so re-submitting the same file cannot give you a
        second place on the ladder. Train a different model, or change the manifest and rebuild — either
        changes the hash.
      </p>
    </Notice>
  )
}

/** POST /v1/submissions refuses with the same reasons the preflight names, which is
 *  what lets a refusal arriving at submit time be worded like one that arrived
 *  before it. */
function refusalSaid(code: string, pre: Preflight | null): string | null {
  switch (code) {
    case 'season_not_open':
      return 'The season stopped taking submissions between loading this page and pressing the button. Nothing was recorded.'
    case 'not_a_participant':
      return 'This season is only open to invited accounts at the moment. Nothing is wrong with your model.'
    case 'version_in_flight':
      return `This model already has a version in admission${pre?.model?.in_flight ? ` (v${pre.model.in_flight.version})` : ''}. One version of a model goes through at a time; your other models are unaffected.`
    case 'weights_already_entered':
      return 'Those weights are already entered in this season. A season counts one entry per set of weights.'
    case 'unknown_model':
      return 'That is not a model of yours. Make one on Your models first — an unknown entry is never adopted silently, or a typo would quietly start a second lineage with its own version numbers.'
    case 'model_retired':
      return 'That model is retired and takes no new versions. Revive it on Your models, or submit to another one.'
    case 'too_many_in_flight':
      return 'You are at this season’s limit for how many of your versions may be in admission at once. Wait for one to reach a verdict.'
    case 'too_many_versions':
      return 'You have entered as many versions as this season allows. That limit is per season, so the next one starts you fresh.'
    case 'cooling_down':
      return 'This model submitted very recently. This season asks for a gap between versions; try again shortly.'
    case 'hashes_required':
      return 'Both hashes are required, each as sha256: followed by 64 hexadecimal characters. Run `shasum -a 256 model.onnx manifest.json` (`sha256sum` on Linux) on the two files you are about to upload.'
    default:
      return null
  }
}
