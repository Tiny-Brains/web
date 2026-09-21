// The home page: the selected season at a glance, and the two ways on from it — watching and
// competing. One layout for everyone. A signed-in competitor gets a one-line strip with their best
// model; everything personal beyond that is on /me. A closed season uses the same template: the
// header says it is final, and the class champions appear.
//
// Game and season are a selection, not a route: the season picked in the header's switcher is the
// season this page is about.

import { Link } from 'react-router-dom'
import { api, type Match } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useSelection, useQueryState } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { useLadderHeads } from '../lib/useLadderHeads'
import { cap, date, daysUntil, num, rating as fmtRating } from '../lib/format'
import { byPlace } from '../lib/match'
import { versionPath } from '../lib/paths'
import { Shell } from '../components/Shell'
import { DataTable, Icon, IconLabel, KeyValueList, Panel, PanelBody, PanelFoot, PanelHead, Rich, Section, Skel, StatGrid } from '../components/ui'
import { ClassBadge, ClassScale, SeasonBadge } from '../components/Model'
import { ladderColumns, ladderEmpty } from '../components/LadderTable'
import { LadderTabs } from '../components/LadderTabs'
import { MatchList } from '../components/MatchRow'
import { Replay } from '../components/Replay'
import { SizeRatingPlot } from '../components/SizeRatingPlot'
import { Champions } from '../components/Champions'
import { count, fill } from '../lib/copy'
import T from '../../copy/home.json'

const LADDER_ROWS = 5
const FIELD_ROWS = 50
const REPLAY_HEIGHT = 400

