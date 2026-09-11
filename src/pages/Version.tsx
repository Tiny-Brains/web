// One VERSION — the public permalink, reachable two ways.
//
// `/{game}/models/{owner}/{repo}/v{n}` is the readable form and what the site links; `/versions/{id}`
// is the uuid form, which every API response can be turned into without a lookup. Both land here.
//
// A permalink already knows its game and its season, so the strip is read-only.
// The page has to read correctly in five states: active, verified (waiting for a
// trial), rejected, superseded, and a platform baseline — an entry like any other
// plus a tag, but seeded and carried rather than submitted, so it has no admission
// history and names a release that was never published.
//
// ORDERED FOR THE READER, not the record: where it stands and what it cost come first, in one
// row of facts; the hashes and digests admission checked are there, under Provenance, folded.
// They used to lead, and took a third of the page's height.
//
// THE CAP IS THE VERSION'S OWN SEASON'S. `class_max_bytes` is what this version was
// measured against, not what the live season would measure it against.
//
// `successor` is the SAME MODEL'S next version. A competitor's other models are separate
// lineages: nothing that happens to one supersedes anything in another.

import { Link, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ApiError, api, type VersionDetail } from '../api'
import { useApi } from '../lib/useApi'
import { bytes, cap, dateTime, duration, micros, num, rating as fmtRating, shortHash } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardBody, CardFoot, CardHead, type Fact, Facts, KeyValues, Note, Steps } from '../components/ui'
import { BaselineTag, ClassBox, ClassChip, OwnerLink, StatusPill } from '../components/Model'
import { classVar } from '../lib/weight-classes'
import { MatchList } from '../components/MatchRow'
import { Permalink } from '../components/Permalink'

export default function Version() {
  const { id, game = '', owner = '', repo = '', version: segment = '' } = useParams()
  // The route hands over the whole segment, `v3`; anything else names no version.
  const version = /^v([1-9]\d*)$/.exec(segment)?.[1] ?? null

  // Two routes, one page. By id it is a direct read; by repository and version number it is the
  // model's history filtered to one row, which is the same body the id form returns.
  const byId = useApi(`version:${id ?? ''}`, () => api.version(id ?? ''), Boolean(id))
  const byPath = useApi(
    `version-path:${game}:${owner}/${repo}/${segment}`,
    async () => {
      if (version === null) throw new ApiError(404, 'unknown_version', 'not a version segment')
      const m = await api.model(game, owner, repo)
      const v = m.versions.find((x) => String(x.version) === version)
      if (!v) throw new ApiError(404, 'unknown_version', 'no such version of this model')
      return await api.version(v.version_id)
    },
    !id,
  )
  const result = id ? byId : byPath

  return (
    <Permalink result={result} kind="model" label="Loading the version" ctx="read">
      {(m) => <VersionPage m={m} />}
    </Permalink>
  )
}

/** A link only once admission has resolved the release's commit, which is what shows the release
 *  exists: a seeded or carried baseline names a tag that was never published, and a version still
 *  in admission has not been checked yet. Until then the tag is printed, not linked. */
function releaseUrl(m: VersionDetail): string | null {
  return m.repo && m.release_tag && m.commit_sha
    ? `https://github.com/${m.repo}/releases/tag/${m.release_tag}`
    : null
}

/** A baseline's release was never published, but how it was trained is: the baselines repository
 *  keeps each entry under models/<name> with its card, its metrics and the commands that made it,
 *  and that page is the most useful thing a baseline can link to. */
function recipeUrl(m: VersionDetail): string | null {
  return m.baseline && m.repo ? `https://github.com/${m.repo}/tree/main/models/${m.model}` : null
}

