// `/leaderboard` — the home card at full size. It IS the home card: LadderCard, with
// the ladder switch in its head, asked for a page of fifty rather than six.
//
// Game and season come from the strip; the ladder is the card's own switch,
// defaulting to Open. Switching to a class shows that class's own ladder, ranked by
// the rating earned against that class alone.
//
// THE CLASS COLUMN APPEARS ON OPEN AND NOWHERE ELSE. On the micro ladder every row
// is micro, so the column would say nothing five times over.

import { useState } from 'react'
import { api, type LeaderboardEntry, type SeasonWeightClass } from '../api'
import { useApi } from '../lib/useApi'
import { kStyle } from '../lib/weight-classes'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useSelection, useQueryState } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { cap, date, num, rating as fmtRating } from '../lib/format'
import { cx } from '../lib/cx'
import { Shell } from '../components/Shell'
import { Card, CardBody, CardFoot, CardHead, PageHead, Skel } from '../components/ui'
import { ladderColumns, ladderEmpty } from '../components/LadderTable'
import { LadderCard } from '../components/LadderCard'
import { SizeRatingPlot } from '../components/SizeRatingPlot'
import { ModelLink } from '../components/Model'

const PAGE = 50

export default function Leaderboard() {
  const { season, live, slug, gameName } = usePlatform()
  const { season: wanted } = useSelection()
  const { me } = useSession()
  const classes = useWeightClasses()

  // The ladder is the page's own state and belongs in the address: a link to the
  // nano ladder has to open on the nano ladder.
  const [param, setParam] = useQueryState()
  const ladder = param('ladder') || 'open'
  // In the address too, so a ladder read without the baselines is a link somebody can send.
  const hide = param('baselines') === 'hidden'

  const [cursor, setCursor] = useState<string | null>(null)
  const board = useApi(`lb:${slug}:${wanted}:${ladder}:${cursor}`, () =>
    api.leaderboard(slug, { ladder, season: wanted, limit: PAGE, cursor }),
  )

  // THE TOP OF EACH CLASS, on Open. Open ranks one field; a class ladder ranks its own, and
  // its #1 was a switch away and invisible here. One row per class is five people with
  // something to be proud of instead of one.
  const open = ladder === 'open'
  const champs = useApi(
    `champs:${slug}:${wanted}:${classes.map((c) => c.class).join(',')}`,
    () =>
      Promise.all(
        classes.map(async (c) => {
          const b = await api.leaderboard(slug, { ladder: c.class, season: wanted, limit: 1 })
          return { c, top: b.entries[0] ?? null }
        }),
      ),
    open && classes.length > 0,
  )

  // A cursor is an offset into one ladder, so a newly picked ladder starts at its top.
  const pick = (l: string) => {
    setParam({ ladder: l === 'open' ? '' : l })
    setCursor(null)
  }

  const thisClass = classes.find((c) => c.class === ladder) ?? null
  const total = board.data?.total ?? 0

  return (
    <Shell
      nav="leaderboard"
      ctx="select"
      title={open ? (live ? 'Leaderboard' : 'Final standings') : `${ladder} leaderboard`}
    >
      <PageHead
        title={<h1>{live ? 'Leaderboard' : 'Final standings'}</h1>}
        sub={
          season
            ? live
              ? `${gameName} · season ${season.number} · ${num(season.active_versions)} active versions across ${classes.length + 1} ladders. Standings move as matches finish.`
              : `${gameName} · season ${season.number} · settled on ${date(season.closed_at)}. ${num(season.entered_versions)} versions entered and ${num(season.matches_played)} matches were played.`
            : undefined
        }
      />

      <section className="wrap sec-top">
        <p className="ladder-say">
          {open ? (
            <>
              Every active version, whatever its size, ranked on the rating it earns against the whole
              field. <span className="cap">a version also races on its own class ladder</span>
            </>
          ) : (
            <>
              Only versions that measure {cap(thisClass?.max_bytes)} or less, ranked on the rating they
              earn against each other.{' '}
              <span className="cap">
                {ladder} · {cap(thisClass?.max_bytes)} compressed
              </span>
            </>
          )}
          <span className="end">
            <button
              type="button"
              className={cx('tab', hide && 'on')}
              aria-pressed={hide}
              onClick={() => setParam({ baselines: hide ? '' : 'hidden' })}
            >
              {hide ? 'Baselines hidden' : 'Hide baselines'}
            </button>
          </span>
        </p>

        {open && classes.length > 0 ? (
          <Champions classes={classes} game={slug} state={champs.state} rows={champs.data ?? []} onPick={pick} />
        ) : null}

        {/* THE POINT OF THE TABLE, drawn: strongest play per byte. The table under it is the
            same rows, which is the table view every chart owes. */}
        <Card className="plot-card">
          <CardHead title="Strongest play per byte" end="bytes across, on a log scale · rating up" />
          <CardBody>
            <SizeRatingPlot
              entries={hide ? (board.data?.entries ?? []).filter((r) => !r.baseline) : (board.data?.entries ?? [])}
              classes={classes}
              game={slug}
              you={me?.handle}
              state={board.state}
            />
          </CardBody>
          <CardFoot>
            <span className="plot-foot">
              Each dot is a version on this ladder, in the band of its class. Hover for its numbers; click
              for its page. The table below is the same rows.
            </span>
          </CardFoot>
        </Card>

        <LadderCard
          title={open ? 'Open ladder' : `${ladder} ladder`}
          classes={classes}
          ladder={ladder}
          onLadder={pick}
          board={board}
          columns={ladderColumns({ game: slug, you: me?.handle, trend: true, showClass: open, classes })}
          you={me?.handle}
          hideBaselines={hide}
          empty={ladderEmpty(ladder, classes, live)}
        >
          <span className="muted">
            {live ? (
              <>
                Rating is mu − 3σ. <span className="prov">prov</span> marks a rating still settling,
                which is shown, not hidden. Baselines are tagged, and rated like every other entry.
              </>
            ) : (
              'Frozen when the season closed. Nothing on this ladder will move again.'
            )}
          </span>
          <span className="foot-end">
            {board.data ? `${num(total)} on ${ladder}${hide ? ' · baselines hidden' : ''}${live ? '' : ' · final'}` : null}
          </span>
          {board.data?.next_cursor ? (
            <button className="btn sm" type="button" onClick={() => setCursor(board.data.next_cursor)}>
              Next {PAGE} →
            </button>
          ) : cursor ? (
            <button className="btn sm" type="button" onClick={() => setCursor(null)}>
              ← Back to the top
            </button>
          ) : null}
        </LadderCard>
      </section>
    </Shell>
  )
}

