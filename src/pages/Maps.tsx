// `/maps` — the boards of the selected season, each drawn at turn zero.
//
// PUBLIC FROM THE MOMENT A BOARD IS UPLOADED, disabled ones included: a board taken out of
// play keeps the matches played on it, and a competitor reading one of those replays is owed the
// board it names. A season's maps are the one part of it that changes while it is live, so this
// page is read, not remembered.
//
// EVERY BOARD IS DRAWN BY THE CARTRIDGE'S OWN VIEWER (`BoardPreview`), from the file as uploaded.
// Nothing here reads inside a board beyond the header Soma returns beside it.

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { api, type SeasonMap } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform } from '../providers/platform-context'
import { useSelection } from '../lib/selection'
import { num } from '../lib/format'
import { cx } from '../lib/cx'
import { Shell } from '../components/Shell'
import { Icon, PageHeader, Panel } from '../components/ui'
import { SeasonBadge } from '../components/Model'
import { BoardPreview } from '../components/Replay'
import { InlineError } from '../components/ErrorStates'

export default function Maps() {
  const { season, slug, gameName, live } = usePlatform()
  const { href } = useSelection()
  const { hash } = useLocation()
  const list = useApi(`maps:${slug}:${season?.slug ?? ''}`, () => api.seasonMaps(slug, season!.slug, { boards: true }), Boolean(season))
  // In play, then the rest -- each in the order they were added.
  const all = list.data?.maps ?? []
  const inPlay = all.filter((m) => m.enabled)
  const off = all.filter((m) => !m.enabled)

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
              {num(inPlay.length)} in play
              {off.length ? ` · ${num(off.length)} off` : ''}
            </span>
          ) : null
        }
      />
      <div className="wrap page-body">
        {list.state === 'error' ? (
          <InlineError error={list.error} what="The maps" />
        ) : list.state === 'ready' && all.length === 0 ? (
          <p className="muted">{season ? `${season.name} has no maps yet.` : 'No season yet.'}</p>
        ) : list.state !== 'ready' ? (
          <div className="map-grid">
            {Array.from({ length: 4 }, (_, i) => (
              <MapCard game={slug} map={null} key={i} />
            ))}
          </div>
        ) : (
          <>
            <div className="map-grid">
              {inPlay.map((m) => (
                <MapCard game={slug} map={m} key={m.map_id} />
              ))}
            </div>
            {off.length ? (
              <section className="map-off">
                <h2 className="map-off-head">
                  <Icon id="i-map" label="" />
                  Off
                </h2>
                <div className="map-grid">
                  {off.map((m) => (
                    <MapCard game={slug} map={m} key={m.map_id} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </Shell>
  )
}

/** One board: the cartridge's map visual and nothing around it -- its name, its player count and
 *  its size are the visual's own, and a board that is not in play is in the "Off" section rather
 *  than badged. */
function MapCard({ game, map: m }: { game: string; map: SeasonMap | null }) {
  return (
    <Panel>
      <div id={m?.map_id} className={cx('map-card', m && !m.enabled && 'off')}>
        {m ? (
          <BoardPreview game={game} board={m.board} height={Math.min(520, 34 + 360 * (m.rows / Math.max(1, m.cols)))} />
        ) : (
          <div className="replay board-preview" style={{ minHeight: 394 }} />
        )}
      </div>
    </Panel>
  )
}
