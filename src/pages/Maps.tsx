// `/maps` — the boards of the selected season: each drawn at rest, each a door to the matches
// played on it.
//
// PUBLIC FROM THE MOMENT A BOARD IS UPLOADED, disabled ones included: a board taken out of play
// keeps the matches played on it, and a competitor reading one of those replays is owed the board
// it names. Off boards fold under the grid, dimmed, with their matches and their Watch. A season's
// maps are the one part of it that changes while it is live, so this page is read, not remembered.
//
// EVERY BOARD IS DRAWN BY THE CARTRIDGE'S OWN VIEWER: at rest the map visual (`BoardPreview`), and
// on hover the last frame of the latest match played on it, still (`StillFrame`), fetched only
// then. Nothing here reads inside a board beyond the header Soma returns beside it.
//
// The filters and the sort live in the query string (`size`, `players`, `terrain`, `sort`), each
// omitted at its default, and filter the one list Soma sends: a season holds tens of boards.

import { Fragment, useEffect, useState, type PointerEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, type SeasonMap, type SeasonWeightClass } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useQueryState, useSelection } from '../lib/selection'
import { useFrame } from '../lib/viz'
import { ago, num } from '../lib/format'
import { allowsMemory, memoryCap } from '../lib/weight-classes'
import { cx } from '../lib/cx'
import { count, fill } from '../lib/copy'
import { Shell } from '../components/Shell'
import { EmptyState, Icon, PageHeader, Segmented, Select, Skel } from '../components/ui'
import { ClassBadge, SeasonBadge } from '../components/Model'
import { BoardPreview } from '../components/Replay'
import { StillFrame } from '../components/Viewer'
import { InlineError } from '../components/ErrorStates'
import T from '../../copy/maps.json'

const F = T.filters
const C = T.card

/** Smallest first: the order the default sort reads the gallery in. */
const SIZES = F.size.options.map((o) => o.key).filter(Boolean)
const PLAYERS: Record<string, [number, number]> = { '2': [2, 2], '3-4': [3, 4], '5-8': [5, 8] }

const SORTS: Record<string, (a: SeasonMap, b: SeasonMap) => number> = {
  '': (a, b) => rankOf(a.size) - rankOf(b.size) || a.players - b.players || a.map_id.localeCompare(b.map_id),
  played: (a, b) => b.matches - a.matches || a.map_id.localeCompare(b.map_id),
  players: (a, b) => b.players - a.players || b.rows * b.cols - a.rows * a.cols || a.map_id.localeCompare(b.map_id),
  newest: (a, b) => b.added_at.localeCompare(a.added_at) || a.map_id.localeCompare(b.map_id),
}

/** A board from before the naming rule has no size, and sorts after every one that has. */
function rankOf(size: string | null): number {
  const i = size ? SIZES.indexOf(size) : -1
  return i < 0 ? SIZES.length : i
}

/** A value the address carries only when it is one the control offers; anything else is the default. */
function pick(raw: string, allowed: string[]): string {
  return allowed.includes(raw) ? raw : ''
}

/** The tallest the map visual draws a board in a card, and the box it sits in (`.maps-pic`'s
 *  min-height in pages.css, which is the same number). */
const BOARD_MAX = 250
const PIC_H = 290

