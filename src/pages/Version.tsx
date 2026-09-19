// A version: its rating on each ladder, its size against its cap, where it is in its life, its
// matches, and the hashes admission checked. Addressed as /models/:modelId/v:n, or by the uuid
// every API response carries as /versions/:id.

import { Link, useParams } from 'react-router-dom'
import { ApiError, api, type VersionDetail } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { usePlatform } from '../providers/platform-context'
import { bytes, cap, dateTime, duration, micros, num, rating as fmtRating } from '../lib/format'
import { modelPath, versionPath } from '../lib/paths'
import { versionSteps } from '../lib/steps'
import { Shell } from '../components/Shell'
import { Badge, IconLabel, KeyValueList, Notice, PageHeader, Panel, PanelBody, PanelFoot, PanelHead, StatGrid, StepTracker, type Stat } from '../components/ui'
import { CapMeter, ClassBadge, ProvisionalMark, VersionBadge } from '../components/Model'
import { MatchList } from '../components/MatchRow'
import { Permalink } from '../components/Permalink'

export default function Version() {
  const { id, modelId, version: segment = '' } = useParams<{ id?: string; modelId?: string; version?: string }>()
  // A param has to be a whole segment, so the `v` is read off here.
  const number = /^v([1-9]\d*)$/.exec(segment)?.[1] ?? null
  const byId = useApi(`version:${id ?? ''}`, () => api.version(id ?? ''), Boolean(id))
  const byPath = useApi(
    `version-path:${modelId ?? ''}/${segment}`,
    async () => {
      if (number === null) throw new ApiError(404, 'unknown_version', 'not a version segment')
      const m = await api.model(modelId ?? '')
      const v = m?.versions.find((x) => String(x.version) === number)
      if (!v) throw new ApiError(404, 'unknown_version', 'no such version of this model')
      return await api.version(v.version_id)
    },
    !id,
  )
  return (
    <Permalink result={id ? byId : byPath} kind="version" label="Loading the version">
      {(m) => <VersionPage m={m} />}
    </Permalink>
  )
}

const PHASE_SAY: Record<string, string> = {
  active: 'It passed its trial and is the version that plays for this model.',
  superseded: 'It passed its trial, played, and has since been replaced by a newer version.',
  verified: 'Admitted and measured. The trial is the last step before it replaces the playing version.',
  testing: 'Submitted. Admission is fetching the files and measuring them.',
  rejected: 'It was refused at admission, so it never reached a trial and never played.',
}

