// `/submit` — repository, release tag, and the two SHA-256 hashes.
//
// The refusals are SENTENCES, NOT CODES. Soma answers the preflight with which
// one applies, and each is worded to name what happened, why, and the one thing
// that would change it. "not_a_participant" is also where the pre-launch invite
// allowlist lands, so it is worded so it does not read as the account's fault.
//
// A REFUSED SUBMISSION STILL SHOWS THE FORM, DISABLED. The page has to be
// readable as an explanation, not only as a door that is shut.

import { Link, useNavigate } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import { ApiError, api, startGitHubSignIn, type Preflight } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform } from '../lib/platform-context'
import { useSelection } from '../lib/selection'
import { useSession } from '../lib/session-context'
import { date, daysUntil, plural } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardBody, CardFoot, CardHead, Field, Loading, Note, PageHead } from '../components/ui'
import { WeightScale } from '../components/model'
import { Icon } from '../components/Icon'
import { InlineError } from '../components/states'

const HASH = /^sha256:[0-9a-f]{64}$/

export default function Submit() {
  const { slug, season, game } = usePlatform()
  const { me, session } = useSession()
  const navigate = useNavigate()

  const pre = useApi(`preflight:${slug}:${me?.id ?? ''}`, () => api.submissionPreflight(slug), Boolean(me))

  const [repo, setRepo] = useState('')
  const [tag, setTag] = useState('')
  const [weights, setWeights] = useState('')
  const [adapter, setAdapter] = useState('')
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<{ code: string; said: string } | null>(null)

  const p = pre.data ?? null
  const refusal = p?.refusal ?? null
  const blocked = !me || Boolean(refusal)
  const classes = season?.weight_classes ?? []
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
        repo: repo.trim(),
        release_tag: tag.trim(),
        weights_hash: weights.trim(),
        adapter_hash: adapter.trim(),
      })
      // Straight to the version page: from here on the interesting thing is what
      // admission does with it, and that page is written to say so.
      navigate(`/models/${result.model_id}`)
    } catch (err) {
      const e2 = err instanceof ApiError ? err : new ApiError(0, 'unknown', 'It could not be submitted.')
      setFailure({ code: e2.code, said: refusalSaid(e2.code, p) ?? e2.message })
      pre.reload()
    } finally {
      setSending(false)
    }
  }

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
          sub={
            season
              ? `Into ${game?.name ?? slug} season ${season.number}${me ? `, as @${me.handle}` : ''}. ${
                  season.state === 'open' && left !== null && left >= 0
                    ? `Submissions close ${date(season.submissions_close_at)}, ${left} ${plural(left, 'day')} from now.`
                    : season.state === 'closed'
                      ? 'It is closed.'
                      : `Submissions ${season.state === 'scheduled' ? `open ${date(season.submissions_open_at)}` : `closed ${date(season.submissions_close_at)}`}.`
                }`
              : undefined
          }
        />

        <section className="wrap sec tight">
          <div style={{ marginBottom: 24 }}>
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
                <p>{failure.said}</p>
              </Note>
            ) : refusal ? (
              <Refusal refusal={refusal} pre={p!} />
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
                    placeholder="you/your-entry"
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
                    placeholder={p ? `v${p.next_version}` : 'v1'}
                    autoComplete="off"
                    value={tag}
                    disabled={blocked}
                    onChange={(e) => setTag(e.target.value)}
                  />
                </Field>

                <div className="hashes">
                  <Field label="model.onnx · SHA-256" htmlFor="f-mh">
                    <input
                      className="input mono"
                      id="f-mh"
                      type="text"
                      placeholder="sha256: and 64 hexadecimal characters"
                      autoComplete="off"
                      value={weights}
                      disabled={blocked}
                      onChange={(e) => setWeights(e.target.value)}
                    />
                  </Field>
                  <Field label="adapter.json · SHA-256" htmlFor="f-ah">
                    <input
                      className="input mono"
                      id="f-ah"
                      type="text"
                      placeholder="sha256: and 64 hexadecimal characters"
                      autoComplete="off"
                      value={adapter}
                      disabled={blocked}
                      onChange={(e) => setAdapter(e.target.value)}
                    />
                  </Field>
                  <p className="hint" style={{ margin: 0 }}>
                    You state the hashes; the platform downloads the release and checks them.{' '}
                    <code>drill hash</code> prints both — see <a href="/docs/drill">testing locally with drill</a>.
                  </p>
                </div>

                <div className="submit-foot">
                  <button className="btn primary lg" type="submit" disabled={blocked || !localValid || sending}>
                    {sending ? 'Submitting…' : p ? `Submit version ${p.next_version}` : 'Submit'}
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
                    {[
                      'The release exists, is public, and is yours.',
                      'Both files are attached to it.',
                      'Both hashes match the files, byte for byte.',
                      'The adapter is a dialect the referee reads.',
                      'Model and adapter, compressed, fit a weight class — that measurement decides which.',
                      'These weights have not been entered in this season before.',
                    ].map((c) => (
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
                    {[
                      ['submitted', 'We fetch the release and check the list above.'],
                      ['admitted', 'It is measured, given a class, and queued.'],
                      [
                        'trial',
                        'One match against a baseline. It has to finish below the strike limit; it does not have to win.',
                      ],
                      ['active', 'It replaces your previous version and starts earning a rating on Open and on its class.'],
                    ].map(([name, said], i) => (
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
                  <p className="muted" style={{ margin: '14px 0 0', fontSize: 13 }}>
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
          Your entry is still on <Link to={href('/leaderboard')}>its ladder</Link>.
        </p>
      </Note>
    )
  }

  if (refusal === 'not_a_participant') {
    return (
      <Note tone="info" title="Your account is not a participant in this season yet.">
        <p>
          Signing in worked — this season is only open to invited accounts while the platform is in its
          first run. Nothing is wrong with your repository or your model. When the season opens to
          everyone, this page starts working with no action from you.
        </p>
      </Note>
    )
  }

  if (refusal === 'version_in_flight') {
    return (
      <Note tone="warn" title="You already have a version in flight.">
        <p>
          {pre.in_flight ? (
            <>
              v{pre.in_flight.version} is {pre.in_flight.phase.replace(/_/g, ' ')}, and one version at a
              time goes through admission. Wait for{' '}
              <Link to={`/models/${pre.in_flight.model_id}`}>it to finish</Link> — if it is rejected you can
              submit again immediately.
            </>
          ) : (
            'One version at a time goes through admission.'
          )}
        </p>
      </Note>
    )
  }

  return (
    <Note tone="bad" title="These weights are already entered in this season.">
      <p>
        A season counts one entry per set of weights, so re-submitting the same file cannot give you a
        second place on the ladder. Train a different model, or change the adapter and rebuild — either
        changes the hash.
      </p>
    </Note>
  )
}

/** POST /v1/submissions refuses with the same four reasons the preflight names,
 *  which is what lets a refusal arriving at submit time be worded like one that
 *  arrived before it. */
function refusalSaid(code: string, pre: Preflight | null): string | null {
  switch (code) {
    case 'season_not_open':
      return 'The season stopped taking submissions between loading this page and pressing the button. Nothing was recorded.'
    case 'not_a_participant':
      return 'This season is only open to invited accounts at the moment. Nothing is wrong with your repository or your model.'
    case 'version_in_flight':
      return `You already have a version in admission${pre?.in_flight ? ` (v${pre.in_flight.version})` : ''}. One goes through at a time.`
    case 'weights_already_entered':
      return 'Those weights are already entered in this season. A season counts one entry per set of weights.'
    case 'hashes_required':
      return 'Both hashes are required, each as sha256: followed by 64 hexadecimal characters. Run `drill hash model.onnx adapter.json` on the files you attached to the release.'
    default:
      return null
  }
}
