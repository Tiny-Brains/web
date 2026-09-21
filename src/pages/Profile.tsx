// A competitor's public record: best ranks, models by season, recent matches. It is the same page
// for everyone, the owner included — editing the display name, sessions and signing out are on
// /me/account, and versions still in admission are on /me.

import { Link, useParams } from 'react-router-dom'
import { api, type Profile, type ProfileGame, type ProfileModel } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { date, num, rating as fmtRating } from '../lib/format'
import { modelPath, versionPath } from '../lib/paths'
import { count, fill } from '../lib/copy'
import { Shell } from '../components/Shell'
import { DataTable, Icon, IconLabel, Loading, Notice, Panel, PanelFoot, PanelHead, Rich, Section, StatGrid, type Column, type Stat } from '../components/ui'
import { ClassBadge, SeasonBadge } from '../components/Model'
import { MatchList } from '../components/MatchRow'
import { Avatar } from '../components/Avatar'
import { FetchFailed } from '../components/ErrorStates'
import T from '../../copy/profile.json'

const C = T.table
const W = T.trophies

export default function ProfilePage() {
  const { username = '' } = useParams()
  const { me } = useSession()
  const profile = useApi(`profile:${username}`, () => api.profile(username))
  const matches = useApi(`profile-mx:${username}`, () => api.matches({ owner: username, limit: 8 }))

  if (profile.state === 'error') {
    return (
      <Shell title={profile.error.status === 404 ? T.tabNotFound : T.tabNotLoaded}>
        <FetchFailed error={profile.error} kind="profile" />
      </Shell>
    )
  }
  if (profile.state === 'loading' || !profile.data) {
    return (
      <Shell title={`@${username}`}>
        <section className="wrap page-head">
          <Loading rows={5} label={T.loading} />
        </section>
      </Shell>
    )
  }

  const p = profile.data
  const mine = me?.handle === p.handle
  const [current, ...earlier] = p.games

  return (
    <Shell title={`@${p.handle}`}>
      <header className="wrap who-head">
        <Avatar handle={p.handle} name={p.display_name} size="lg" alt={`@${p.handle}`} />
        <div>
          <h1>{p.baseline ? T.baselines : (p.display_name ?? `@${p.handle}`)}</h1>
          <p className="muted">
            @{p.handle} · {competingSince(p)}
            {p.baseline ? null : (
              <>
                {' · '}
                <a href={`https://github.com/${p.handle}`} rel="noopener">
                  {T.github}
                  <Icon id="i-ext" label={T.external} />
                </a>
              </>
            )}
          </p>
        </div>
        {mine ? (
          <div className="actions">
            <Link className="btn sm" to="/me/account">
              {T.editProfile}
            </Link>
            <Link className="btn primary sm" to="/me">
              {T.yourModels}
            </Link>
          </div>
        ) : null}
      </header>
      <div className="wrap page-body stack">
        {mine ? (
          <Notice tone="info" title={T.yours.title}>
            <p>
              <Rich text={T.yours.body} />
            </p>
          </Notice>
        ) : null}
        {p.games.length ? (
          <StatGrid boxed items={trophies(p)} />
        ) : (
          <Notice tone="info" title={mine ? T.nothing.titleMine : T.nothing.title}>
            <p>{mine ? <Rich text={T.nothing.bodyMine} /> : T.nothing.body}</p>
          </Notice>
        )}
        {current ? (
          <Section title={fill(T.current, { game: current.game_name, season: current.season_name })}>
            <SeasonModels game={current} />
          </Section>
        ) : null}
        {earlier.map((g) => (
          <details className="panel season-fold" key={`${g.game}-${g.season}`}>
            <summary>
              {g.game_name} · {g.season_name} <SeasonBadge state={g.season_state} />{' '}
              <span className="muted" style={{ fontWeight: 400 }}>
                — {count(T.models, g.models.length)}
              </span>
            </summary>
            <SeasonModels game={g} />
          </details>
        ))}
        <Section icon="i-matches" title={T.matches.title}>
          <Panel>
            <MatchList
              state={matches.state}
              matches={matches.data?.matches ?? []}
              you={me?.handle}
              empty={T.matches.empty}
            />
            <PanelFoot>
              <Link to={`/matches?owner=${p.handle}`}>
                <IconLabel icon="i-matches">{T.matches.all}</IconLabel>
              </Link>
            </PanelFoot>
          </Panel>
        </Section>
      </div>
    </Shell>
  )
}

