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
import { DataTable, Icon, IconLabel, KeyValueList, Panel, PanelBody, PanelFoot, PanelHead, Section, Skel, StatGrid } from '../components/ui'
import { ClassBadge, ClassScale, SeasonBadge } from '../components/Model'
import { ladderColumns, ladderEmpty } from '../components/LadderTable'
import { LadderTabs } from '../components/LadderTabs'
import { MatchList } from '../components/MatchRow'
import { Replay } from '../components/Replay'
import { SizeRatingPlot } from '../components/SizeRatingPlot'
import { Champions } from '../components/Champions'

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
                  Your best:{' '}
                  <Link to={versionPath(best.m.id, best.v.version)}>
                    <b>
                      {best.m.name} v{best.v.version}
                    </b>
                  </Link>
                </span>
                <ClassBadge k={best.v.class} />
                <span className="num">
                  Open <b>{fmtRating(best.v.ratings.open?.rating)}</b>{' '}
                  {best.v.ratings.open ? <span className="muted">#{best.v.ratings.open.rank} of {best.v.ratings.open.field}</span> : null}
                </span>
              </>
            ) : (
              <span>Nothing of yours is on the ladder yet.</span>
            )}
            {inFlight.length ? (
              <span className="mark">
                <Icon id="i-clock" />
                {inFlight.length === 1 ? `${inFlight[0].model} v${inFlight[0].version} in progress` : `${inFlight.length} versions in progress`}
              </span>
            ) : null}
            <Link className="push" to="/me">
              Your models →
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
                {live ? `closes ${date(season.submissions_close_at)}${left !== null && left >= 0 ? ` · ${left} days left` : ''}` : null}
              </>
            ) : (
              <Skel w={180} />
            )}
          </p>
          {live || !season ? (
            <>
              <h1 className="display">
                Build the <i>smallest</i> brain that plays well.
              </h1>
              <p className="lede">
                Train a neural network, describe it in a manifest, and submit both.{' '}
                {classes.length ? `${cap(classes[0].max_bytes)} is a whole weight class` : 'The smallest cap is a whole weight class'}, so the
                question is not how big a model you can train but how little it takes.
              </p>
              <div className="cta">
                {me ? (
                  <>
                    <Link className="btn primary lg" to={href('/submit')}>
                      Submit a version
                    </Link>
                    <Link className="btn lg" to="/me">
                      Your models
                    </Link>
                  </>
                ) : (
                  <>
                    <Link className="btn primary lg" to="/start">
                      Get started
                    </Link>
                    {featuredId ? (
                      <Link className="btn lg" to={`/matches/${featuredId}`}>
                        Watch a match
                      </Link>
                    ) : null}
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <h1 className="display">
                {season.name} is <i>final</i>.
              </h1>
              <p className="lede">
                It ran from {date(season.submissions_open_at)} to {date(season.closed_at ?? season.submissions_close_at)}. The standings are
                settled and will not move again.
              </p>
              <div className="cta">
                <Link className="btn primary lg" to="/">
                  Go to the live season
                </Link>
                <Link className="btn lg" to={href('/matches')}>
                  Every match it played
                </Link>
              </div>
            </>
          )}
          <StatGrid
            items={
              !season
                ? [
                    { label: 'on the ladder', icon: 'i-leaderboard', value: <Skel w={40} /> },
                    { label: 'maps', icon: 'i-map', value: <Skel w={40} /> },
                    { label: 'matches', icon: 'i-matches', value: <Skel w={40} /> },
                  ]
                : live
                  ? [
                      { label: 'on the ladder', icon: 'i-leaderboard', value: num(season.active_versions) },
                      // The smallest class is the lede's first sentence; the stat that was here said it twice.
                      { label: 'maps', icon: 'i-map', value: <Link to={href('/maps')}>{num(season.maps.enabled)}</Link> },
                      { label: 'matches', icon: 'i-matches', value: num(season.matches_played) },
                      { label: 'days to enter', value: left !== null && left >= 0 ? num(left) : '—' },
                    ]
                  : [
                      { label: 'versions entered', value: num(season.entered_versions) },
                      { label: 'matches played', icon: 'i-matches', value: num(season.matches_played) },
                      { label: 'ladders settled', icon: 'i-leaderboard', value: classes.length + 1 },
                      { label: 'closed', value: date(season.closed_at) },
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
          <Section title="Class champions" sub="the top of each class ladder when the season closed">
            <Champions classes={classes} heads={heads.byLadder} state={heads.state} hrefFor={(l) => href('/leaderboard', { ladder: l })} />
          </Section>
        ) : null}

        <div className="sec two">
          <Panel>
            <PanelHead icon="i-leaderboard" title={live ? 'Leaderboard' : 'Final standings'}>
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
            <PanelFoot end={board.state === 'ready' ? `top ${Math.min(LADDER_ROWS, board.total)} of ${num(board.total)}` : null}>
              <Link to={href('/leaderboard', { ladder: ladder === 'open' ? null : ladder })}>
                <IconLabel icon="i-leaderboard">Full leaderboard →</IconLabel>
              </Link>
            </PanelFoot>
          </Panel>
          <Panel>
            <PanelHead icon="i-matches" title={live ? 'Recent matches' : 'Its last matches'} />
            <MatchList
              state={recent.state}
              matches={recent.data?.matches ?? []}
              narrow
              you={me?.handle}
              empty="No match has been played in this season yet."
            />
            <PanelFoot>
              <Link to={href('/matches')}>
                <IconLabel icon="i-matches">All matches →</IconLabel>
              </Link>
            </PanelFoot>
          </Panel>
        </div>

        {season || gameLoading ? (
          <Section
            title="Strongest play per byte"
            sub="every active version on Open · size across on a log scale, rating up"
            more={{ label: 'As a leaderboard view', icon: 'i-leaderboard', to: href('/leaderboard', { view: 'plot' }) }}
          >
            <Panel>
              <PanelBody>
                <SizeRatingPlot entries={field.data?.entries ?? []} classes={classes} you={me?.handle} state={field.state} />
              </PanelBody>
            </Panel>
          </Section>
        ) : null}

        {live || !season ? (
          <Section
            title="Your class is measured, not chosen"
            sub="model and manifest bytes together pick the class; every version also plays on Open"
          >
            <ClassScale classes={classes} />
          </Section>
        ) : (
          <Section title={`What ${season.name} ran under`}>
            <Panel>
              <PanelBody>
                <KeyValueList
                  items={[
                    { key: 'Window', value: `${date(season.submissions_open_at)} → ${date(season.closed_at ?? season.submissions_close_at)}` },
                    {
                      key: 'Maps',
                      value: (
                        <Link to={href('/maps')}>
                          <IconLabel icon="i-map">{num(season.maps.enabled + season.maps.disabled)} boards →</IconLabel>
                        </Link>
                      ),
                    },
                    { key: 'Engine digest', value: <span className="hash">{season.engine_digest ?? '—'}</span> },
                    { key: 'Weight classes', value: classes.map((c) => `${c.class} ${cap(c.max_bytes)}`).join(' · ') },
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
                      <Icon id="i-ext" label="opens another site" />
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
        <>
          {placed.length} players · won by <b>{placed[0]?.model}</b> with {placed[0]?.score ?? '—'}
        </>
      )}
      {' · '}
      <Link to={`/matches/${match.id}`}>Open the match →</Link>
    </p>
  )
}
