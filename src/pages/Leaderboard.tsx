// `/leaderboard` — the home card at full size.
//
// Game and season come from the strip; the LADDER is a third switch on the page
// itself, defaulting to Open. Switching to a class is not a filter over Open: it
// shows that class's own ladder, ranked by the rating earned against that class
// alone, so each row carries two ratings and the switch chooses which one ranks.
//
// THE CLASS COLUMN APPEARS ON OPEN AND NOWHERE ELSE. On the micro ladder every
// row is micro, so the column would say nothing five times over.

import { Link, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { api, type LeaderboardEntry } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform } from '../lib/platform-context'
import { useSelection } from '../lib/selection'
import { useSession } from '../lib/session-context'
import { bytes, cap, date, num, plural } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardFoot, CardHead, PageHead } from '../components/ui'
import { ByOwner, ClassChip, ModelLink, RatingValue } from '../components/model'
import { LadderSwitch } from '../components/LadderSwitch'
import { DataTable, type Column } from '../components/Table'
import { InlineError } from '../components/states'

const PAGE = 50

export default function Leaderboard() {
  const { season, live, slug, game } = usePlatform()
  const { href, season: wanted } = useSelection()
  const { me } = useSession()
  const [params, setParams] = useSearchParams()

  // The ladder is the page's own state and belongs in the address: a link to the
  // nano ladder has to open on the nano ladder.
  const ladder = params.get('ladder') ?? 'open'
  const setLadder = (l: string) => {
    const next = new URLSearchParams(params)
    if (l === 'open') next.delete('ladder')
    else next.set('ladder', l)
    setParams(next)
  }

  const [cursor, setCursor] = useState<string | null>(null)
  const board = useApi(`lb:${slug}:${wanted}:${ladder}:${cursor}`, () =>
    api.leaderboard(slug, { ladder, season: wanted, limit: PAGE, cursor }),
  )

  const classes = season?.weight_classes ?? []
  const open = ladder === 'open'
  const thisClass = classes.find((c) => c.class === ladder) ?? null
  const total = board.data?.total ?? 0

  return (
    <Shell nav="leaderboard" ctx="select">
      <PageHead
        title={<h1>{live ? 'Leaderboard' : 'Final standings'}</h1>}
        end={
          <Link className="btn sm" to={href('/matches')}>
            Every match played →
          </Link>
        }
        sub={
          season
            ? live
              ? `${game?.name ?? slug} · season ${season.number} · ${num(season.active_versions)} active versions across ${classes.length + 1} ladders. Standings move as matches finish.`
              : `${game?.name ?? slug} · season ${season.number} · settled on ${date(season.closed_at)}. ${num(season.entered_versions)} versions entered and ${num(season.matches_played)} matches were played.`
            : undefined
        }
        className="lb-head"
      />

      <section className="wrap" style={{ paddingTop: 28 }}>
        <LadderSwitch classes={classes} value={ladder} onChange={setLadder} size="lg" />

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
        </p>

        <Card>
          <CardHead
            title={open ? 'Open ladder' : `${ladder} ladder`}
            end={`${num(total)} ${plural(total, 'version')}${live ? '' : ' · final'}`}
          />
          {board.state === 'error' ? (
            <InlineError error={board.error} what="The standings" />
          ) : (
            <DataTable
              state={board.state}
              columns={columns(open, me?.handle)}
              rows={board.data?.entries ?? []}
              rowKey={(r) => r.model_id}
              rowClass={(r) => (me && r.owner === me.handle ? 'you' : undefined)}
              empty={
                open
                  ? 'No version has been rated in this season yet.'
                  : `No version has entered the ${ladder} class this season.`
              }
            />
          )}
          <CardFoot>
            <span className="muted">
              {live ? (
                <>
                  Rating is mu − 3σ. <span className="prov">prov</span> marks a rating still settling,
                  which is shown, not hidden. Baselines are named as baselines.
                </>
              ) : (
                'Frozen when the season closed. Nothing on this ladder will move again.'
              )}
            </span>
            {board.data?.next_cursor ? (
              <button
                className="btn sm"
                type="button"
                style={{ marginLeft: 'auto' }}
                onClick={() => setCursor(board.data.next_cursor)}
              >
                Next {PAGE} →
              </button>
            ) : cursor ? (
              <button className="btn sm" type="button" style={{ marginLeft: 'auto' }} onClick={() => setCursor(null)}>
                ← Back to the top
              </button>
            ) : null}
          </CardFoot>
        </Card>
      </section>
    </Shell>
  )
}

function columns(open: boolean, you: string | undefined): Column<LeaderboardEntry>[] {
  const cols: Column<LeaderboardEntry>[] = [
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
    {
      key: 'version',
      head: 'Version',
      cellClass: 'r-v',
      // A baseline is not versioned by anyone; it changes only when the engine does.
      cell: (r) => (r.baseline ? '—' : `v${r.version}`),
    },
  ]

  if (open) {
    cols.push({ key: 'class', head: 'Class', cell: (r) => <ClassChip k={r.class} /> })
  }

  cols.push(
    { key: 'size', head: 'Size', align: 'right', cellClass: 'r-num', cell: (r) => bytes(r.size_bytes) },
    { key: 'matches', head: 'Matches', align: 'right', cellClass: 'r-num muted', cell: (r) => num(r.matches) },
    {
      key: 'rating',
      head: 'Rating',
      align: 'right',
      cellClass: 'r-rating',
      cell: (r) => <RatingValue value={r.rating} provisional={r.provisional} trend={r.trend} />,
    },
  )

  return cols
}
