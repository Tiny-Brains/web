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
import { fill } from '../lib/copy'
import { Shell } from '../components/Shell'
import { Badge, IconLabel, KeyValueList, Notice, PageHeader, Panel, PanelBody, PanelFoot, PanelHead, StatGrid, StepTracker, type Stat } from '../components/ui'
import { CapMeter, ClassBadge, ProvisionalMark, VersionBadge } from '../components/Model'
import { MatchList } from '../components/MatchRow'
import { Permalink } from '../components/Permalink'
import T from '../../copy/version.json'

const N = T.notice
const R = T.record
const L = T.headline

export default function Version() {
  const { id, modelId, version: segment = '' } = useParams<{ id?: string; modelId?: string; version?: string }>()
  // A param has to be a whole segment, so the `v` is read off here.
  const number = /^v([1-9]\d*)$/.exec(segment)?.[1] ?? null
  const byId = useApi(`version:${id ?? ''}`, () => api.version(id ?? ''), Boolean(id))
  const byPath = useApi(
    `version-path:${modelId ?? ''}/${segment}`,
    async () => {
      if (number === null) throw new ApiError(404, 'unknown_version', T.errors.notASegment)
      const m = await api.model(modelId ?? '')
      const v = m?.versions.find((x) => String(x.version) === number)
      if (!v) throw new ApiError(404, 'unknown_version', T.errors.noSuchVersion)
      return await api.version(v.version_id)
    },
    !id,
  )
  return (
    <Permalink result={id ? byId : byPath} kind="version" label={T.loading}>
      {(m) => <VersionPage m={m} />}
    </Permalink>
  )
}

const PHASE_SAY: Record<string, string> = T.lifecycle.phases

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
          m.baseline ? { label: T.crumbBaselines, to: `/profile/${m.owner}` } : { label: `@${m.owner}`, to: `/profile/${m.owner}` },
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
            {m.baseline ? <Badge tone="info">{T.baseline}</Badge> : null}
          </>
        }
        actions={
          <div className="seg" role="group" aria-label={T.otherVersions}>
            {prev !== undefined ? <Link to={versionPath(m.model_id, prev)}>← v{prev}</Link> : null}
            {next !== undefined ? <Link to={versionPath(m.model_id, next)}>v{next} →</Link> : null}
          </div>
        }
        sub={fill(m.baseline ? T.subBaseline : T.sub, { version: m.version, owner: m.owner, model: m.model, game: gameName, season: seasonName(m.season) })}
      />
      <div className="wrap page-body stack">
        <StateNotice m={m} />
        <StatGrid boxed items={headline(m)} />
        <div className="split">
          <div className="stack">
            <Panel>
              <PanelHead icon="i-matches" title={T.matches.title} end={m.ratings.open ? fill(T.matches.played, { n: num(m.ratings.open.matches) }) : undefined} />
              <MatchList
                state={history.state}
                matches={history.data?.matches ?? []}
                you={me?.handle}
                empty={unplayed ? T.matches.emptyUnplayed : T.matches.empty}
              />
              <PanelFoot>
                <Link to={`/matches?version=${m.id}&season=${m.season}`}>
                  <IconLabel icon="i-matches">{fill(T.matches.all, { version: m.version })}</IconLabel>
                </Link>
              </PanelFoot>
            </Panel>
            <Panel>
              <PanelHead title={R.title} end={seasonName(m.season)} />
              <PanelBody>
                <KeyValueList
                  items={[
                    { key: R.owner, value: <Link to={`/profile/${m.owner}`}>@{m.owner}</Link> },
                    { key: m.baseline ? R.inPlaySince : R.submitted, value: dateTime(m.created_at) },
                    ...(m.last_played_at ? [{ key: R.lastPlayed, value: dateTime(m.last_played_at) }] : []),
                    ...(m.successor ? [{ key: R.replacedBy, value: <Link to={versionPath(m.model_id, m.successor)}>v{m.successor}</Link> }] : []),
                  ]}
                />
                <details style={{ marginTop: 14 }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>{R.provenance}</summary>
                  <div style={{ marginTop: 12 }}>
                    <KeyValueList
                      items={[
                        { key: R.modelHash, value: <span className="hash">{m.weights_hash ?? '—'}</span> },
                        { key: R.manifestHash, value: <span className="hash">{m.manifest_hash ?? '—'}</span> },
                        {
                          key: R.artifact,
                          value: <span className="hash">{fill(R.artifactPath, { id: m.id })}</span>,
                          hint: R.artifactHint,
                        },
                        ...(m.orion_version ? [{ key: R.runtime, value: fill(R.runtimeValue, { version: m.orion_version }) }] : []),
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
                <PanelHead title={T.lifecycle.title} />
                <PanelBody>
                  <StepTracker steps={versionSteps(m.status)} say={PHASE_SAY[m.status]} />
                </PanelBody>
              </Panel>
            )}
            <Panel>
              <PanelHead title={T.sizeTitle} />
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
    if (!r) return { label, value: <small>{m.status === 'rejected' ? L.neverPlayed : L.notRated}</small> }
    return {
      label,
      value: (
        <>
          {fmtRating(r.rating)}
          {r.provisional ? <ProvisionalMark /> : null} <small>{fill(L.rankOf, { rank: r.rank, field: r.field })}</small>
        </>
      ),
    }
  }
  return [
    ladder('open', L.open),
    ladder(m.class, m.class ? fill(L.class, { class: m.class }) : L.classNone),
    {
      label: L.size,
      value: m.size_bytes === null ? <small>{L.sizeNotYet}</small> : <>{bytes(m.size_bytes)} {m.class_max_bytes ? <small>{fill(L.ofCap, { cap: cap(m.class_max_bytes) })}</small> : null}</>,
    },
    { label: L.parameters, value: num(m.param_count) },
    { label: L.inference, value: <small>{micros(m.infer_us)}</small> },
  ]
}

function StateNotice({ m }: { m: VersionDetail }) {
  if (m.status === 'verified') {
    const waited = m.trial?.waiting_s
    // Only a queued trial has waited: with no trial, `waited` is undefined too.
    const say = !m.trial ? N.waiting.admitted : waited === null || waited === undefined ? N.waiting.queued : N.waiting.waited
    return (
      <Notice tone="warn" title={N.waiting.title}>
        <p>{fill(say, { date: dateTime(m.created_at), map: m.trial?.map ?? '', waited: duration(waited) })}</p>
      </Notice>
    )
  }
  if (m.status === 'rejected') {
    return (
      <Notice tone="bad" title={N.rejected.title}>
        <p>{m.reject_reason ?? N.rejected.noReason}</p>
      </Notice>
    )
  }
  if (m.status === 'testing') {
    return (
      <Notice tone="warn" title={N.testing.title}>
        <p>{m.admit_attempt && m.admit_attempt > 1 ? fill(N.testing.bodyAttempt, { attempt: m.admit_attempt }) : N.testing.body}</p>
      </Notice>
    )
  }
  if (m.status === 'superseded' && m.successor) {
    return (
      <Notice tone="info" title={fill(N.superseded.title, { version: m.successor })}>
        <p>{N.superseded.body}</p>
      </Notice>
    )
  }
  return null
}