function VersionPage({ m }: { m: VersionDetail }) {
  const owned = Boolean(m.owner)
  const release = releaseUrl(m)
  const recipe = recipeUrl(m)

  const history = useApi(`version-mx:${m.id}`, () => api.matches({ version: m.id, limit: 8 }))
  const played = m.ratings.open?.matches ?? 0

  return (
    <Shell ctx="read" title={`${m.model} v${m.version}`}>
      <section className="wrap page-head">
        <Link className="back" to="/leaderboard">
          ← Leaderboard
        </Link>
        <div className="page-title">
          <div className="title-id">
            <ClassBox k={m.class} />
            <h1>
              <Link to={`/${m.game}/models/${m.repo}`}>{m.model}</Link>{' '}
              <span className="muted">v{m.version}</span>
            </h1>
          </div>
          <ClassChip k={m.class} />
          <StatusPill status={m.status} />
          <div className="end">
            {m.baseline ? <BaselineTag /> : null}
            {owned ? (
              <Link className="btn sm" to={`/profile/${m.owner}`}>
                @{m.owner}
              </Link>
            ) : null}
            {recipe ? (
              <a className="btn sm" href={recipe} rel="noopener">
                How it was trained ↗
              </a>
            ) : null}
            {release ? (
              <a className="btn sm" href={release} rel="noopener">
                GitHub release ↗
              </a>
            ) : null}
          </div>
        </div>
        <p className="page-sub">
          {`Version ${m.version} of @${m.owner}’s ${m.game} entry, in the ${m.class ?? 'unmeasured'} class.`}
          {m.baseline
            ? ' A platform baseline: it plays and is rated like any entry, and new versions’ trials are played against it.'
            : null}
        </p>
      </section>

      <section className="wrap sec tight stack">
        <StateNote m={m} />

        <Card className="version-facts">
          <CardBody>
            <Facts cols={5} items={headline(m)} />
          </CardBody>
        </Card>

        <div className="split">
          <div className="stack">
            <Card>
              <CardHead
                title="Its matches"
                end={played > 0 ? `${num(played)} played · newest first` : 'none played'}
              />
              <div className="matches">
                <MatchList
                  state={history.state}
                  matches={history.data?.matches ?? []}
                  empty={
                    m.status === 'rejected'
                      ? 'It never entered the arena, so it has no matches.'
                      : 'It has not played yet.'
                  }
                />
              </div>
              <CardFoot>
                <Link to={`/matches?season=${m.season}`}>Every match in the season →</Link>
              </CardFoot>
            </Card>

            <Card>
              <CardHead title="The entry" end={`season ${m.season}`} />
              <CardBody>
                <KeyValues items={recordRows(m, owned, release, recipe)} />
                {/* Folded: what admission checked, byte for byte. The hashes matter to someone
                    reproducing a match and to nobody reading a standing. */}
                <details className="provenance">
                  <summary>Provenance — the hashes and digests admission checked</summary>
                  <KeyValues items={provenanceRows(m, release)} />
                </details>
              </CardBody>
            </Card>
          </div>

          <div className="stack">
            {/* A seeded or carried baseline was never submitted, admitted or trialled, so these
                steps would claim a history it does not have. */}
            {!m.baseline ? (
              <Card>
                <CardHead title="How it got here" />
                <CardBody>
                  <Phase m={m} />
                </CardBody>
              </Card>
            ) : null}

            <Card>
              <CardHead title="Size against its cap" />
              <CardBody>
                <CapBar m={m} />
              </CardBody>
            </Card>
          </div>
        </div>
      </section>
    </Shell>
  )
}

/** Where it stands and what it cost, in one row: both ratings with their ranks, the measured size
 *  against its cap, the parameter count, the inference time. `prov` is shown, not hidden. */
function headline(m: VersionDetail): Fact[] {
  const ratingCell = (ladder: string | null, label: string): Fact => {
    const r = ladder ? m.ratings[ladder] : undefined
    if (!r) return { label, value: <span className="muted">{m.status === 'rejected' ? 'never played' : 'not rated'}</span> }
    return {
      label,
      value: (
        <>
          {fmtRating(r.rating)}{' '}
          <span className="muted">
            #{r.rank} of {r.field}
            {r.provisional ? ' · prov' : ''}
          </span>
        </>
      ),
    }
  }
  return [
    ratingCell('open', 'Open rating'),
    ratingCell(m.class, m.class ? `${m.class} rating` : 'class rating'),
    {
      label: 'measured size',
      value:
        m.size_bytes === null ? (
          <span className="muted">not yet</span>
        ) : (
          <>
            {bytes(m.size_bytes)}
            {m.class_max_bytes ? <span className="muted"> of {cap(m.class_max_bytes)}</span> : null}
          </>
        ),
    },
    { label: 'parameters', value: num(m.param_count) },
    { label: 'inference', value: micros(m.infer_us) },
  ]
}

