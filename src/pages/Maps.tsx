// `/maps` — the boards of the selected season, each drawn at turn zero.
//
// PUBLIC FROM THE MOMENT A BOARD IS UPLOADED (N28), disabled ones included: a board taken out of
// play keeps the matches played on it, and a competitor reading one of those replays is owed the
// board it names. A season's maps are the one part of it that changes while it is live, so this
// page is read, not remembered.
//
// EVERY BOARD IS DRAWN BY THE CARTRIDGE'S OWN VIEWER (`BoardPreview`), from the file as uploaded.
// Nothing here reads inside a board beyond the header Soma returns beside it.

import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, type SeasonMap } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform } from '../providers/platform-context'
import { useSelection } from '../lib/selection'
import { num } from '../lib/format'
import { cx } from '../lib/cx'
import { Shell } from '../components/Shell'
import { Badge, Icon, PageHeader, Panel, PanelHead } from '../components/ui'
import { SeasonBadge } from '../components/Model'
import { BoardPreview } from '../components/Replay'
import { InlineError } from '../components/ErrorStates'

/** The board's own height, plus a row of the viewer's seat strip for every two seats: an eight-seat
 *  board's strip is four rows on a phone, and without the room they took it from the board. */
const BOARD_HEIGHT = 260
const boardHeight = (players: number) => BOARD_HEIGHT + 34 * Math.ceil(players / 2)

export default function Maps() {
  const { season, slug, gameName, live } = usePlatform()
  const { href } = useSelection()
  const { hash } = useLocation()
  const list = useApi(`maps:${slug}:${season?.slug ?? ''}`, () => api.seasonMaps(slug, season!.slug, { boards: true }), Boolean(season))
  // In play first, then the rest, each in the order they were added.
  const maps = [...(list.data?.maps ?? [])].sort((a, b) => Number(b.enabled) - Number(a.enabled))

  // A link from a match names its board by anchor; the anchor exists only once the list has landed.
  useEffect(() => {
    if (list.state !== 'ready' || !hash) return
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
  }, [list.state, hash])

  return (
    <Shell scoped title="Maps">
      <PageHeader
        crumbs={[{ label: season ? `${gameName} · ${season.name}` : gameName, to: href('/') }, { label: 'Maps', icon: 'i-map' }]}
        title="Maps"
        icon="i-map"
        badges={season && !live ? <SeasonBadge state={season.state} /> : null}
        actions={
          season && list.state === 'ready' ? (
            <span className="num muted">
              {num(season.maps.enabled)} in play
              {season.maps.disabled ? ` · ${num(season.maps.disabled)} off` : ''}
            </span>
          ) : null
        }
      />
      <div className="wrap page-body">
        {list.state === 'error' ? (
          <InlineError error={list.error} what="The maps" />
        ) : list.state === 'ready' && maps.length === 0 ? (
          <p className="muted">{season ? `${season.name} has no maps yet.` : 'No season yet.'}</p>
        ) : (
          <div className="map-grid">
            {list.state === 'ready'
              ? maps.map((m) => <MapCard game={slug} season={season!.slug} map={m} key={m.map_id} />)
              : Array.from({ length: 4 }, (_, i) => <MapCard game={slug} season="" map={null} key={i} />)}
          </div>
        )}
      </div>
    </Shell>
  )
}

function MapCard({ game, season, map: m }: { game: string; season: string; map: SeasonMap | null }) {
  return (
    <Panel>
      <div id={m?.map_id} className={cx('map-card', m && !m.enabled && 'off')}>
        <PanelHead
          title={<h3 className="mono">{m ? m.map_id : ' '}</h3>}
          end={
            m ? (
              <span className="map-facts">
                <span>
                  <Icon id="i-seats" label="Seats" />
                  {m.players}
                </span>
                <span className="mono">
                  {m.rows}×{m.cols}
                </span>
                {m.enabled ? null : <Badge tone="off">off</Badge>}
              </span>
            ) : null
          }
        />
        {m ? (
          <BoardPreview game={game} board={m.board} height={boardHeight(m.players)} />
        ) : (
          <div className="replay board-preview" style={{ minHeight: boardHeight(2) }} />
        )}
        {m ? (
          <div className="map-foot">
            <Link to={`/matches?season=${season}&map=${m.map_id}`}>
              <Icon id="i-matches" label="Matches played on it" />
              <span className="num">{num(m.matches)}</span>
            </Link>
          </div>
        ) : null}
      </div>
    </Panel>
  )
}
