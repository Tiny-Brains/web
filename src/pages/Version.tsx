// One VERSION — the public permalink, reachable two ways.
//
// `/{game}/models/{owner}/{repo}/v{n}` is the readable form and what the site links; `/versions/{id}`
// is the uuid form, which every API response can be turned into without a lookup. Both land here.
//
// A permalink already knows its game and its season, so the strip is read-only.
// The page has to read correctly in five states: active, verified (waiting for a
// trial), rejected, superseded, and a platform baseline — which has no owner and
// no release, and is the one that catches a layout assuming both.
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
import { Card, CardBody, CardFoot, CardHead, Empty, KeyValues, Note, Steps } from '../components/ui'
import { ClassBox, ClassChip, OwnerLink, RankLine, StatusPill } from '../components/Model'
import { classVar } from '../lib/weight-classes'
import { MatchList } from '../components/MatchRow'
import { Permalink } from '../components/Permalink'

export default function Version() {
  const { id, game = '', owner = '', repo = '', version = '' } = useParams()

  // Two routes, one page. By id it is a direct read; by repository and version number it is the
  // model's history filtered to one row, which is the same body the id form returns.
  const byId = useApi(`version:${id ?? ''}`, () => api.version(id ?? ''), Boolean(id))
  const byPath = useApi(
    `version-path:${game}:${owner}/${repo}/v${version}`,
    async () => {
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

function releaseUrl(m: VersionDetail): string | null {
  return m.repo && m.release_tag ? `https://github.com/${m.repo}/releases/tag/${m.release_tag}` : null
}

function VersionPage({ m }: { m: VersionDetail }) {
  const owned = !m.baseline && Boolean(m.owner)
  // A version competes on Open AND on its own class, so there are two numbers
  // rather than one with a filter. Open first.
  const ratings = Object.entries(m.ratings).sort(([a], [b]) =>
    a === 'open' ? -1 : b === 'open' ? 1 : a.localeCompare(b),
  )
  const rated = ratings.length > 0
  const release = releaseUrl(m)

  const history = useApi(`version-mx:${m.id}`, () => api.matches({ version: m.id, limit: 8 }))

  return (
    <Shell ctx="read">
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
          <StatusPill status={m.status} baseline={m.baseline} />
          <div className="end">
            {owned ? (
              <>
                <Link className="btn sm" to={`/profile/${m.owner}`}>
                  @{m.owner}
                </Link>
                {release ? (
                  <a className="btn sm" href={release} rel="noopener">
                    GitHub release ↗
                  </a>
                ) : null}
              </>
            ) : (
              <span className="r-tag">a platform baseline</span>
            )}
          </div>
        </div>
        <p className="page-sub">
          {owned
            ? `Version ${m.version} of @${m.owner}’s ${m.game} entry, in the ${m.class ?? 'unmeasured'} class.`
            : 'A platform baseline. It has no owner and no release: it ships with the engine, plays every season, and exists to give a new version something to be measured against.'}
        </p>
      </section>

      <section className="wrap sec tight">
        <StateNote m={m} />

        <div className="split">
          <div className="stack">
            <Card>
              <CardHead title="The entry" end={`season ${m.season}`} />
              <CardBody>
                <KeyValues items={recordRows(m, owned, release)} />
              </CardBody>
            </Card>

            <Card>
              <CardHead
                title="Its matches"
                end={rated ? `${num(ratings[0][1].matches)} played · newest first` : 'none played'}
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
          </div>

          <div className="stack">
            <Card>
              <CardHead title="Rating" end={rated ? `${num(ratings[0][1].matches)} matches` : 'not rated'} />
              {rated ? (
                <div>
                  {ratings.map(([ladder, r]) => (
                    <div className="rat" key={ladder}>
                      <div className="top">
                        <span className="name">{ladder} ladder</span>
                        <span className="val">{fmtRating(r.rating)}</span>
                      </div>
                      <div className="rank">
                        <RankLine r={r} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>
                  No rating yet. A version is rated once it has played, and this one{' '}
                  {m.status === 'rejected' ? 'never entered the arena.' : 'has not played its trial.'}
                </Empty>
              )}
            </Card>

            {owned ? (
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

function recordRows(m: VersionDetail, owned: boolean, release: string | null): Row[] {
  const [status, statusHint] = statusSentence(m, owned)
  return [
    { key: 'Owner', value: owned ? <OwnerLink handle={m.owner} /> : 'a platform baseline' },
    {
      key: 'Version',
      value: owned ? `v${m.version}` : '—',
      hint: owned ? undefined : 'A baseline is not versioned by anyone; it changes only when the engine does.',
    },
    { key: 'Season', value: `${m.game}, season ${m.season}` },
    { key: 'Status', value: status, hint: statusHint },
    { key: 'Weight class', value: <ClassChip k={m.class} /> },
    {
      key: 'Measured size',
      value: bytes(m.size_bytes),
      hint: 'model and adapter together, compressed — the number the class is decided on',
    },
    { key: 'Parameters', value: num(m.param_count) },
    {
      key: 'Inference',
      value: micros(m.infer_us),
      hint: 'measured at admission on the reference set — how much of the turn your graph leaves itself',
    },
    { key: 'Model hash', value: <span className="hash">{m.weights_hash ?? '—'}</span> },
    { key: 'Adapter hash', value: <span className="hash">{m.adapter_hash ?? '—'}</span> },
    ...(owned && release
      ? [
          {
            key: 'GitHub release',
            value: (
              <a href={release} rel="noopener">
                {m.repo} @ {m.release_tag} ↗
              </a>
            ),
          },
        ]
      : []),
    ...(m.evaluator_digest
      ? [{ key: 'Evaluator', value: <span className="mono">{shortHash(m.evaluator_digest)}</span> }]
      : []),
    { key: owned ? 'Submitted' : 'In play since', value: dateTime(m.created_at) },
    ...(m.last_played_at ? [{ key: 'Last played', value: dateTime(m.last_played_at) }] : []),
  ]
}

/** STATUS AND PHASE ARE ONE SENTENCE PER STATE: "active · active" teaches nobody. */
function statusSentence(m: VersionDetail, owned: boolean): [string, string] {
  if (m.baseline)
    return ['a permanent baseline', 'A baseline is always active. Nothing replaces it, and it plays every season.']
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