/** What the state says, in words rather than a code. */
function StateNote({ m }: { m: VersionDetail }) {
  if (m.status === 'verified') {
    const waited = m.trial?.waiting_s
    return (
      <div className="state-note">
        <Note tone="warn" title="Waiting for its trial.">
          <p>
            Admitted {dateTime(m.created_at)}
            {m.trial ? ` and queued against a baseline on ${m.trial.preset}` : ''}.
            {waited === null || waited === undefined ? '' : ` It has waited ${duration(waited)}.`} It
            replaces the active version only if the trial completes below the strike limit — it does not
            have to win.
          </p>
        </Note>
      </div>
    )
  }
  if (m.status === 'rejected') {
    return (
      <div className="state-note">
        <Note tone="bad" title="Rejected, and here is why.">
          <p>
            {m.reject_reason ??
              'Admission refused it and did not record a reason. That is a fault on our side, not a fact about your model.'}
          </p>
        </Note>
      </div>
    )
  }
  if (m.status === 'testing') {
    return (
      <div className="state-note">
        <Note tone="warn" title="In admission.">
          <p>
            We are fetching the release, checking the hashes against the files, and measuring the model and
            adapter into a weight class.
            {m.admit_attempt && m.admit_attempt > 1 ? ` This is attempt ${m.admit_attempt}.` : ''}
          </p>
        </Note>
      </div>
    )
  }
  return null
}

type Row = { key: ReactNode; value: ReactNode; hint?: ReactNode }

function recordRows(m: VersionDetail, owned: boolean, release: string | null, recipe: string | null): Row[] {
  const [status, statusHint] = statusSentence(m, owned)
  return [
    {
      key: 'Owner',
      value: owned ? <OwnerLink handle={m.owner} /> : '—',
      hint: m.baseline ? 'a platform baseline, seeded and carried into each season rather than submitted' : undefined,
    },
    { key: 'Version', value: `v${m.version}` },
    { key: 'Season', value: `${m.game}, season ${m.season}` },
    { key: 'Status', value: status, hint: statusHint },
    { key: 'Weight class', value: <ClassChip k={m.class} /> },
    // A baseline has no release to link; it has a recipe. Everyone else has a release, linked once
    // admission has resolved its commit and printed until then.
    ...(recipe
      ? [
          {
            key: 'How it was trained',
            value: (
              <a href={recipe} rel="noopener">
                {m.repo}/models/{m.model} ↗
              </a>
            ),
            hint: 'the model card, the measurements, and the commands that made it — the same code that made every baseline',
          },
        ]
      : m.repo && m.release_tag
        ? [
            {
              key: 'GitHub release',
              value: release ? (
                <a href={release} rel="noopener">
                  {m.repo} @ {m.release_tag} ↗
                </a>
              ) : (
                `${m.repo} @ ${m.release_tag}`
              ),
              hint: release ? undefined : 'printed, not linked: no commit has been resolved for this release',
            },
          ]
        : []),
    { key: m.baseline ? 'In play since' : 'Submitted', value: dateTime(m.created_at) },
    ...(m.last_played_at ? [{ key: 'Last played', value: dateTime(m.last_played_at) }] : []),
  ]
}

/** The bytes admission checked. A baseline's release tag is a placeholder — it was seeded from the
 *  repository, not fetched from a release — and is said to be one rather than printed as a tag. */