/** One cell per class: who leads it, or that nobody has entered it yet and what would. The
 *  class name is the cell's link to that ladder. Held at its height while the five reads are out. */
function Champions({
  classes,
  game,
  state,
  rows,
  onPick,
}: {
  classes: SeasonWeightClass[]
  game: string
  state: 'loading' | 'ready' | 'error'
  rows: { c: SeasonWeightClass; top: LeaderboardEntry | null }[]
  onPick: (ladder: string) => void
}) {
  const byClass = new Map(rows.map((r) => [r.c.class, r.top]))
  return (
    <div className="champs" role="list" aria-label="Class champions">
      {classes.map((c) => {
        const top = byClass.get(c.class) ?? null
        return (
          <div className="champ" style={kStyle(c.class)} role="listitem" key={c.class}>
            <button type="button" className="k" onClick={() => onPick(c.class)}>
              {c.class} <span className="cap">· {cap(c.max_bytes)}</span>
            </button>
            {state === 'loading' ? (
              <>
                <Skel w="70%" />
                <Skel w="45%" />
              </>
            ) : state === 'error' ? (
              <span className="who">could not be read</span>
            ) : top ? (
              <>
                <span className="lead">
                  <ModelLink game={game} repo={top.repo} name={top.model} k={top.class} version={top.version} />
                </span>
                <span className="who">
                  {fmtRating(top.rating)}
                  {top.provisional ? ' prov' : ''} · @{top.owner}
                  {top.baseline ? ' · baseline' : ''}
                </span>
              </>
            ) : (
              <>
                <span className="lead muted">nobody yet</span>
                <span className="who">under {cap(c.max_bytes)} takes it</span>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
