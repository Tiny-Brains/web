// `/` — the selected game in the selected season, and the front door for everyone.
//
// LIVE AND FROZEN ARE THE SAME PAGE IN TWO STATES. A live season shows a closing
// time, an Open pill and standings that move. A past season shows its final
// standings, the rules it ran under, and no way in. Nothing about the layout
// changes; the data is settled and the calls to action are gone.
//
// Signed in, the hero is replaced by your entry -- rating, both ranks, matches --
// beside your candidate's progress through submitted → admitted → trial → active.

import { Link } from 'react-router-dom'
import { useState } from 'react'
import { api, type LeaderboardEntry, type MyModel } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform } from '../lib/platform-context'
import { useSelection } from '../lib/selection'
import { useSession } from '../lib/session-context'
import { ago, bytes, date, num, rating as fmtRating } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardFoot, CardHead, Facts, KeyValues, Loading, Note, Pill, SectionHead, Skel, Steps } from '../components/ui'
import { ByOwner, ClassChip, ModelLink, RatingValue, WeightScale } from '../components/model'
import { LadderSwitch } from '../components/LadderSwitch'
import { DataTable, type Column } from '../components/Table'
import { MatchList } from '../components/MatchRow'
import { Replay } from '../components/Replay'
import { InlineError } from '../components/states'

const LADDER_ROWS = 6