export default function Maps() {
  const { season, slug, gameName, live } = usePlatform()
  const { href } = useSelection()
  const { hash } = useLocation()
  const [q, setQ] = useQueryState()
  const size = pick(q('size'), F.size.options.map((o) => o.key))
  const players = pick(q('players'), F.players.options.map((o) => o.key))
  const terrain = pick(q('terrain'), F.terrain.options.map((o) => o.key))
  const sort = pick(q('sort'), F.sort.options.map((o) => o.value))
  const filtered = Boolean(size || players || terrain)

  // The classes that let a model carry a memory: each card prices theirs on its board.
  const memory = useWeightClasses().filter(allowsMemory)
  const list = useApi(`maps:${slug}:${season?.slug ?? ''}`, () => api.seasonMaps(slug, season!.slug, { boards: true }), Boolean(season))
  const all = list.data?.maps ?? []
  const inPlayCount = all.filter((m) => m.enabled).length
  const offCount = all.length - inPlayCount

  const range = players ? PLAYERS[players] : null
  const shown = all
    .filter((m) => (!size || m.size === size) && (!terrain || m.terrain === terrain) && (!range || (m.players >= range[0] && m.players <= range[1])))
    .sort(SORTS[sort])
  const inPlay = shown.filter((m) => m.enabled)
  const off = shown.filter((m) => !m.enabled)

  // A link from elsewhere may name a board by anchor; the anchor exists only once the list has landed.
  useEffect(() => {
    if (list.state !== 'ready' || !hash) return
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
  }, [list.state, hash])

  const clear = () => setQ({ size: '', players: '', terrain: '', sort: '' })
  const clearButton = (
    <button type="button" className="btn sm" onClick={clear}>
      {F.clear}
    </button>
  )

  return (
    <Shell scoped title={T.title}>
      <PageHeader
        crumbs={[{ label: season ? `${gameName} · ${season.name}` : gameName, to: href('/') }, { label: T.title, icon: 'i-map' }]}
        title={T.title}
        icon="i-map"
        badges={
          <>
            {season && list.state === 'ready' && all.length ? (
              <span className="maps-count">
                {offCount ? fill(T.inPlayOff, { n: num(inPlayCount), off: num(offCount) }) : fill(T.inPlay, { n: num(inPlayCount) })}
              </span>
            ) : null}
            {season && !live ? <SeasonBadge state={season.state} /> : null}
          </>
        }
      />
      <div className="wrap page-body">
        <div className="stack">
          {/* The segments scroll sideways on a phone; the sort and Clear stay put beside them, so the
              sort's list is never clipped by the scroller. */}
          <div className="maps-filters" role="group" aria-label={F.label}>
            <div className="maps-segs">
              <span className="maps-flabel" aria-hidden="true">
                {F.size.label}
              </span>
              <Segmented label={F.size.label} items={F.size.options} value={size} onChange={(v) => setQ({ size: v })} />
              <span className="maps-flabel" aria-hidden="true">
                {F.players.label}
              </span>
              <Segmented label={F.players.label} items={F.players.options} value={players} onChange={(v) => setQ({ players: v })} />
              <span className="maps-flabel" aria-hidden="true">
                {F.terrain.label}
              </span>
              <Segmented label={F.terrain.label} items={F.terrain.options} value={terrain} onChange={(v) => setQ({ terrain: v })} />
            </div>
            <Select
              className="maps-sort"
              look="pick"
              label={F.sort.label}
              prefix={F.sort.label}
              value={sort}
              options={F.sort.options}
              onChange={(v) => setQ({ sort: v })}
            />
            {filtered || sort ? (
              <button type="button" className="btn ghost sm maps-clear" onClick={clear}>
                {F.clear}
              </button>
            ) : null}
          </div>

          {list.state === 'error' ? (
            <InlineError error={list.error} what={T.error} />
          ) : !season ? (
            <EmptyState boxed>{T.noSeason}</EmptyState>
          ) : list.state !== 'ready' ? (
            <div className="maps-grid" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <MapSkeleton memory={memory.length > 0} key={i} />
              ))}
            </div>
          ) : all.length === 0 ? (
            <EmptyState boxed>{fill(T.empty, { season: season.name })}</EmptyState>
          ) : shown.length === 0 ? (
            <EmptyState boxed>
              <p>{T.none}</p>
              <div className="maps-empty-act">{clearButton}</div>
            </EmptyState>
          ) : (
            <>
              {inPlay.length ? (
                <div className="maps-grid">
                  {inPlay.map((m) => (
                    <MapCard game={slug} map={m} memory={memory} key={m.map_id} />
                  ))}
                </div>
              ) : (
                <EmptyState boxed>
                  <p>{T.noneInPlay}</p>
                  <div className="maps-empty-act">{clearButton}</div>
                </EmptyState>
              )}
              {off.length ? (
                <details className="maps-off">
                  <summary>{fill(T.off.summary, { n: num(off.length) })}</summary>
                  <p>{T.off.body}</p>
                  <div className="maps-grid">
                    {off.map((m) => (
                      <MapCard game={slug} map={m} memory={memory} key={m.map_id} />
                    ))}
                  </div>
                </details>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Shell>
  )
}

/** One board: the map visual at rest, the latest match's last frame on hover, and under it the
 *  name (to the matches on it), its facts, how often it was played and Watch, then the memory each
 *  class that allows one may carry on this board: its flat bytes plus its per-cell bytes a cell. */
function MapCard({ game, map: m, memory }: { game: string; map: SeasonMap; memory: SeasonWeightClass[] }) {
  const { href } = useSelection()
  const latest = m.latest_match
  const [hover, setHover] = useState(false)
  // Fetched on the first hover and kept for the page load, so the gallery at rest asks for nothing.
  const frame = useFrame(hover && latest?.frame ? latest.id : null)
  const enter = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && latest?.frame) setHover(true)
  }
  return (
    <article id={m.map_id} className={cx('maps-card', !m.enabled && 'off')} onPointerEnter={enter} onPointerLeave={() => setHover(false)}>
      <div className="maps-pic" style={{ ['--ar' as string]: `${m.cols / m.rows}` }}>
        <BoardPreview game={game} board={m.board} height={PIC_H} maxHeight={BOARD_MAX} />
        {hover && frame ? (
          <>
            <StillFrame game={game} frame={frame} className="maps-still" />
            <span className="maps-peek">
              <Icon id="i-play" />
              {fill(C.latest, { when: ago(latest?.played_at) })}
            </span>
          </>
        ) : null}
      </div>
      <div className="maps-cap">
        <Link className="maps-name" to={href('/matches', { map: m.map_id })} title={fill(C.nameTitle, { map: m.map_id })}>
          {m.map_id}
        </Link>
        <span className="maps-facts">
          <span>{count(C.players, m.players, { n: num(m.players) })}</span>
          <span aria-hidden="true">·</span>
          <span className="num">{fill(C.cells, { rows: m.rows, cols: m.cols })}</span>
          {m.hills !== null ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{count(C.hills, m.hills, { n: num(m.hills) })}</span>
            </>
          ) : null}
        </span>
        <span className="maps-facts">
          <Icon id="i-matches" />
          {count(C.matches, m.matches, { n: num(m.matches) })}
        </span>
        {latest ? (
          <Link className="btn sm maps-watch" to={`/matches/${latest.id}`} title={fill(C.watchTitle, { map: m.map_id })}>
            <Icon id="i-play" />
            {C.watch}
          </Link>
        ) : null}
        {memory.length ? (
          <span className="maps-facts maps-mem">
            <Icon id="i-memory" label={C.memory} />
            {memory.map((c, i) => (
              <Fragment key={c.class}>
                {i ? <span aria-hidden="true">·</span> : null}
                <ClassBadge k={c.class} />
                <span className="num">{fill(C.memoryCap, { n: num(memoryCap(c, m.rows * m.cols)) })}</span>
              </Fragment>
            ))}
          </span>
        ) : null}
      </div>
    </article>
  )
}

/** A card while the list loads: the board's box at its final height, and its three lines, a
 *  fourth where the season's classes carry a memory. */
function MapSkeleton({ memory }: { memory: boolean }) {
  return (
    <div className="maps-card">
      <div className="maps-pic skel" />
      <div className="maps-cap">
        <Skel w="60%" />
        <Skel w="75%" />
        <Skel w="40%" />
        {memory ? <Skel w="55%" /> : null}
      </div>
    </div>
  )
}
