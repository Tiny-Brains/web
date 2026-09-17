// A competitor's public record: best ranks, models by season, recent matches. It is the same page
// for everyone, the owner included — editing the display name, sessions and signing out are on
// /me/account, and versions still in admission are on /me.

import { Link, useParams } from 'react-router-dom'
import { api, type Profile, type ProfileGame, type ProfileModel } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { date, num, plural, rating as fmtRating } from '../lib/format'
import { modelPath, versionPath } from '../lib/paths'
import { Shell } from '../components/Shell'
import { DataTable, Icon, Loading, Notice, Panel, PanelFoot, PanelHead, Section, StatGrid, type Column } from '../components/ui'
import { ClassBadge, SeasonBadge } from '../components/Model'
import { MatchList } from '../components/MatchRow'
import { Avatar } from '../components/Avatar'
import { FetchFailed } from '../components/ErrorStates'

export default function ProfilePage() {
  const { username = '' } = useParams()
  const { me } = useSession()
  const profile = useApi(`profile:${username}`, () => api.profile(username))
  const matches = useApi(`profile-mx:${username}`, () => api.matches({ owner: username, limit: 8 }))

  if (profile.state === 'error') {
    return (
      <Shell title={profile.error.status === 404 ? 'Not found' : 'Could not be loaded'}>
        <FetchFailed error={profile.error} kind="profile" />
      </Shell>
    )
  }
  if (profile.state === 'loading' || !profile.data) {
    return (
      <Shell title={`@${username}`}>
        <section className="wrap page-head">
          <Loading rows={5} label="Loading the profile" />
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
          <h1>{p.baseline ? 'Platform baselines' : (p.display_name ?? `@${p.handle}`)}</h1>
          <p className="muted">
            @{p.handle} · {competingSince(p)}
            {p.baseline ? null : (
              <>
                {' · '}
                <a href={`https://github.com/${p.handle}`} rel="noopener">
                  GitHub
                  <Icon id="i-ext" label="opens another site" />
                </a>
              </>
            )}
          </p>
        </div>
        {mine ? (
          <div className="actions">
            <Link className="btn sm" to="/me/account">
              Edit profile
            </Link>
            <Link className="btn primary sm" to="/me">
              Your models
            </Link>
          </div>
        ) : null}
      </header>
      <div className="wrap page-body stack">
        {mine ? (
          <Notice tone="info" title="This is your public page.">
            <p>
              Everyone sees exactly this. Versions still in admission and rejections are on <Link to="/me">Your models</Link>; your name and
              sessions are on <Link to="/me/account">Account</Link>.
            </p>
          </Notice>
        ) : null}
        {p.games.length ? (
          <StatGrid boxed items={trophies(p)} />
        ) : (
          <Notice tone="info" title={mine ? 'You have not entered anything yet.' : 'Nothing entered yet.'}>
            <p>
              {mine ? (
                <>
                  A profile exists as soon as you sign in. <Link to="/submit">Submit a version</Link> and this page fills up.
                </>
              ) : (
                'This account has signed in but has not put a version on a ladder.'
              )}
            </p>
          </Notice>
        )}
        {current ? (
          <Section title={`Models in ${current.game_name} · Season ${current.season}`}>
            <SeasonModels game={current} />
          </Section>
        ) : null}
        {earlier.map((g) => (
          <details className="panel season-fold" key={`${g.game}-${g.season}`}>
            <summary>
              {g.game_name} · Season {g.season} <SeasonBadge state={g.season_state} />{' '}
              <span className="muted" style={{ fontWeight: 400 }}>
                — {g.models.length} {plural(g.models.length, 'model')}
              </span>
            </summary>
            <SeasonModels game={g} />
          </details>
        ))}
        <Section title="Recent matches">
          <Panel>
            <MatchList
              state={matches.state}
              matches={matches.data?.matches ?? []}
              you={me?.handle}
              empty="No matches yet. A version starts playing as soon as it passes its trial."
            />
            <PanelFoot>
              <Link to={`/matches?owner=${p.handle}`}>All their matches →</Link>
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
      head: 'Model',
      cell: (r) => (
        <span className="who">
          <Link className="model" to={modelPath(r.model.model_id)}>
            {r.model.model}
          </Link>
          <small>
            {r.playing ? (
              <>
                {r.playing.status === 'active' ? 'playing ' : 'last '}
                <Link to={versionPath(r.model.model_id, r.playing.version)}>v{r.playing.version}</Link>
              </>
            ) : (
              'no version'
            )}
            {r.model.retired ? ' · retired' : ''}
          </small>
        </span>
      ),
    },
    { key: 'class', head: 'Class', wideOnly: true, cell: (r) => <ClassBadge k={r.playing?.class} /> },
    {
      key: 'open',
      head: 'Open',
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
      head: 'Class rating',
      align: 'right',
      wideOnly: true,
      cell: (r) => {
        const k = r.playing?.class ? r.playing.ratings[r.playing.class] : undefined
        return k ? `${fmtRating(k.rating)} #${k.rank}` : '—'
      },
    },
    { key: 'matches', head: 'Matches', align: 'right', wideOnly: true, className: 'muted', cell: (r) => num(r.playing?.ratings.open?.matches ?? 0) },
  ]
  return (
    <Panel>
      <PanelHead title={`${game.models.length} ${plural(game.models.length, 'model')}`} end={<SeasonBadge state={game.season_state} />} />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.model.model_id} empty="No version on a ladder in this season." />
    </Panel>
  )
}

function trophies(p: Profile) {
  const versions = p.games.flatMap((g) => g.models.flatMap((m) => m.versions.map((v) => ({ m, v }))))
  const open = versions.filter((x) => x.v.ratings.open).sort((a, b) => a.v.ratings.open.rank - b.v.ratings.open.rank)[0]
  const klass = versions
    .filter((x) => x.v.class && x.v.ratings[x.v.class])
    .sort((a, b) => a.v.ratings[a.v.class!].rank - b.v.ratings[b.v.class!].rank)[0]
  const played = versions.reduce((n, x) => n + (x.v.ratings.open?.matches ?? 0), 0)
  return [
    {
      label: 'best Open rank',
      value: open ? (
        <>
          #{open.v.ratings.open.rank} <small>of {open.v.ratings.open.field} · {open.m.model}</small>
        </>
      ) : (
        <small>not rated</small>
      ),
    },
    {
      label: 'best class rank',
      value: klass ? (
        <>
          #{klass.v.ratings[klass.v.class!].rank} <small>on {klass.v.class}</small>
        </>
      ) : (
        <small>not rated</small>
      ),
    },
    { label: 'matches played', value: num(played) },
    { label: 'seasons entered', value: p.games.length },
  ]
}

function competingSince(p: Profile): string {
  return p.games.length ? `competing since ${date(p.created_at)}` : `signed up ${date(p.created_at)}`
}