export default function Home() {
  const { game, season, live, slug, gameError, gameLoading } = usePlatform()
  const { href, season: wanted } = useSelection()
  const { me } = useSession()
  const [ladder, setLadder] = useState('open')

  const board = useApi(`home-lb:${slug}:${wanted}:${ladder}`, () =>
    api.leaderboard(slug, { ladder, season: wanted, limit: LADDER_ROWS }),
  )
  const matches = useApi(`home-mx:${slug}:${wanted}`, () =>
    api.matches({ game: slug, season: wanted, limit: 3 }),
  )
  const mine = useApi(`home-mine:${slug}:${me?.id ?? ''}`, () => api.myModels(slug), Boolean(me))

  // The replay on the hero is the newest match that actually has one; a queued or
  // cancelled match has nothing to show.
  const featured = matches.data?.matches.find((m) => m.status === 'rated' || m.status === 'finished') ?? null
  const replay = useApi(`home-replay:${featured?.id ?? ''}`, () => api.match(featured!.id), Boolean(featured))

  const classes = season?.weight_classes ?? []
  const about = game?.about ?? null

  // Which panel the top of the page is depends on whether the reader HAS an
  // entry, not merely on whether they are signed in. A signed-in competitor who
  // has submitted nothing has nothing for the entry panel to say, and a single
  // "you have not entered yet" line in a two-column row reads as a page that
  // failed to load -- so they get the hero, worded for somebody who is already
  // through the door.
  const inSeason = (mine.state === 'ready' ? mine.data : []).filter(
    (m) => m.game === slug && (season ? m.season === season.number : true),
  )
  const active = inSeason.find((m) => m.status === 'active') ?? null
  const candidate = inSeason.find((m) => m.status === 'testing' || m.status === 'verified') ?? null
  const hasEntry = Boolean(active || candidate)
  const showEntry = Boolean(me) && (mine.state === 'loading' || hasEntry)

  return (
    <Shell nav={null} ctx="select">
      {showEntry ? (
        <MyEntry
          active={active}
          candidate={candidate}
          loading={mine.state === 'loading'}
          replay={replay.data}
        />
      ) : (
        <section className="wrap hero">
          <div>
            <div className="eyebrow">
              {season ? (
                `${game?.name ?? slug} · Season ${season.number} · ${num(live ? season.active_versions : season.entered_versions)} ${live ? 'active versions' : 'versions entered'}`
              ) : (
                <Skel w={260} />
              )}
            </div>
            {live || !season ? (
              <>
                <h1>
                  Build the <i>smallest</i> brain that plays well.
                </h1>
                {/* Signed in with nothing entered, the one thing this reader does
                    not know is what the next step costs them, so the hero says
                    that instead of the pitch they have already accepted. */}
                <p className="lede">
                  {me ? (
                    <>
                      You are signed in as <b>@{me.handle}</b> and have not entered
                      {season ? ` season ${season.number}` : ' this season'} yet. Submitting takes a
                      public GitHub release and the two hashes of the files on it.
                    </>
                  ) : (
                    <>
                      Train a neural network, write an adapter, publish it on GitHub.{' '}
                      {classes.length ? `${bytes(classes[0].max_bytes)} is a whole weight class.` : <Skel w={190} />}
                    </>
                  )}
                </p>
                <div className="hero-cta">
                  {me ? (
                    <>
                      <Link className="btn primary lg" to={href('/submit')}>
                        Submit a version
                      </Link>
                      <Link className="btn lg" to="/start">
                        How it works
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link className="btn primary lg" to="/start">
                        Get started
                      </Link>
                      {featured ? (
                        <Link className="btn lg" to={`/matches/${featured.id}`}>
                          Watch a match
                        </Link>
                      ) : null}
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <h1>
                  Season {season.number} is <i>final</i>.
                </h1>
                <p className="lede">
                  It ran from {date(season.submissions_open_at)} to {date(season.closed_at ?? season.submissions_close_at)}. The
                  standings below are settled and will not move again.
                  {me ? ' You did not enter it.' : null}
                </p>
                <div className="hero-cta">
                  <Link className="btn primary lg" to="/">
                    Go to the live season
                  </Link>
                  <Link className="btn lg" to={href('/matches')}>
                    Every match it played
                  </Link>
                </div>
              </>
            )}
            <HeroStats classes={classes} />
          </div>
          <div>
            <Replay match={replay.data} height={290} autoplay />
          </div>
        </section>
      )}

      {/* ============ the arena ============ */}
      <section className="wrap sec">
        <SectionHead
          title={season ? `Season ${season.number}` : 'The arena'}
          sub={
            season
              ? `${live ? 'Live' : 'Final'} · ${num(season.matches_played)} matches played`
              : undefined
          }
        />
        <div className="arena">
          <Card>
            <CardHead title={live ? 'Leaderboard' : 'Final standings'}>
              <LadderSwitch classes={classes} value={ladder} onChange={setLadder} />
            </CardHead>
            {board.state === 'error' ? (
              <InlineError error={board.error} what="The standings" />
            ) : (
              <DataTable
                state={board.state}
                columns={homeColumns(live, me?.handle)}
                loadingRows={LADDER_ROWS}
                rows={board.data?.entries ?? []}
                rowKey={(r) => r.model_id}
                rowClass={(r) => (me && r.owner === me.handle ? 'you' : undefined)}
                empty={`Nothing has been rated on ${ladder} yet.`}
              />
            )}
            <CardFoot>
              <Link to={href('/leaderboard', { ladder: ladder === 'open' ? null : ladder })}>Full leaderboard →</Link>
              <span className="muted" style={{ marginLeft: 'auto', font: '12px var(--font-mono)' }}>
                {board.data
                  ? board.data.total > LADDER_ROWS
                    ? `top ${LADDER_ROWS} of ${num(board.data.total)} on ${ladder}`
                    : `${num(board.data.total)} on ${ladder} · rating = mu − 3σ`
                  : null}
              </span>
            </CardFoot>
          </Card>

          <Card>
            <CardHead title={live ? 'Recent matches' : 'Its last matches'} end={live ? 'finished' : 'final'} />
            <div className="matches">
              <MatchList
                state={matches.state}
                matches={matches.data?.matches ?? []}
                loadingRows={3}
                empty="No match has been played in this season yet."
              />
            </div>
            <CardFoot>
              <Link to={href('/matches')}>All matches →</Link>
            </CardFoot>
          </Card>
        </div>
      </section>

      {/* ============ where the game comes from ============
          The copy is the CARTRIDGE'S, out of its own manifest, so a second game
          is a registration and not a web deploy. Plain text by contract: a
          registration document is read from a repository and rendered here, so
          none of it is inserted as markup. A cartridge that ships no `about`
          drops the section rather than showing an empty one. */}
      {about && about.story?.length ? (
        <section className="wrap sec">
          <SectionHead title={about.tagline} sub={about.provenance} />
          <div className="story">
            {about.story.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {about.links?.length ? (
              <div className="story-links">
                {about.links.map((l) => (
                  <a className="btn sm" href={l.href} rel="noopener" key={l.href}>
                    {l.label} ↗
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : gameLoading ? (
        <section className="wrap sec" aria-hidden="true">
          <SectionHead title={<Skel w={280} />} sub={<Skel w={180} />} />
          <div className="story">
            {[0, 1, 2].map((i) => (
              <p key={i}>
                <Skel /> <Skel w="92%" /> <Skel w="70%" />
              </p>
            ))}
          </div>
        </section>
      ) : gameError ? (
        <section className="wrap sec">
          <Note tone="info" title="This game did not introduce itself.">
            <p>
              What a game says about itself comes from its cartridge manifest, and this one could not be
              read. Nothing else on the page depends on it.
            </p>
          </Note>
        </section>
      ) : null}

      {/* ============ enter, or — in a closed season — the record ============ */}
      <section className="wrap sec">
        <div className="band">
          {live || !season ? (
            <>
              <div className="eb-say">
                <h3>Build small. Aim for the top.</h3>
                <p className="muted">
                  Your model and adapter, compressed, decide your class. Every version also races on Open,
                  against models of every size.
                </p>
              </div>
              <WeightScale classes={classes} />
              <Link className="btn primary lg" to="/start">
                Build your contender
              </Link>
            </>
          ) : (
            <>
              <div className="eb-say">
                <h3>What season {season.number} ran under</h3>
                <p className="muted">
                  The rules and the engine are part of the record: a standing only means something
                  alongside the code that produced it.
                </p>
              </div>
              <KeyValues
                className=""
                items={[
                  {
                    key: 'Window',
                    value: `${date(season.submissions_open_at)} → ${date(season.closed_at ?? season.submissions_close_at)}`,
                  },
                  {
                    key: 'Presets',
                    value: <span className="mono">{game?.presets?.map((p) => p.name).join(' · ') ?? '—'}</span>,
                  },
                  { key: 'Engine digest', value: <span className="mono">{season.engine_digest ?? '—'}</span> },
                  {
                    key: 'Weight classes',
                    value: classes.map((c) => `${c.class} ${bytes(c.max_bytes)}`).join(' · '),
                  },
                ]}
              />
            </>
          )}
        </div>
      </section>
    </Shell>
  )
}

function HeroStats({ classes }: { classes: { class: string; max_bytes: number }[] }) {
  const { season, live, games } = usePlatform()

  // Four cells either way, so the row is its full height before it has anything
  // to say. Labels are known without the API; only the numbers wait.
  if (!season) {
    return (
      <div className="hero-stats" aria-hidden="true">
        {['weight classes', 'smallest class', 'matches this season', 'game, so far'].map((label) => (
          <div key={label}>
            <b>
              <Skel w={44} />
            </b>
            <small>{label}</small>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="hero-stats">
      {live ? (
        <>
          <div>
            <b>{classes.length}</b>
            <small>weight classes</small>
          </div>
          <div>
            <b>{classes.length ? bytes(classes[0].max_bytes) : '—'}</b>
            <small>smallest class</small>
          </div>
          <div>
            <b>{num(season.matches_played)}</b>
            <small>matches this season</small>
          </div>
          <div>
            <b>{games.length}</b>
            <small>{games.length === 1 ? 'game, so far' : 'games'}</small>
          </div>
        </>
      ) : (
        <>
          <div>
            <b>{num(season.entered_versions)}</b>
            <small>versions entered</small>
          </div>
          <div>
            <b>{num(season.matches_played)}</b>
            <small>matches played</small>
          </div>
          <div>
            <b>{classes.length + 1}</b>
            <small>ladders settled</small>
          </div>
          <div>
            <b>{date(season.closed_at)}</b>
            <small>closed</small>
          </div>
        </>
      )}
    </div>
  )
}

/** Five columns: the card is narrow, so the class travels as the model's square
 *  and the version number is left to the full leaderboard. */
function homeColumns(live: boolean, you: string | undefined): Column<LeaderboardEntry>[] {
  return [
    {
      key: 'rank',
      head: '#',
      cellClass: 'r-rank',
      cell: (r) => <span className={r.rank <= 3 ? 'r-rank top' : undefined}>{r.rank}</span>,
    },
    {
      key: 'model',
      head: 'Model',
      wide: true,
      cell: (r) => (
        <div className="r-model">
          <ModelLink id={r.model_id} k={r.class} />
          <ByOwner handle={r.owner} baseline={r.baseline} you={you === r.owner} />
        </div>
      ),
    },
    { key: 'played', head: 'Played', align: 'right', cellClass: 'r-num muted', cell: (r) => num(r.matches) },
    { key: 'size', head: 'Size', align: 'right', cellClass: 'r-num', cell: (r) => bytes(r.size_bytes) },
    {
      key: 'rating',
      head: 'Rating',
      align: 'right',
      cellClass: 'r-rating',
      cell: (r) => <RatingValue value={r.rating} provisional={r.provisional} trend={live ? r.trend : null} />,
    },
  ]
}

/** Signed in, in a live season: your entry, and your candidate's progress.
 *  In a closed one there is no candidate and no submitting, so the same panel
 *  states where you finished. */
function MyEntry({
  active,
  candidate,
  loading,
  replay,
}: {
  active: MyModel | null
  candidate: MyModel | null
  loading: boolean
  replay: Parameters<typeof Replay>[0]['match'] | null
}) {
  const { season, live } = usePlatform()
  const { me } = useSession()

  const openRating = active?.ratings.open
  const classRating = active?.class ? active.ratings[active.class] : undefined

  return (
    <section className="wrap mine">
      <div className="mine-grid">
        {loading ? (
          <Card>
            <Loading rows={4} label="Loading your entry" />
          </Card>
        ) : active ? (
          <Card className="entry-card">
            <div className="entry-top">
              <h2>{live ? 'Your entry' : 'Where you finished'}</h2>
              <ClassChip k={active.class} />
              {live ? <Pill tone="ok">Active</Pill> : <Pill tone="closed">Season {active.season}</Pill>}
              <div className="end">
                <Link className="btn sm" to={`/models/${active.id}`}>
                  Version page
                </Link>
              </div>
            </div>
            <Facts
              items={[
                { label: live ? 'Open rating' : 'Final Open', value: fmtRating(openRating?.rating) },
                {
                  label: 'Open rank',
                  value: openRating ? (
                    <>
                      {openRating.rank}
                      <span className="muted"> / {openRating.field}</span>
                    </>
                  ) : (
                    '—'
                  ),
                },
                {
                  label: `${active.class ?? 'Class'} rank`,
                  value: classRating ? (
                    <>
                      {classRating.rank}
                      <span className="muted"> / {classRating.field}</span>
                    </>
                  ) : (
                    '—'
                  ),
                },
                { label: 'Matches', value: num(openRating?.matches ?? 0) },
              ]}
            />
            <div className="board-foot" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <span>
                <ModelLink id={active.id} k={active.class} />{' '}
                <span className="by">
                  by{' '}
                  <Link className="owner" to={`/profile/${me?.handle}`}>
                    @{me?.handle}
                  </Link>
                </span>{' '}
                · v{active.version} · {bytes(active.size_bytes)}
              </span>
              <span className="muted">
                {active.last_played_at ? `last played ${ago(active.last_played_at)}` : 'not played yet'}
              </span>
            </div>
          </Card>
        ) : candidate ? (
          /* A first submission still in admission: there is no active version to
             report, and the candidate card below carries the whole story. */
          <Card className="entry-card">
            <div className="entry-top">
              <h2>Your first version is on its way in</h2>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Nothing of yours is on the ladder yet. v{candidate.version} has to be admitted and pass one
              match against a baseline before it starts playing — the steps below are where it has got to.
            </p>
          </Card>
        ) : null}

        {candidate ? (
          <Card className="entry-card">
            <div className="entry-top">
              <h2 style={{ fontSize: 16 }}>Candidate v{candidate.version}</h2>
              <Pill tone={candidate.status === 'verified' ? 'settling' : 'wait'}>
                {candidate.status === 'verified' ? 'Awaiting trial' : 'In admission'}
              </Pill>
            </div>
            <Steps
              steps={[
                { label: 'submitted', tone: 'done' },
                { label: 'admitted', tone: candidate.status === 'verified' ? 'done' : 'now' },
                { label: 'trial', tone: candidate.status === 'verified' ? 'now' : 'todo' },
                { label: 'active', tone: 'todo' },
              ]}
              say={
                candidate.status === 'verified'
                  ? 'Admitted and measured, and queued against a baseline. It replaces your active version only if the trial completes below the strike limit — you do not have to win it.'
                  : 'We are fetching the release, checking the hashes and measuring it into a class.'
              }
            />
          </Card>
        ) : !live && season ? (
          <Note tone="info" title="This season is closed.">
            <p>
              Nothing can be submitted to it and no rating will change. Pick the live season in the strip
              above to enter the one that is running.
            </p>
          </Note>
        ) : null}
      </div>
      <div>
        <Replay match={replay} height={250} autoplay />
      </div>
    </section>
  )
}