function VersionPage({ m }: { m: VersionDetail }) {
  const { me } = useSession()
  const { gameName, seasonName } = usePlatform()
  const history = useApi(`version-mx:${m.id}`, () => api.matches({ version: m.id, limit: 6 }))
  const siblings = useApi(`version-sib:${m.model_id}`, () => api.model(m.model_id))
  const numbers = (siblings.data?.versions ?? []).map((v) => v.version).sort((a, b) => a - b)
  const prev = [...numbers].reverse().find((n) => n < m.version)
  const next = numbers.find((n) => n > m.version)
  const unplayed = m.status === 'rejected' || m.status === 'testing' || m.status === 'verified'

  return (
    <Shell title={`${m.model} v${m.version}`} season={m.season}>
      <PageHeader
        crumbs={[
          m.baseline ? { label: 'Baselines', to: `/profile/${m.owner}` } : { label: `@${m.owner}`, to: `/profile/${m.owner}` },
          { label: m.model, to: modelPath(m.model_id) },
          { label: `v${m.version}` },
        ]}
        title={
          <>
            {m.model} <span className="v">v{m.version}</span>
          </>
        }
        badges={
          <>
            <ClassBadge k={m.class} />
            <VersionBadge status={m.status} />
            {m.baseline ? <Badge tone="info">Baseline</Badge> : null}
          </>
        }
        actions={
          <div className="seg" role="group" aria-label="Other versions of this model">
            {prev !== undefined ? <Link to={versionPath(m.model_id, prev)}>← v{prev}</Link> : null}
            {next !== undefined ? <Link to={versionPath(m.model_id, next)}>v{next} →</Link> : null}
          </div>
        }
        sub={`Version ${m.version} of @${m.owner}’s ${m.model}, entered in ${gameName} ${seasonName(m.season)}.${
          m.baseline ? ' A platform baseline: it plays and is rated like any entry, and new versions’ trials are played against it.' : ''
        }`}
      />
      <div className="wrap page-body stack">
        <StateNotice m={m} />
        <StatGrid boxed items={headline(m)} />
        <div className="split">
          <div className="stack">
            <Panel>
              <PanelHead icon="i-matches" title="Matches" end={m.ratings.open ? `${num(m.ratings.open.matches)} played` : undefined} />
              <MatchList
                state={history.state}
                matches={history.data?.matches ?? []}
                you={me?.handle}
                empty={unplayed ? 'It has not played. A version starts playing once it passes its trial.' : 'It has not played yet.'}
              />
              <PanelFoot>
                <Link to={`/matches?version=${m.id}&season=${m.season}`}>
                  <IconLabel icon="i-matches">All matches of v{m.version} →</IconLabel>
                </Link>
              </PanelFoot>
            </Panel>
            <Panel>
              <PanelHead title="Record" end={seasonName(m.season)} />
              <PanelBody>
                <KeyValueList
                  items={[
                    { key: 'Owner', value: <Link to={`/profile/${m.owner}`}>@{m.owner}</Link> },
                    { key: m.baseline ? 'In play since' : 'Submitted', value: dateTime(m.created_at) },
                    ...(m.last_played_at ? [{ key: 'Last played', value: dateTime(m.last_played_at) }] : []),
                    ...(m.successor ? [{ key: 'Replaced by', value: <Link to={versionPath(m.model_id, m.successor)}>v{m.successor}</Link> }] : []),
                  ]}
                />
                <details style={{ marginTop: 14 }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>Provenance: the hashes admission checked</summary>
                  <div style={{ marginTop: 12 }}>
                    <KeyValueList
                      items={[
                        { key: 'Model hash', value: <span className="hash">{m.weights_hash ?? '—'}</span> },
                        { key: 'Manifest hash', value: <span className="hash">{m.manifest_hash ?? '—'}</span> },
                        {
                          key: 'Artifact',
                          value: <span className="hash">models/{m.id}/model.onnx</span>,
                          hint: 'the key generated from the version id — it cannot be retagged or deleted, which is what makes the hash mean something later',
                        },
                        ...(m.orion_version ? [{ key: 'Runtime', value: `Orion ${m.orion_version}` }] : []),
                      ]}
                    />
                  </div>
                </details>
              </PanelBody>
            </Panel>
          </div>
          <div className="stack">
            {m.baseline ? null : (
              <Panel>
                <PanelHead title="Lifecycle" />
                <PanelBody>
                  <StepTracker steps={versionSteps(m.status)} say={PHASE_SAY[m.status]} />
                </PanelBody>
              </Panel>
            )}
            <Panel>
              <PanelHead title="Size against its cap" />
              <PanelBody>
                <CapMeter size={m.size_bytes} limit={m.class_max_bytes} k={m.class} />
              </PanelBody>
            </Panel>
          </div>
        </div>
      </div>
    </Shell>
  )
}

function headline(m: VersionDetail): Stat[] {
  const ladder = (key: string | null, label: string): Stat => {
    const r = key ? m.ratings[key] : undefined
    if (!r) return { label, value: <small>{m.status === 'rejected' ? 'never played' : 'not rated'}</small> }
    return {
      label,
      value: (
        <>
          {fmtRating(r.rating)}
          {r.provisional ? <ProvisionalMark /> : null} <small>#{r.rank} of {r.field}</small>
        </>
      ),
    }
  }
  return [
    ladder('open', 'Open rating'),
    ladder(m.class, m.class ? `${m.class} rating` : 'class rating'),
    {
      label: 'measured size',
      value: m.size_bytes === null ? <small>not yet</small> : <>{bytes(m.size_bytes)} {m.class_max_bytes ? <small>of {cap(m.class_max_bytes)}</small> : null}</>,
    },
    { label: 'parameters', value: num(m.param_count) },
    { label: 'inference', value: <small>{micros(m.infer_us)}</small> },
  ]
}

function StateNotice({ m }: { m: VersionDetail }) {
  if (m.status === 'verified') {
    const waited = m.trial?.waiting_s
    return (
      <Notice tone="warn" title="Waiting for its trial.">
        <p>
          Admitted {dateTime(m.created_at)}
          {m.trial ? ` and queued against a baseline on ${m.trial.map}` : ''}.
          {waited === null || waited === undefined ? '' : ` It has waited ${duration(waited)}.`} It replaces the playing version only if the
          trial completes below the strike limit — it does not have to win.
        </p>
      </Notice>
    )
  }
  if (m.status === 'rejected') {
    return (
      <Notice tone="bad" title="Rejected at admission.">
        <p>{m.reject_reason ?? 'Admission refused it and did not record a reason. That is a fault on our side, not a fact about your model.'}</p>
      </Notice>
    )
  }
  if (m.status === 'testing') {
    return (
      <Notice tone="warn" title="In admission.">
        <p>
          We are fetching the files, checking them against the hashes you declared, and measuring the model and manifest into a weight class.
          {m.admit_attempt && m.admit_attempt > 1 ? ` This is attempt ${m.admit_attempt}.` : ''}
        </p>
      </Notice>
    )
  }
  if (m.status === 'superseded' && m.successor) {
    return (
      <Notice tone="info" title={`Replaced by v${m.successor}.`}>
        <p>It played and has been replaced. Its rating is where it finished.</p>
      </Notice>
    )
  }
  return null
}
