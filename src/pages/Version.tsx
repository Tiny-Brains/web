// `/models/:id` — the public permalink for one entry.
//
// A permalink already knows its game and its season, so the strip is read-only.
// The page has to read correctly in five states: active, verified (waiting for a
// trial), rejected, superseded, and a platform baseline -- which has no owner and
// no release and is the one that catches a layout assuming both.
//
// STATUS AND PHASE ARE PRINTED AS ONE SENTENCE PER STATE. "active · active"
// teaches nobody anything.
//
// THE CAP IS THE VERSION'S OWN SEASON'S. `class_max_bytes` is what this version
// was measured against, not what the live season would measure it against, and
// the headroom bar must use it: a class result is comparable within its season
// and not across seasons.

import { Link, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { api, type ModelDetail } from '../api'
import { useApi } from '../lib/useApi'
import { bytes, cap, dateTime, duration, flops, num, rating as fmtRating, shortHash } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardBody, CardFoot, CardHead, Empty, KeyValues, Loading, Note, Pill, Steps, type PillTone } from '../components/ui'
import { ClassChip, RankLine } from '../components/model'
import { classVar, kStyle } from '../lib/classes'
import { MatchList } from '../components/MatchRow'
import { FetchFailed, NotFound } from '../components/states'

export default function Version() {
  const { id = '' } = useParams()
  const model = useApi(`model:${id}`, () => api.model(id))

  if (model.state === 'error') {
    return (
      <Shell>
        <FetchFailed error={model.error} kind="model" />
      </Shell>
    )
  }
  if (model.state === 'loading') {
    return (
      <Shell ctx="read">
        <section className="wrap sec tight">
          <Loading rows={6} label="Loading the version" />
        </section>
      </Shell>
    )
  }
  /*
   * SOMA GAP: an unknown id answers 200 with a null body.
   *
   * soma-models-get and soma-matches-get have no `unknown` task, unlike
   * soma-profile-get and soma-games-get which answer 404 with {"error": ...}. So a
   * well-formed id that names nothing is not an error here -- it is a success whose
   * body is null, and reading only the status would leave this page loading for
   * ever. Treated as absence, which is what it is; if those workflows grow a 404
   * the `error` branch above catches it and this stays correct either way.
   */
  if (!model.data) {
    return (
      <Shell>
        <NotFound kind="model" />
      </Shell>
    )
  }
  return <VersionPage m={model.data} />
}