export default function Home() {
  const { game, season, live, slug, gameName, gameLoading } = usePlatform()
  const { href, season: wanted } = useSelection()
  const [param, setParam] = useQueryState()
  const { me } = useSession()
  const classes = useWeightClasses()
  const ladder = param('ladder') || 'open'

  const field = useApi(`home-field:${slug}:${wanted}`, () => api.leaderboard(slug, { ladder: 'open', season: wanted, limit: FIELD_ROWS }))
  const classBoard = useApi(
    `home-lb:${slug}:${wanted}:${ladder}`,
    () => api.leaderboard(slug, { ladder, season: wanted, limit: LADDER_ROWS }),
    ladder !== 'open',
  )
  const heads = useLadderHeads(slug, wanted, classes, Boolean(season) && !live)
  const recent = useApi(`home-mx:${slug}:${wanted}`, () => api.matches({ game: slug, season: wanted, limit: 4 }))
  const featuredId = recent.data?.matches.find((m) => m.status === 'rated' || m.status === 'finished')?.id ?? null
  const featured = useApi(`home-replay:${featuredId ?? ''}`, () => api.match(featuredId!), Boolean(featuredId))
  const mine = useApi(`home-mine:${slug}:${me?.id ?? ''}`, () => api.myModels(slug), Boolean(me))

  const board =
    ladder === 'open'
      ? field.state === 'ready'
        ? { state: 'ready' as const, rows: field.data.entries.slice(0, LADDER_ROWS), total: field.data.total }
        : { state: field.state, rows: [], total: 0 }
      : classBoard.state === 'ready'
        ? { state: 'ready' as const, rows: classBoard.data.entries, total: classBoard.data.total }
        : { state: classBoard.state, rows: [], total: 0 }

  // The strip: your best active version this season, and anything of yours still in progress.
  const actives = (mine.data ?? []).flatMap((m) =>
    m.versions.filter((v) => v.status === 'active' && (!season || v.season === season.slug)).map((v) => ({ m, v })),
  )
  const best = [...actives].sort((a, b) => (b.v.ratings.open?.rating ?? -1e9) - (a.v.ratings.open?.rating ?? -1e9))[0] ?? null
  const inFlight = me?.candidates.filter((c) => c.game === slug) ?? []
  const about = game?.about ?? null
  const left = daysUntil(season?.submissions_close_at)

  return (
    <Shell scoped>
      {me && live && (best || inFlight.length) ? (
        <div className="wrap">
          <div className="entry-strip">
            {best ? (
              <>
                <span>
                  <Rich
                    text={T.strip.best}
                    vars={{
                      model: (
                        <Link to={versionPath(best.m.id, best.v.version)}>
                          <b>
                            {best.m.name} v{best.v.version}
                          </b>
                        </Link>
                      ),
                    }}
                  />
                </span>
                <ClassBadge k={best.v.class} />
                <span className="num">
                  <Rich
                    text={T.strip.rating}
                    vars={{
                      rating: fmtRating(best.v.ratings.open?.rating),
                      rank: best.v.ratings.open ? (
                        <span className="muted">{fill(T.strip.rank, { rank: best.v.ratings.open.rank, field: best.v.ratings.open.field })}</span>
                      ) : null,
                    }}
                  />
                </span>
              </>
            ) : (
              <span>{T.strip.none}</span>
            )}
            {inFlight.length ? (
              <span className="mark">
                <Icon id="i-clock" />
                {count(T.strip.inProgress, inFlight.length, { model: inFlight[0].model, version: inFlight[0].version })}
              </span>
            ) : null}
            <Link className="push" to="/me">
              {T.strip.models}
            </Link>
          </div>
        </div>
      ) : null}

      <section className="wrap hero">
        <div>
          <p className="eyebrow">
            {season ? (
              <>
                {gameName} · {season.name} <SeasonBadge state={season.state} />
                {live
                  ? left !== null && left >= 0
                    ? count(T.hero.closesDaysLeft, left, { date: date(season.submissions_close_at) })
                    : fill(T.hero.closes, { date: date(season.submissions_close_at) })
                  : null}
              </>
            ) : (
              <Skel w={180} />
            )}
          </p>
          {live || !season ? (
            <>
              <h1 className="display">
                <Rich text={T.hero.title} />
              </h1>
              <p className="lede">{classes.length ? fill(T.hero.lede, { cap: cap(classes[0].max_bytes) }) : T.hero.ledeNoClasses}</p>
              <div className="cta">
                {me ? (
                  <>
                    <Link className="btn primary lg" to={href('/submit')}>
                      {T.hero.submit}
                    </Link>
                    <Link className="btn lg" to="/me">
                      {T.hero.models}
                    </Link>
                  </>
                ) : (
                  <>
                    <Link className="btn primary lg" to="/start">
                      {T.hero.start}
                    </Link>
                    {featuredId ? (
                      <Link className="btn lg" to={`/matches/${featuredId}`}>
                        {T.hero.watch}
                      </Link>
                    ) : null}
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <h1 className="display">
                <Rich text={T.final.title} vars={{ season: season.name }} />
              </h1>
              <p className="lede">
                {fill(T.final.lede, { from: date(season.submissions_open_at), to: date(season.closed_at ?? season.submissions_close_at) })}
              </p>
              <div className="cta">
                <Link className="btn primary lg" to="/">
                  {T.final.live}
                </Link>
                <Link className="btn lg" to={href('/matches')}>
                  {T.final.matches}
                </Link>
              </div>
            </>
          )}
          <StatGrid
            items={
              !season
                ? [
                    { label: T.stats.onLadder, icon: 'i-leaderboard', value: <Skel w={40} /> },
                    { label: T.stats.maps, icon: 'i-map', value: <Skel w={40} /> },
                    { label: T.stats.matches, icon: 'i-matches', value: <Skel w={40} /> },
                  ]
                : live
                  ? [
                      { label: T.stats.onLadder, icon: 'i-leaderboard', value: num(season.active_versions) },
                      // The smallest class is the lede's first sentence; the stat that was here said it twice.
                      { label: T.stats.maps, icon: 'i-map', value: <Link to={href('/maps')}>{num(season.maps.enabled)}</Link> },
                      { label: T.stats.matches, icon: 'i-matches', value: num(season.matches_played) },
                      { label: T.stats.daysToEnter, value: left !== null && left >= 0 ? num(left) : '—' },
                    ]
                  : [
                      { label: T.stats.versionsEntered, value: num(season.entered_versions) },
                      { label: T.stats.matchesPlayed, icon: 'i-matches', value: num(season.matches_played) },
                      { label: T.stats.laddersSettled, icon: 'i-leaderboard', value: classes.length + 1 },
                      { label: T.stats.closed, value: date(season.closed_at) },
                    ]
            }
          />
        </div>
        <div>
          <Replay match={featured.data} height={REPLAY_HEIGHT} autoplay />
          <ReplayCaption match={featured.data} />
        </div>
      </section>

      <div className="wrap">
        {season && !live && classes.length ? (
          <Section title={T.champions.title} sub={T.champions.sub}>
            <Champions classes={classes} heads={heads.byLadder} state={heads.state} hrefFor={(l) => href('/leaderboard', { ladder: l })} />
          </Section>
        ) : null}

        <div className="sec two">
          <Panel>
            <PanelHead icon="i-leaderboard" title={live ? T.ladder.title : T.ladder.titleFinal}>
              <div className="end">
                <LadderTabs classes={classes} value={ladder} onPick={(l) => setParam({ ladder: l === 'open' ? '' : l })} />
              </div>
            </PanelHead>
            <DataTable
              columns={ladderColumns({ you: me?.handle, compact: true })}
              rows={board.rows}
              state={board.state}
              loadingRows={LADDER_ROWS}
              rowKey={(r) => r.version_id}
              rowClass={(r) => (me && r.owner === me.handle ? 'you' : undefined)}
              empty={ladderEmpty(ladder, classes, live)}
            />
            <PanelFoot end={board.state === 'ready' ? fill(T.ladder.shown, { n: Math.min(LADDER_ROWS, board.total), total: num(board.total) }) : null}>
              <Link to={href('/leaderboard', { ladder: ladder === 'open' ? null : ladder })}>
                <IconLabel icon="i-leaderboard">{T.ladder.more}</IconLabel>
              </Link>
            </PanelFoot>
          </Panel>
          <Panel>
            <PanelHead icon="i-matches" title={live ? T.matches.title : T.matches.titleFinal} />
            <MatchList
              state={recent.state}
              matches={recent.data?.matches ?? []}
              narrow
              you={me?.handle}
              empty={T.matches.empty}
            />
            <PanelFoot>
              <Link to={href('/matches')}>
                <IconLabel icon="i-matches">{T.matches.more}</IconLabel>
              </Link>
            </PanelFoot>
          </Panel>
        </div>

        {season || gameLoading ? (
          <Section
            title={T.plot.title}
            sub={T.plot.sub}
            more={{ label: T.plot.more, icon: 'i-leaderboard', to: href('/leaderboard', { view: 'plot' }) }}
          >
            <Panel>
              <PanelBody>
                <SizeRatingPlot entries={field.data?.entries ?? []} classes={classes} you={me?.handle} state={field.state} />
              </PanelBody>
            </Panel>
          </Section>
        ) : null}

        {live || !season ? (
          <Section title={T.classes.title} sub={T.classes.sub}>
            <ClassScale classes={classes} />
          </Section>
        ) : (
          <Section title={fill(T.rules.title, { season: season.name })}>
            <Panel>
              <PanelBody>
                <KeyValueList
                  items={[
                    { key: T.rules.window, value: `${date(season.submissions_open_at)} → ${date(season.closed_at ?? season.submissions_close_at)}` },
                    {
                      key: T.rules.maps,
                      value: (
                        <Link to={href('/maps')}>
                          <IconLabel icon="i-map">{fill(T.rules.boards, { n: num(season.maps.enabled + season.maps.disabled) })}</IconLabel>
                        </Link>
                      ),
                    },
                    { key: T.rules.engine, value: <span className="hash">{season.engine_digest ?? '—'}</span> },
                    { key: T.rules.classes, value: classes.map((c) => `${c.class} ${cap(c.max_bytes)}`).join(' · ') },
                  ]}
                />
              </PanelBody>
            </Panel>
          </Section>
        )}

        {about?.story?.length ? (
          <Section title={about.tagline ?? gameName} sub={about.provenance}>
            <div className="story">
              {about.story.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {about.links?.length ? (
                <div className="row">
                  {about.links.map((l) => (
                    <a className="btn sm" href={l.href} rel="noopener" key={l.href}>
                      {l.label}
                      <Icon id="i-ext" label={T.about.external} />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}
      </div>
    </Shell>
  )
}

function ReplayCaption({ match }: { match: Match | null }) {
  if (!match) {
    return (
      <p className="replay-caption">
        <Skel w={280} />
      </p>
    )
  }
  const placed = byPlace(match.players)
  return (
    <p className="replay-caption">
      {placed.length === 2 ? (
        <>
          <b>{placed[0].model}</b> {placed[0].score ?? '—'} – {placed[1].score ?? '—'} <b>{placed[1].model}</b>
        </>
      ) : (
        <Rich text={T.caption.many} vars={{ n: placed.length, model: placed[0]?.model, score: placed[0]?.score ?? '—' }} />
      )}
      {' · '}
      <Link to={`/matches/${match.id}`}>{T.caption.open}</Link>
    </p>
  )
}
