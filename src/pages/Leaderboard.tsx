// `/leaderboard` — the home card at full size.
//
// Game and season come from the strip; the LADDER is a third switch on the page
// itself, defaulting to Open. Switching to a class shows that class's own ladder,
// ranked by the rating earned against that class alone.
//
// THE CLASS COLUMN APPEARS ON OPEN AND NOWHERE ELSE. On the micro ladder every row
// is micro, so the column would say nothing five times over.

import { Link } from 'react-router-dom'
import { useState } from 'react'
import { api } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useSelection, useQueryState } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { cap, date, num, plural } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardFoot, CardHead, DataTable, PageHead } from '../components/ui'
import { ladderColumns } from '../components/LadderTable'
import { LadderSwitch } from '../components/LadderSwitch'
import { InlineError } from '../components/ErrorStates'

const PAGE = 50

export default function Leaderboard() {
  const { season, live, slug, gameName } = usePlatform()
  const { href, season: wanted } = useSelection()
  const { me } = useSession()
  const classes = useWeightClasses()

  // The ladder is the page's own state and belongs in the address: a link to the
  // nano ladder has to open on the nano ladder.
  const [param, setParam] = useQueryState()
  const ladder = param('ladder') || 'open'

  const [cursor, setCursor] = useState<string | null>(null)
  const board = useApi(`lb:${slug}:${wanted}:${ladder}:${cursor}`, () =>
    api.leaderboard(slug, { ladder, season: wanted, limit: PAGE, cursor }),
  )

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
              ? `${gameName} · season ${season.number} · ${num(season.active_versions)} active versions across ${classes.length + 1} ladders. Standings move as matches finish.`
              : `${gameName} · season ${season.number} · settled on ${date(season.closed_at)}. ${num(season.entered_versions)} versions entered and ${num(season.matches_played)} matches were played.`
            : undefined
        }
      />

      <section className="wrap sec-top">
        <LadderSwitch classes={classes} value={ladder} onChange={(l) => setParam({ ladder: l === 'open' ? '' : l })} size="lg" />

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
              columns={ladderColumns({ you: me?.handle, trend: true, showClass: open })}
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
              <button className="btn sm push" type="button" onClick={() => setCursor(board.data.next_cursor)}>
                Next {PAGE} →
              </button>
            ) : cursor ? (
              <button className="btn sm push" type="button" onClick={() => setCursor(null)}>
                ← Back to the top
              </button>
            ) : null}
          </CardFoot>
        </Card>
      </section>
    </Shell>
  )
}