type Row = { model: ProfileModel; playing: ProfileModel['versions'][number] | null }

function SeasonModels({ game }: { game: ProfileGame }) {
  const rows: Row[] = game.models.map((model) => ({
    model,
    playing: model.versions.find((v) => v.status === 'active') ?? model.versions[0] ?? null,
  }))
  const columns: Column<Row>[] = [
    {
      key: 'model',
      head: C.model,
      cell: (r) => (
        <span className="who">
          <Link className="model" to={modelPath(r.model.model_id)}>
            {r.model.model}
          </Link>
          <small>
            {r.playing ? (
              <Rich
                text={r.playing.status === 'active' ? C.playing : C.last}
                vars={{ version: <Link to={versionPath(r.model.model_id, r.playing.version)}>v{r.playing.version}</Link> }}
              />
            ) : (
              C.noVersion
            )}
            {r.model.retired ? ` · ${C.retired}` : ''}
          </small>
        </span>
      ),
    },
    { key: 'class', head: C.class, wideOnly: true, cell: (r) => <ClassBadge k={r.playing?.class} /> },
    {
      key: 'open',
      head: C.open,
      align: 'right',
      cell: (r) => {
        const o = r.playing?.ratings.open
        return o ? (
          <>
            <span className="lead">{fmtRating(o.rating)}</span> <span className="muted">#{o.rank}</span>
          </>
        ) : (
          <span className="muted">—</span>
        )
      },
    },
    {
      key: 'klass',
      head: C.classRating,
      align: 'right',
      wideOnly: true,
      cell: (r) => {
        const k = r.playing?.class ? r.playing.ratings[r.playing.class] : undefined
        return k ? `${fmtRating(k.rating)} #${k.rank}` : '—'
      },
    },
    { key: 'matches', head: <Icon id="i-matches" label={C.matches} />, align: 'right', wideOnly: true, className: 'muted', cell: (r) => num(r.playing?.ratings.open?.matches ?? 0) },
  ]
  return (
    <Panel>
      <PanelHead title={count(T.models, game.models.length)} end={<SeasonBadge state={game.season_state} />} />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.model.model_id} empty={C.empty} />
    </Panel>
  )
}

function trophies(p: Profile): Stat[] {
  const versions = p.games.flatMap((g) => g.models.flatMap((m) => m.versions.map((v) => ({ m, v }))))
  const open = versions.filter((x) => x.v.ratings.open).sort((a, b) => a.v.ratings.open.rank - b.v.ratings.open.rank)[0]
  const klass = versions
    .filter((x) => x.v.class && x.v.ratings[x.v.class])
    .sort((a, b) => a.v.ratings[a.v.class!].rank - b.v.ratings[b.v.class!].rank)[0]
  const played = versions.reduce((n, x) => n + (x.v.ratings.open?.matches ?? 0), 0)
  return [
    {
      label: W.open,
      value: open ? (
        <>
          #{open.v.ratings.open.rank} <small>{fill(W.openOf, { field: open.v.ratings.open.field, model: open.m.model })}</small>
        </>
      ) : (
        <small>{W.notRated}</small>
      ),
    },
    {
      label: W.class,
      value: klass ? (
        <>
          #{klass.v.ratings[klass.v.class!].rank} <small>{fill(W.classOn, { class: klass.v.class! })}</small>
        </>
      ) : (
        <small>{W.notRated}</small>
      ),
    },
    { label: W.matches, icon: 'i-matches', value: num(played) },
    { label: W.seasons, value: p.games.length },
  ]
}

function competingSince(p: Profile): string {
  return fill(p.games.length ? T.competingSince : T.signedUp, { date: date(p.created_at) })
}