function provenanceRows(m: VersionDetail, release: string | null): Row[] {
  return [
    { key: 'Model hash', value: <span className="hash">{m.weights_hash ?? '—'}</span> },
    { key: 'Adapter hash', value: <span className="hash">{m.adapter_hash ?? '—'}</span> },
    ...(m.evaluator_digest
      ? [{ key: 'Evaluator', value: <span className="hash">{m.evaluator_digest}</span>, hint: `the adapter dialect it was validated under, ${shortHash(m.evaluator_digest)}` }]
      : []),
    ...(m.baseline
      ? [
          {
            key: 'Release',
            value: 'none — seeded, not fetched',
            hint: `${m.repo} carries the artifacts in its tree; the tag on the record, ${m.release_tag ?? '—'}, is a placeholder`,
          },
        ]
      : m.commit_sha
        ? [{ key: 'Commit', value: <span className="hash">{m.commit_sha}</span>, hint: release ? 'the commit the release was resolved to at admission' : undefined }]
        : []),
  ]
}

/** STATUS AND PHASE ARE ONE SENTENCE PER STATE: "active · active" teaches nobody. */
function statusSentence(m: VersionDetail, owned: boolean): [string, string] {
  switch (m.status) {
    case 'active':
      return [
        'active',
        `It is the version that plays for @${m.owner}, and it keeps playing until a newer one passes its trial.`,
      ]
    case 'verified':
      return [
        'verified · awaiting its trial',
        'Admitted and measured. It is not playing yet, and the previous version is still the one that plays.',
      ]
    case 'testing':
      return [
        'submitted · being admitted',
        'The release is being fetched, checked and measured. It has not been given a class yet.',
      ]
    case 'rejected':
      return ['rejected at admission', 'It never reached a trial and never played, so it has no rating.']
    case 'superseded':
      return [
        'superseded',
        owned && m.successor
          ? `It played, and v${m.successor} replaced it. Its rating is where it finished, ranked against the field playing now.`
          : 'It played and has been replaced. Its rating is where it finished.',
      ]
  }
}

const PHASE_SAY: Record<string, string> = {
  active: 'It passed its trial and is the version that plays this season.',
  superseded: 'It passed its trial, played, and has since been replaced by a newer version.',
  verified: 'Admitted and measured. The trial is the last gate before it replaces the active version.',
  testing: 'Submitted. Admission is fetching the release and measuring it.',
  rejected: 'It was refused at admission, so it never reached a trial and never played.',
}

function Phase({ m }: { m: VersionDetail }) {
  const done = m.status === 'active' || m.status === 'superseded'
  return (
    <Steps
      steps={[
        { label: 'submitted', tone: 'done' },
        {
          label: 'admitted',
          tone: m.status === 'testing' ? 'now' : m.status === 'rejected' ? 'bad' : 'done',
        },
        m.status === 'rejected'
          ? { label: 'rejected', tone: 'bad' }
          : { label: 'trial', tone: m.status === 'verified' ? 'now' : done ? 'done' : 'todo' },
        { label: 'active', tone: done ? 'done' : 'todo' },
      ]}
      say={PHASE_SAY[m.status]}
    />
  )
}

/** Measured size against the class cap: the headroom is the interesting part, and
 *  the cap is the one this version's own season set. */
function CapBar({ m }: { m: VersionDetail }) {
  const size = m.size_bytes
  const limit = m.class_max_bytes

  if (size === null || limit === null) {
    return (
      <div className="capbar">
        <p className="muted">
          {size === null
            ? 'It has not been measured yet — admission does that, and it decides the class.'
            : 'This version has no class cap recorded, so there is nothing to measure it against.'}
        </p>
      </div>
    )
  }

  const over = size > limit
  return (
    <div className="capbar">
      <div className="rail">
        <div
          className="fill"
          style={{
            width: `${Math.min(100, (size / limit) * 100)}%`,
            ['--k' as string]: over ? 'var(--danger)' : classVar(m.class),
          }}
        />
      </div>
      <div className="ends">
        <span>{bytes(size)} measured</span>
        <span>
          {m.class} cap {cap(limit)}
        </span>
      </div>
      <p>
        {over
          ? `Over the cap by ${bytes(size - limit)}, which is why it was refused.`
          : `${bytes(limit - size)} of headroom left in ${m.class}.`}
      </p>
    </div>
  )
}
