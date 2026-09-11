// `/submit` — repository, release tag, and the two SHA-256 hashes.
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
import { ApiError, api, startGitHubSignIn, type Preflight, type Season } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useSelection } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { date, daysUntil, plural } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardBody, CardFoot, CardHead, Field, Icon, Loading, Note, PageHead } from '../components/ui'
import { WeightScale } from '../components/Model'
import { InlineError } from '../components/ErrorStates'

const HASH = /^sha256:[0-9a-f]{64}$/

const CHECKS = [
  'The release exists, is public, and is yours.',
  'Both files are attached to it.',
  'Both hashes match the files, byte for byte.',
  'The adapter is a dialect the referee reads.',
  'Model and adapter, compressed, fit a weight class — that measurement decides which.',
  'These weights have not been entered in this season before.',
]

const NEXT: [string, string][] = [
  ['submitted', 'We fetch the release and check the list above.'],
  ['admitted', 'It is measured, given a class, and queued.'],
  ['trial', 'One match against a baseline. It has to finish below the strike limit; it does not have to win.'],
  ['active', 'It replaces this model\u2019s previous version and starts earning a rating on Open and on its class. Your other models keep playing.'],
]

export default function Submit() {
  const { slug, season, gameName } = usePlatform()
  const { me, session } = useSession()
  const classes = useWeightClasses()
  const navigate = useNavigate()

  // WHICH MODEL THIS RELEASE BELONGS TO. A competitor may hold several, so the release is no
  // longer enough to identify the lineage it joins -- `?model=` picks one, and the preflight is
  // read per model because every quota it reports is per model or per competitor.
  const [search] = useSearchParams()
  const chosen = search.get('model') ?? ''

  const pre = useApi(
    `preflight:${slug}:${me?.id ?? ''}:${chosen}`,
    () => api.submissionPreflight(slug, chosen || null),
    Boolean(me),
  )

  const [repo, setRepo] = useState('')
  const [tag, setTag] = useState('')
  const [weights, setWeights] = useState('')
  const [adapter, setAdapter] = useState('')
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const p = pre.data ?? null
  const refusal = p?.refusal ?? null
  const blocked = !me || Boolean(refusal)
  const left = daysUntil(season?.submissions_close_at)

  const localValid = repo.includes('/') && tag.trim() !== '' && HASH.test(weights.trim()) && HASH.test(adapter.trim())

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (blocked || !localValid) return
    setSending(true)
    setFailure(null)
    try {
      const result = await api.submit({
        game: slug,
        model: chosen || repo.trim(),
        release_tag: tag.trim(),
        weights_hash: weights.trim(),
        adapter_hash: adapter.trim(),
      })
      // Straight to the version page: from here on the interesting thing is what
      // admission does with it, and that page is written to say so.
      navigate(`/${slug}/models/${result.repo}/v${result.version}`)
    } catch (err) {
      const e2 = err instanceof ApiError ? err : new ApiError(0, 'unknown', 'It could not be submitted.')
      setFailure(refusalSaid(e2.code, p) ?? e2.message)
      pre.reload()
    } finally {
      setSending(false)
    }
  }

  const hashField = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
  ) => (
    <Field label={label} htmlFor={id}>
      <input
        className="input mono"
        id={id}
        type="text"
        placeholder="sha256: and 64 hexadecimal characters"
        autoComplete="off"
        value={value}
        disabled={blocked}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )

  return (
    <Shell ctx="read">
      <div className="submit-page">
        <PageHead
          back={
            me ? (
              <Link className="back" to={`/profile/${me.handle}`}>
                ← Your profile
              </Link>
            ) : undefined
          }
          title={<h1>Submit a version</h1>}
          sub={season ? `Into ${gameName} season ${season.number}${me ? `, as @${me.handle}` : ''}. ${submissionWindow(season, left)}` : undefined}
        />

        <section className="wrap sec tight">
          <div className="submit-state">
            {session.state === 'loading' ? null : !me ? (
              <Note tone="info" title="Sign in to submit a version.">
                <p>
                  A version belongs to a GitHub account: the release we fetch has to be one you own. Signing
                  in is the whole account — there is nothing else to fill in.
                </p>
                <p>
                  <button className="btn" type="button" onClick={startGitHubSignIn}>
                    <Icon id="i-github" />
                    Sign in with GitHub
                  </button>
                </p>
              </Note>
            ) : pre.state === 'loading' ? (
              <Loading rows={2} label="Checking whether you may submit" />
            ) : pre.state === 'error' ? (
              <InlineError error={pre.error} what="Whether you may submit" />
            ) : failure ? (
              <Note tone="bad" title="That submission was refused.">
                <p>{failure}</p>
              </Note>
            ) : refusal && p ? (
              <Refusal refusal={refusal} pre={p} />
            ) : null}
          </div>

          <div className="split">
            <div className="stack">
              <form className={blocked ? 'form blocked' : 'form'} onSubmit={submit}>
                <Field
                  label="GitHub repository"
                  htmlFor="f-repo"
                  hint="Public, and owned by the GitHub account you signed in with."
                >
                  <input
                    className="input mono"
                    id="f-repo"
                    type="text"
                    placeholder="you/your-model"
                    autoComplete="off"
                    value={repo}
                    disabled={blocked}
                    onChange={(e) => setRepo(e.target.value)}
                  />
                </Field>

                <Field
                  label="Release tag"
                  htmlFor="f-tag"
                  hint={
                    <>
                      The release must carry both files: <code>model.onnx</code> and <code>adapter.json</code>.
                    </>
                  }
                >
                  <input
                    className="input mono"
                    id="f-tag"
                    type="text"
                    placeholder={p ? `v${p.model?.next_version}` : 'v1'}
                    autoComplete="off"
                    value={tag}
                    disabled={blocked}
                    onChange={(e) => setTag(e.target.value)}
                  />
                </Field>

                <div className="hashes">
                  {hashField('f-mh', 'model.onnx · SHA-256', weights, setWeights)}
                  {hashField('f-ah', 'adapter.json · SHA-256', adapter, setAdapter)}
                  <p className="hint flush">
                    You state the hashes; the platform downloads the release and checks them.{' '}
                    <code>shasum -a 256 model.onnx adapter.json</code> prints both (<code>sha256sum</code> on
                    Linux) — hash the files you attached, after the last edit. See{' '}
                    <a href="/docs/competing/submitting">submitting a version</a>.
                  </p>
                </div>

                <div className="submit-foot">
                  <button className="btn primary lg" type="submit" disabled={blocked || !localValid || sending}>
                    {sending ? 'Submitting…' : p ? `Submit version ${p.model?.next_version}` : 'Submit'}
                  </button>
                  <span className="muted">
                    Submitting replaces nothing yet. Your active version keeps playing until the new one
                    passes its trial.
                  </span>
                </div>
              </form>
            </div>

            <div className="stack">
              <Card>
                <CardHead title="What the platform checks" />
                <CardBody>
                  <ul className="checks plain">
                    {CHECKS.map((c) => (
                      <li key={c}>
                        <Icon id="i-check" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </CardBody>
                <CardFoot>
                  <a href="/docs/models/adapters">The adapter dialect →</a>
                </CardFoot>
              </Card>

              <Card>
                <CardHead title="What happens next" />
                <CardBody>
                  <div className="next">
                    {NEXT.map(([name, said], i) => (
                      <div className="n" key={name}>
                        <span className="dot">{i + 1}</span>
                        <div>
                          <b>{name}</b>
                          <p>{said}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHead title="The weight classes" end="compressed" />
                <CardBody>
                  <WeightScale classes={classes} />
                  <p className="muted after-scale">
                    You do not pick a class. The measured size picks it, and an entry over the largest cap
                    is refused. These are season {season?.number}'s caps; a season can change them.
                  </p>
                </CardBody>
              </Card>
            </div>
          </div>
        </section>
      </div>
    </Shell>
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
      <Note tone="info" title={s ? `Season ${s.number} is not taking submissions.` : 'No season is taking submissions.'}>
        <p>
          {!s
            ? 'This game has no open season. A season is scheduled by an administrator, and submitting starts working on its opening date with no action from you.'
            : s.state === 'scheduled'
              ? `It opens on ${date(s.submissions_open_at)}. Until then there is nothing to enter — the form below is what you will use when it does.`
              : `Submissions closed on ${date(s.submissions_close_at)} and the season is settling: the matches already queued are being played out and the ratings are being counted. The next season opens when an administrator schedules it.`}{' '}
          Your models are still on <Link to={href('/leaderboard')}>their ladders</Link>.
        </p>
      </Note>
    )
  }

  if (refusal === 'not_a_participant') {
    return (
      <Note tone="info" title="Your account is not a participant in this season yet.">
        <p>
          Signing in worked — this season is only open to invited accounts while the platform is in its
          first run. Nothing is wrong with your repository or your model. When the season opens to everyone,
          this page starts working with no action from you.
        </p>
      </Note>
    )
  }

  if (refusal === 'version_in_flight') {
    return (
      <Note tone="warn" title="This model already has a version in flight.">
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
      </Note>
    )
  }

  return (
    <Note tone="bad" title="These weights are already entered in this season.">
      <p>
        A season may count one entry per set of weights, so re-submitting the same file cannot give you a
        second place on the ladder. Train a different model, or change the adapter and rebuild — either
        changes the hash.
      </p>
    </Note>
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
      return 'This season is only open to invited accounts at the moment. Nothing is wrong with your repository or your model.'
    case 'version_in_flight':
      return `This model already has a version in admission${pre?.model?.in_flight ? ` (v${pre.model.in_flight.version})` : ''}. One version of a model goes through at a time; your other models are unaffected.`
    case 'weights_already_entered':
      return 'Those weights are already entered in this season. A season counts one entry per set of weights.'
    case 'unknown_model':
      return 'No model of yours is published from that repository. Make one on the Models page first — a repository with no model behind it is never adopted silently, or a typo would quietly start a second lineage.'
    case 'model_retired':
      return 'That model is retired and takes no new releases. Revive it on the Models page, or submit to another one.'
    case 'too_many_in_flight':
      return 'You are at this season’s limit for how many of your versions may be in admission at once. Wait for one to reach a verdict.'
    case 'too_many_versions':
      return 'You have entered as many versions as this season allows. That limit is per season, so the next one starts you fresh.'
    case 'cooling_down':
      return 'This model submitted very recently. This season asks for a gap between releases; try again shortly.'
    case 'hashes_required':
      return 'Both hashes are required, each as sha256: followed by 64 hexadecimal characters. Run `shasum -a 256 model.onnx adapter.json` (`sha256sum` on Linux) on the files you attached to the release.'
    default:
      return null
  }
}
