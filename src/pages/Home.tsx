// `/` — the selected game in the selected season, and the front door for everyone.
//
// LIVE AND FROZEN ARE THE SAME PAGE IN TWO STATES. A live season shows a closing
// time, an Open pill and standings that move; a past season shows its final
// standings and no way in. Signed in with an entry, the hero is replaced by your
// rating, both ranks, and your candidate's progress through admission.

import { Link } from 'react-router-dom'
import { useState } from 'react'
import { api, type Match, type MyModel } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useSelection } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { ago, bytes, date, num, rating as fmtRating } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardFoot, CardHead, DataTable, Facts, KeyValues, Loading, Note, Pill, SectionHead, Skel, Steps } from '../components/ui'
import { ClassChip, ModelLink, OwnerLink, WeightScale } from '../components/Model'
import { ladderColumns } from '../components/LadderTable'
import { LadderSwitch } from '../components/LadderSwitch'
import { MatchList } from '../components/MatchRow'
import { Replay } from '../components/Replay'
import { InlineError } from '../components/ErrorStates'

const LADDER_ROWS = 6

export default function Home() {
  const { game, season, live, slug, gameName, gameError, gameLoading } = usePlatform()
  const { href, season: wanted } = useSelection()
  const { me } = useSession()
  const classes = useWeightClasses()
  const [ladder, setLadder] = useState('open')

  const board = useApi(`home-lb:${slug}:${wanted}:${ladder}`, () =>
    api.leaderboard(slug, { ladder, season: wanted, limit: LADDER_ROWS }),
  )
  const matches = useApi(`home-mx:${slug}:${wanted}`, () => api.matches({ game: slug, season: wanted, limit: 3 }))
  const mine = useApi(`home-mine:${slug}:${me?.id ?? ''}`, () => api.myModels(slug), Boolean(me))

  // The replay on the hero is the newest match that actually has one; a queued or
  // cancelled match has nothing to show.
  const featured = matches.data?.matches.find((m) => m.status === 'rated' || m.status === 'finished') ?? null
  const replay = useApi(`home-replay:${featured?.id ?? ''}`, () => api.match(featured!.id), Boolean(featured))

  const about = game?.about ?? null

  // Which panel the top of the page is depends on whether the reader HAS an entry,
  // not merely on whether they are signed in: a signed-in competitor who has
  // submitted nothing has nothing for the entry panel to say, and one "you have not
  // entered yet" line in a two-column row reads as a page that failed to load.
  const inSeason = (mine.data ?? []).filter((m) => m.game === slug && (season ? m.season === season.number : true))
  const active = inSeason.find((m) => m.status === 'active') ?? null
  const candidate = inSeason.find((m) => m.status === 'testing' || m.status === 'verified') ?? null
  const showEntry = Boolean(me) && (mine.state === 'loading' || Boolean(active || candidate))

  return (
    <Shell ctx="select">
      {showEntry ? (
        <MyEntry active={active} candidate={candidate} loading={mine.state === 'loading'} replay={replay.data} />
      ) : (
        <section className="wrap hero">
          <div>
            <div className="eyebrow">
              {season ? (
                `${gameName} · Season ${season.number} · ${num(live ? season.active_versions : season.entered_versions)} ${live ? 'active versions' : 'versions entered'}`
              ) : (
                <Skel w={260} />
              )}
            </div>
            {live || !season ? (
              <>
                <h1>
                  Build the <i>smallest</i> brain that plays well.
                </h1>
                {/* Signed in with nothing entered, the one thing this reader does not
                    know is what the next step costs them. */}
                <p className="lede">
                  {me ? (
                    <>
                      You are signed in as <b>@{me.handle}</b> and have not entered
                      {season ? ` season ${season.number}` : ' this season'} yet. Submitting takes a public
                      GitHub release and the two hashes of the files on it.
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
                  It ran from {date(season.submissions_open_at)} to{' '}
                  {date(season.closed_at ?? season.submissions_close_at)}. The standings below are settled
                  and will not move again.
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

      <section className="wrap sec">
        <SectionHead
          title={season ? `Season ${season.number}` : 'The arena'}
          sub={season ? `${live ? 'Live' : 'Final'} · ${num(season.matches_played)} matches played` : undefined}
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
                columns={ladderColumns({ you: me?.handle, trend: live, compact: true })}
                loadingRows={LADDER_ROWS}
                rows={board.data?.entries ?? []}
                rowKey={(r) => r.model_id}
                rowClass={(r) => (me && r.owner === me.handle ? 'you' : undefined)}
                empty={`Nothing has been rated on ${ladder} yet.`}
              />
            )}
            <CardFoot>
              <Link to={href('/leaderboard', { ladder: ladder === 'open' ? null : ladder })}>Full leaderboard →</Link>
              <span className="foot-end">
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
                empty="No match has been played in this season yet."
              />
            </div>
            <CardFoot>
              <Link to={href('/matches')}>All matches →</Link>
            </CardFoot>
          </Card>
        </div>
      </section>

      {/* The copy is the CARTRIDGE'S, out of its own manifest, so a second game is
          a registration and not a web deploy. Plain text by contract: none of it is
          inserted as markup, and a cartridge shipping no `about` drops the section. */}
      {about?.story?.length ? (
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
                  { key: 'Weight classes', value: classes.map((c) => `${c.class} ${bytes(c.max_bytes)}`).join(' · ') },
                ]}
              />
            </>
          )}
        </div>
      </section>
    </Shell>
  )
}

/** Four cells either way, so the row is its full height before it has anything to
 *  say. Labels are known without the API; only the numbers wait. */
function HeroStats({ classes }: { classes: { class: string; max_bytes: number }[] }) {
  const { season, live, games } = usePlatform()

  const cells: [string, React.ReactNode][] = !season
    ? [['weight classes', null], ['smallest class', null], ['matches this season', null], ['game, so far', null]]
    : live
      ? [
          ['weight classes', classes.length],
          ['smallest class', classes.length ? bytes(classes[0].max_bytes) : '—'],
          ['matches this season', num(season.matches_played)],
          [games.length === 1 ? 'game, so far' : 'games', games.length],
        ]
      : [
          ['versions entered', num(season.entered_versions)],
          ['matches played', num(season.matches_played)],
          ['ladders settled', classes.length + 1],
          ['closed', date(season.closed_at)],
        ]

  return (
    <div className="hero-stats" aria-hidden={season ? undefined : true}>
      {cells.map(([label, value]) => (
        <div key={label}>
          <b>{value ?? <Skel w={44} />}</b>
          <small>{label}</small>
        </div>
      ))}
    </div>
  )
}

function Rank({ r }: { r: { rank: number; field: number } | undefined }) {
  if (!r) return <>—</>
  return (
    <>
      {r.rank}
      <span className="muted"> / {r.field}</span>
    </>
  )
}

/** Signed in, in a live season: your entry and your candidate's progress. In a
 *  closed one there is no candidate and no submitting, so the same panel states
 *  where you finished. */
function MyEntry({
  active,
  candidate,
  loading,
  replay,
}: {
  active: MyModel | null
  candidate: MyModel | null
  loading: boolean
  replay: Match | null
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
                { label: 'Open rank', value: <Rank r={openRating} /> },
                { label: `${active.class ?? 'Class'} rank`, value: <Rank r={classRating} /> },
                { label: 'Matches', value: num(openRating?.matches ?? 0) },
              ]}
            />
            <div className="board-foot">
              <span>
                <ModelLink id={active.id} k={active.class} />{' '}
                {me ? (
                  <span className="by">
                    by <OwnerLink handle={me.handle} />
                  </span>
                ) : null}{' '}
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
            <p className="muted say">
              Nothing of yours is on the ladder yet. v{candidate.version} has to be admitted and pass one
              match against a baseline before it starts playing — the steps below are where it has got to.
            </p>
          </Card>
        ) : null}

        {candidate ? (
          <Card className="entry-card">
            <div className="entry-top">
              <h2 className="sm">Candidate v{candidate.version}</h2>
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
