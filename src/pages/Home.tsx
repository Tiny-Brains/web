// `/` — the selected game in the selected season, and the front door for everyone.
//
// LIVE AND FROZEN ARE THE SAME PAGE IN TWO STATES. A live season shows a closing
// time, an Open pill and standings that move; a past season shows its final
// standings and no way in. Signed in with an entry, the hero is replaced by your
// rating, both ranks, and your candidate's progress through admission.

import { Link } from 'react-router-dom'
import { useState } from 'react'
import { api, type Leaderboard, type Match, type MyModel } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useSelection } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { ago, bytes, date, daysUntil, num, rating as fmtRating } from '../lib/format'
import { outcomeSaid } from '../lib/match'
import { Shell } from '../components/Shell'
import { Card, CardBody, CardFoot, CardHead, Facts, KeyValues, Loading, Note, Pill, SectionHead, Skel, Steps } from '../components/ui'
import { ClassChip, ModelLink, OwnerLink, WeightScale } from '../components/Model'
import { ladderColumns, ladderEmpty } from '../components/LadderTable'
import { LadderCard } from '../components/LadderCard'
import { MatchList } from '../components/MatchRow'
import { Replay } from '../components/Replay'
import { SizeRatingPlot } from '../components/SizeRatingPlot'

const LADDER_ROWS = 6
/** Both states of the top panel draw the replay at this height. It fits the
 *  section's min-height in pages.css less the hero's padding AND the caption's line
 *  under it, so it fills the panel without moving the page: change the three together. */
const TOP_REPLAY_HEIGHT = 436