function VersionPage({ m }: { m: ModelDetail }) {
  const owned = !m.baseline && Boolean(m.owner)
  const ratings = Object.entries(m.ratings)
  const rated = ratings.length > 0

  const history = useApi(`model-mx:${m.id}`, () => api.matches({ model: m.id, limit: 8 }))

  const pill: Record<string, { tone: PillTone; word: string }> = {
    active: { tone: 'ok', word: 'Active' },
    verified: { tone: 'wait', word: 'Awaiting trial' },
    testing: { tone: 'wait', word: 'In admission' },
    rejected: { tone: 'bad', word: 'Rejected' },
    superseded: { tone: 'closed', word: 'Superseded' },
  }
  const badge = m.baseline ? { tone: 'closed' as PillTone, word: 'Baseline' } : pill[m.status]

  return (
    <Shell ctx="read">
      <section className="wrap page-head">
        <Link className="back" to="/leaderboard">
          ← Leaderboard
        </Link>
        <div className="page-title">
          <div className="title-id">
            <i className="kbox" style={kStyle(m.class)} />
            <h1>{m.id.slice(0, 8)}</h1>
          </div>
          <ClassChip k={m.class} />
          <Pill tone={badge.tone}>{badge.word}</Pill>
          <div className="end">
            {owned ? (
              <>
                <Link className="btn sm" to={`/profile/${m.owner}`}>
                  @{m.owner}
                </Link>
                {m.repo && m.release_tag ? (
                  <a
                    className="btn sm"
                    href={`https://github.com/${m.repo}/releases/tag/${m.release_tag}`}
                    rel="noopener"
                  >
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
                <KeyValues items={recordRows(m, owned)} />
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
                  {/* A version competes on Open AND on its own class, so there are
                      two numbers rather than one with a filter. Open first. */}
                  {ratings
                    .sort(([a], [b]) => (a === 'open' ? -1 : b === 'open' ? 1 : a.localeCompare(b)))
                    .map(([ladder, r]) => (
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
function StateNote({ m }: { m: ModelDetail }) {
  if (m.status === 'verified') {
    return (
      <div style={{ marginBottom: 20 }}>
        <Note tone="warn" title="Waiting for its trial.">
          <p>
            Admitted {dateTime(m.created_at)}
            {m.trial ? ` and queued against a baseline on ${m.trial.preset}` : ''}.
            {m.trial?.waiting_s !== null && m.trial?.waiting_s !== undefined
              ? ` It has waited ${duration(m.trial.waiting_s)}.`
              : ''}{' '}
            It replaces the active version only if the trial completes below the strike limit — it does not
            have to win.
          </p>
        </Note>
      </div>
    )
  }
  if (m.status === 'rejected') {
    return (
      <div style={{ marginBottom: 20 }}>
        <Note tone="bad" title="Rejected, and here is why.">
          <p>
            {m.reject_reason ??
              'Admission refused it and did not record a reason. That is a fault on our side, not a fact about your entry.'}
          </p>
        </Note>
      </div>
    )
  }
  if (m.status === 'testing') {
    return (
      <div style={{ marginBottom: 20 }}>
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

function recordRows(m: ModelDetail, owned: boolean) {
  const rows: { key: ReactNode; value: ReactNode; hint?: ReactNode }[] = []

  rows.push({
    key: 'Owner',
    value: owned ? (
      <Link className="owner" to={`/profile/${m.owner}`}>
        @{m.owner}
      </Link>
    ) : (
      'a platform baseline'
    ),
  })
  rows.push({
    key: 'Version',
    value: owned ? `v${m.version}` : '—',
    hint: owned ? undefined : 'A baseline is not versioned by anyone; it changes only when the engine does.',
  })
  rows.push({ key: 'Season', value: `${m.game}, season ${m.season}` })

  const say = statusSentence(m, owned)
  rows.push({ key: 'Status', value: say[0], hint: say[1] })

  rows.push({ key: 'Weight class', value: <ClassChip k={m.class} /> })
  rows.push({
    key: 'Measured size',
    value: bytes(m.size_bytes),
    hint: 'model and adapter together, compressed — the number the class is decided on',
  })
  rows.push({ key: 'Parameters', value: num(m.param_count) })
  rows.push({ key: 'FLOPs', value: flops(m.flops_estimate) })
  rows.push({
    key: 'Model hash',
    value: <span className="hash">{m.weights_hash ?? '—'}</span>,
  })
  rows.push({
    key: 'Adapter hash',
    value: <span className="hash">{m.adapter_hash ?? '—'}</span>,
  })
  if (owned && m.repo && m.release_tag) {
    rows.push({
      key: 'GitHub release',
      value: (
        <a href={`https://github.com/${m.repo}/releases/tag/${m.release_tag}`} rel="noopener">
          {m.repo} @ {m.release_tag} ↗
        </a>
      ),
    })
  }
  if (m.evaluator_digest) {
    rows.push({ key: 'Evaluator', value: <span className="mono">{shortHash(m.evaluator_digest)}</span> })
  }
  rows.push({ key: owned ? 'Submitted' : 'In play since', value: dateTime(m.created_at) })
  if (m.last_played_at) rows.push({ key: 'Last played', value: dateTime(m.last_played_at) })

  return rows
}

function statusSentence(m: ModelDetail, owned: boolean): [string, string] {
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
      return ['submitted · being admitted', 'The release is being fetched, checked and measured. It has not been given a class yet.']
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

function Phase({ m }: { m: ModelDetail }) {
  const at = {
    submitted: 'done' as const,
    admitted: m.status === 'testing' ? ('now' as const) : m.status === 'rejected' ? ('bad' as const) : ('done' as const),
    trial:
      m.status === 'verified'
        ? ('now' as const)
        : m.status === 'active' || m.status === 'superseded'
          ? ('done' as const)
          : ('todo' as const),
    active:
      m.status === 'active' ? ('done' as const) : m.status === 'superseded' ? ('done' as const) : ('todo' as const),
  }

  const say: Record<string, string> = {
    active: `It passed its trial and is the version that plays for @${m.owner} this season.`,
    superseded: 'It passed its trial, played, and has since been replaced by a newer version.',
    verified: 'Admitted and measured. The trial is the last gate before it replaces the active version.',
    testing: 'Submitted. Admission is fetching the release and measuring it.',
    rejected: 'It was refused at admission, so it never reached a trial and never played.',
  }

  return (
    <Steps
      steps={[
        { label: 'submitted', tone: at.submitted },
        { label: 'admitted', tone: at.admitted },
        { label: m.status === 'rejected' ? 'rejected' : 'trial', tone: m.status === 'rejected' ? 'bad' : at.trial },
        { label: 'active', tone: at.active },
      ]}
      say={say[m.status]}
    />
  )
}

/** Measured size against the class cap: the headroom is the interesting part,
 *  and the cap is the one this version's own season set. */
function CapBar({ m }: { m: ModelDetail }) {
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
  const pct = Math.min(100, (size / limit) * 100)

  return (
    <div className="capbar">
      <div className="rail">
        <div
          className="fill"
          style={{ width: `${pct}%`, ['--k' as string]: over ? 'var(--danger)' : classVar(m.class) }}
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