export default function Home() {
  const { game, season, live, slug, gameName, gameError, gameLoading } = usePlatform()
  const { href, season: wanted } = useSelection()
  const { me } = useSession()
  const classes = useWeightClasses()
  const [ladder, setLadder] = useState('open')

  const board = useApi(`home-lb:${slug}:${wanted}:${ladder}`, () =>
    api.leaderboard(slug, { ladder, season: wanted, limit: LADDER_ROWS }),
  )
  const newest = useApi(`home-mx:${slug}:${wanted}`, () => api.matches({ game: slug, season: wanted, limit: 8 }))
  // DECIDED FIRST. The three newest matches between baselines were three 1–1 draws, which read
  // as a dead site. Of the eight newest, the decided ones come first -- newest within each group,
  // since sort is stable -- and the card shows three. The hero's replay is then a decided one too.
  const recent = [...(newest.data?.matches ?? [])]
    .sort((a, b) => Number(b.seats.some((s) => s.outcome === 'win')) - Number(a.seats.some((s) => s.outcome === 'win')))
    .slice(0, 3)
  const matches = { state: newest.state, matches: recent }
  // The whole Open ladder, for the plot: the card above shows six rows, the picture wants them all.
  const field = useApi(`home-field:${slug}:${wanted}`, () =>
    api.leaderboard(slug, { ladder: 'open', season: wanted, limit: 50 }),
  )
  const mine = useApi(`home-mine:${slug}:${me?.id ?? ''}`, () => api.myModels(slug), Boolean(me))

  // The replay on the hero is the newest match that actually has one; a queued or
  // cancelled match has nothing to show.
  const featured = matches.matches.find((m) => m.status === 'rated' || m.status === 'finished') ?? null
  const replay = useApi(`home-replay:${featured?.id ?? ''}`, () => api.match(featured!.id), Boolean(featured))

  const about = game?.about ?? null

  // Which panel the top of the page is depends on whether the reader HAS an entry,
  // not merely on whether they are signed in: a signed-in competitor who has
  // submitted nothing has nothing for the entry panel to say, and one "you have not
  // entered yet" line in a two-column row reads as a page that failed to load.
  // A competitor may hold several models, so this is a list of VERSIONS with the model each
  // belongs to. The panel headlines their best one and says how many others there are; the full
  // portfolio is /models, which is written for it.
  const held: Held[] = (mine.data ?? [])
    .filter((m) => m.game === slug)
    .flatMap((m) =>
      m.versions
        .filter((v) => (season ? v.season === season.number : true))
        .map((v) => ({ model: m, v })),
    )
  const actives = held.filter((h) => h.v.status === 'active')
  const active =
    [...actives].sort(
      (a, b) => (b.v.ratings?.open?.rating ?? -Infinity) - (a.v.ratings?.open?.rating ?? -Infinity),
    )[0] ?? null
  const candidate = held.find((h) => h.v.status === 'testing' || h.v.status === 'verified') ?? null
  const showEntry = Boolean(me) && (mine.state === 'loading' || Boolean(active || candidate))

  return (
    <Shell ctx="select">
      {showEntry ? (
        <MyEntry
          active={active}
          candidate={candidate}
          others={Math.max(actives.length - 1, 0)}
          loading={mine.state === 'loading'}
          replay={replay.data}
        />
      ) : (
        <section className="wrap hero">
          <div>
            <div className="eyebrow">
              {season ? `${gameName} · Season ${season.number}` : <Skel w={130} />}
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
                      {classes.length ? `${bytes(classes[0].max_bytes)} is a whole weight class` : <Skel w={190} />}
                      , so the question is not how big a model you can train but how little it
                      takes. Your rating is public, and a season's standings are kept for good.
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
                      {/* The third door, for the reader who would rather read code than a page:
                          drill is a clone, a binary and a match file, and it plays the baselines. */}
                      <a className="btn lg" href="https://github.com/Tiny-Brains/drill" rel="noopener">
                        Clone drill ↗
                      </a>
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
            <Replay match={replay.data} height={TOP_REPLAY_HEIGHT} autoplay />
            <ReplayCaption match={replay.data} />
          </div>
        </section>
      )}

      <section className="wrap sec">
        <SectionHead
          title={season ? `Season ${season.number}` : 'The arena'}
          sub={season ? `${live ? 'Live' : 'Final'} · ${num(season.matches_played)} matches played` : undefined}
        />
        <div className="arena">
          <LadderCard
            title={live ? 'Leaderboard' : 'Final standings'}
            classes={classes}
            ladder={ladder}
            onLadder={setLadder}
            board={board}
            columns={ladderColumns({ game: slug, you: me?.handle, trend: live, compact: true, classes })}
            you={me?.handle}
            loadingRows={LADDER_ROWS}
            empty={ladderEmpty(ladder, classes, live)}
          >
            <Link to={href('/leaderboard', { ladder: ladder === 'open' ? null : ladder })}>Full leaderboard →</Link>
            <span className="foot-end">{board.data ? ladderFoot(board.data, ladder) : null}</span>
          </LadderCard>

          <Card>
            <CardHead title={live ? 'Recent matches' : 'Its last matches'} end={live ? 'decided first' : 'final'} />
            <div className="matches">
              <MatchList
                state={matches.state}
                matches={matches.matches}
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
        <section className="wrap sec story-sec">
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
        <section className="wrap sec story-sec" aria-hidden="true">
          <SectionHead title={<Skel w={280} />} sub={<Skel w={180} />} />
          <div className="story">
            {[0, 1, 2].map((i) => (
              <p key={i}>
                <Skel /> <Skel w="60%" />
              </p>
            ))}
          </div>
        </section>
      ) : gameError ? (
        <section className="wrap sec story-sec">
          <Note tone="info" title="This game did not introduce itself.">
            <p>
              What a game says about itself comes from its cartridge manifest, and this one could not be
              read. Nothing else on the page depends on it.
            </p>
          </Note>
        </section>
      ) : null}

      {/* THE THESIS, DRAWN: strongest play per byte, the whole Open field as one picture. This
          slot used to repeat the hero's call to action with the class scale beside it. */}
      {live || !season ? (
        <section className="wrap sec">
          <SectionHead
            title="Strongest play per byte"
            sub="every active version on Open · bytes across on a log scale, rating up · the bands are the season's classes"
          />
          <Card>
            <CardBody>
              <SizeRatingPlot
                entries={field.data?.entries ?? []}
                classes={classes}
                game={slug}
                you={me?.handle}
                state={field.state}
              />
            </CardBody>
            <CardFoot>
              <span className="plot-foot">
                <span>Hover a dot for its numbers; click for its page.</span>
                <Link className="push" to="/start">
                  Build your contender →
                </Link>
              </span>
            </CardFoot>
          </Card>
        </section>
      ) : null}

      <section className="wrap sec">
        <div className="band">
          {live || !season ? (
            <>
              <div className="eb-say">
                <h3>Your class is measured, not chosen.</h3>
                <p className="muted">
                  Your model and adapter, compressed, decide your class. Every version also races on Open,
                  against models of every size.
                </p>
              </div>
              <WeightScale classes={classes} />
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

/** The foot of the home ladder. A ladder of nothing but baselines looks like a dead site; it is
 *  an open door, and the foot names the row to beat -- the lowest-rated baseline shown. */
function ladderFoot(b: Leaderboard, ladder: string): string {
  const rows = b.entries
  if (rows.length > 0 && rows.every((r) => r.baseline)) {
    const last = rows[rows.length - 1]
    return `${num(b.total)} baselines, no entries yet · beat ${last.model} at ${fmtRating(last.rating)} to be first`
  }
  return b.total > LADDER_ROWS ? `top ${LADDER_ROWS} of ${num(b.total)} on ${ladder}` : `${num(b.total)} on ${ladder} · rating = mu − 3σ`
}

/** Four cells either way, so the row is its full height before it has anything to
 *  say. Labels are known without the API; only the numbers wait.
 *
 *  The live cells are the numbers a developer weighs before spending a weekend: how many are on
 *  the ladder, how small the smallest class is, how much has been played, and how long they
 *  have. "5 weight classes" and "1 game, so far" were true and told them nothing. */
function HeroStats({ classes }: { classes: { class: string; max_bytes: number }[] }) {
  const { season, live } = usePlatform()
  const left = daysUntil(season?.submissions_close_at)

  const cells: [string, React.ReactNode][] = !season
    ? [['on the ladder', null], ['smallest class', null], ['matches this season', null], ['days to enter', null]]
    : live
      ? [
          ['on the ladder', num(season.active_versions)],
          ['smallest class', classes.length ? bytes(classes[0].max_bytes) : '—'],
          ['matches this season', num(season.matches_played)],
          ['days to enter', left !== null && left >= 0 ? num(left) : '—'],
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

/** Signed in, in a live season: your best model and your candidate's progress. In a
 *  closed one there is no candidate and no submitting, so the same panel states
 *  where you finished. */
/** One version, and the model it belongs to. Both halves are needed to name it or link to it. */
type Held = { model: MyModel; v: MyModel['versions'][number] }

function MyEntry({
  active,
  candidate,
  others,
  loading,
  replay,
}: {
  active: Held | null
  candidate: Held | null
  /** How many other models of theirs are also on a ladder. */
  others: number
  loading: boolean
  replay: Match | null
}) {
  const { slug, season, live } = usePlatform()
  const { me } = useSession()

  const openRating = active?.v.ratings.open
  const classRating = active?.v.class ? active.v.ratings[active.v.class] : undefined

  return (
    <section className="wrap mine">
      <div className="mine-grid">
        {loading ? (
          <Card>
            <Loading rows={4} label="Loading your models" />
          </Card>
        ) : active ? (
          <Card className="entry-card">
            <div className="entry-top">
              <h2>{live ? (others > 0 ? 'Your best model' : 'Your model') : 'Where you finished'}</h2>
              <ClassChip k={active.v.class} />
              {live ? <Pill tone="ok">Active</Pill> : <Pill tone="closed">Season {active.v.season}</Pill>}
              <div className="end">
                {others > 0 ? (
                  <Link className="btn sm" to="/models">
                    {others} more
                  </Link>
                ) : null}
                <Link className="btn sm" to={`/versions/${active.v.version_id}`}>
                  Version page
                </Link>
              </div>
            </div>
            <Facts
              items={[
                { label: live ? 'Open rating' : 'Final Open', value: fmtRating(openRating?.rating) },
                { label: 'Open rank', value: <Rank r={openRating} /> },
                { label: `${active.v.class ?? 'Class'} rank`, value: <Rank r={classRating} /> },
                { label: 'Matches', value: num(openRating?.matches ?? 0) },
              ]}
            />
            <div className="board-foot">
              <span>
                <ModelLink
                  game={slug}
                  repo={active.model.repo}
                  name={active.model.name}
                  k={active.v.class}
                  version={active.v.version}
                />{' '}
                {me ? (
                  <span className="by">
                    by <OwnerLink handle={me.handle} />
                  </span>
                ) : null}{' '}
                · v{active.v.version} · {bytes(active.v.size_bytes)}
              </span>
              <span className="muted">
                {active.v.last_played_at ? `last played ${ago(active.v.last_played_at)}` : 'not played yet'}
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
              Nothing of yours is on the ladder yet. v{candidate.v.version} has to be admitted and pass one
              match against a baseline before it starts playing — the steps below are where it has got to.
            </p>
          </Card>
        ) : null}

        {candidate ? (
          <Card className="entry-card">
            <div className="entry-top">
              <h2 className="sm">Candidate v{candidate.v.version}</h2>
              <Pill tone={candidate.v.status === 'verified' ? 'settling' : 'wait'}>
                {candidate.v.status === 'verified' ? 'Awaiting trial' : 'In admission'}
              </Pill>
            </div>
            <Steps
              steps={[
                { label: 'submitted', tone: 'done' },
                { label: 'admitted', tone: candidate.v.status === 'verified' ? 'done' : 'now' },
                { label: 'trial', tone: candidate.v.status === 'verified' ? 'now' : 'todo' },
                { label: 'active', tone: 'todo' },
              ]}
              say={
                candidate.v.status === 'verified'
                  ? 'Admitted and measured, and queued against a baseline. It replaces the active version OF THIS MODEL only if the trial completes below the strike limit — you do not have to win it, and your other models are not affected.'
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
        <Replay match={replay} height={TOP_REPLAY_HEIGHT} autoplay />
        <ReplayCaption match={replay} />
      </div>
    </section>
  )
}

/** One line under the board saying what the reader is looking at: who played, what came of it,
 *  and where to watch it whole. A first-time viewer sees dots on a dark board and cannot tell,
 *  and the caption is the cheapest legend there is. Drawn at its height before the match
 *  arrives, so the panel below does not move. */
function ReplayCaption({ match }: { match: Match | null }) {
  const said = match ? outcomeSaid(match.reason, match.turns, match.players) : null
  return (
    <p className="replay-say hero-say">
      {match ? (
        <>
          {match.players.map((p) => p.model).join(' vs ')}
          {said ? ` — ${said.long}` : ''} <Link to={`/matches/${match.id}`}>Open the match →</Link>
        </>
      ) : (
        <Skel w={320} />
      )}
    </p>
  )
}
