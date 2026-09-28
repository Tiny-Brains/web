// The cartridge's viewer, as this application loads and feeds it: the module, the public surface
// of a mounted viewer, and the few things a card needs before it can draw (a match's last frame, a
// season's boards, a replay URL for a hover), each fetched once per page load.
//
// NO RULE LIVES HERE, and nothing here draws: components/Replay.tsx and components/Viewer.tsx mount
// the viewer, and the viewer draws.

import { useEffect, useState } from 'react'
import { api, type MatchFrame } from '../api'

export type Viewer = { destroy: () => void }

/** The viewer's public surface (ants' viz/README.md, "The public surface"), what a host and the
 *  graph may read and call. Everything else on it is the viewer's own. */
export type VizViewer = Viewer & {
  turn?: number
  range?: { lo: number; hi: number }
  playing?: boolean
  seek?: (turn: number) => void
  play?: () => void
  pause?: () => void
  on?: (event: 'turn' | 'layout', fn: (...args: unknown[]) => void) => () => void
  fullscreen?: (on?: boolean) => void
  /** A tile's: play the last forty turns of this replay (or its URL) once and rest on the last. */
  preview?: (replay: unknown) => Promise<void> | void
  /** A tile's: back to the frame it rests on. */
  stop?: () => void
}

export type VizModule = {
  /** Each seat's colour, in seat order: the colour a host's swatch for that seat must be. */
  SEATS?: readonly string[]
  mount: (target: HTMLElement, replay: unknown, opts?: Record<string, unknown>) => Promise<VizViewer>
  /** A stored frame as a Thumb (or a Tile with `tier: "tile"`): synchronous, and it never calls the
   *  component. Absent from a viewer built before the tiers. */
  drawFrame?: (target: HTMLElement, frame: unknown, opts?: Record<string, unknown>) => VizViewer
  /** The ants graph beside a mounted viewer, loaded on first use. */
  mountGraph?: (target: HTMLElement, viewer: VizViewer, opts?: Record<string, unknown>) => Promise<Viewer>
  /** The map visual: a board on its own, under its name, player count and size, with no controls.
   *  Absent from a viewer built before it, which BoardPreview then stands in for with `mount`. */
  mountMap?: (target: HTMLElement, board: unknown, opts?: Record<string, unknown>) => Promise<Viewer>
}

/** One module instance per game, so a page with two viewers decodes the component
 *  once. The import is by a literal path prefix so a bundler cannot follow it. */
const modules = new Map<string, Promise<VizModule>>()

export function loadViz(game: string): Promise<VizModule> {
  let m = modules.get(game)
  if (!m) {
    m = import(/* @vite-ignore */ `/cartridges/${game}/viz.js`) as Promise<VizModule>
    // A REJECTION IS NOT AN ANSWER TO CACHE. Left in the map, one failed fetch makes every
    // later replay on the page report the viewer missing for as long as the tab is open.
    m.catch(() => modules.delete(game))
    modules.set(game, m)
  }
  return m
}

export type SeatLabel = { seat: number; name: string; by: string }

export function labelsOf(seats: { seat: number; model: string; version?: number | null; owner?: string | null }[]): SeatLabel[] {
  return seats.map((s) => ({
    seat: s.seat,
    name: s.version !== undefined && s.version !== null ? `${s.model} v${s.version}` : s.model,
    by: s.owner ? `@${s.owner}` : '',
  }))
}

// ---- what a card rests on -----------------------------------------------------------------

type Rest = { frame: unknown; labels: SeatLabel[] } | { board: unknown } | null

/** Each match's frame, once per page load: the route answers immutable once a frame exists, so the
 *  browser would keep it anyway, and this keeps a grid from asking twice while it scrolls. `priv`
 *  is the member's route, for a match of a private season (the public one answers 404 for it). */
const frames = new Map<string, Promise<{ frame: unknown; seats: MatchFrame['seats'] } | null>>()
function frameOf(id: string, priv: boolean) {
  // Keyed by the ROUTE as well as the id, and dropped when it fails: a public attempt that answered
  // 404 must not be the answer a later member read gets, or the tile never draws its frame again.
  const key = `${id}:${priv}`
  let f = frames.get(key)
  if (!f) {
    f = api
      .matchFrame(id, priv)
      .then((r) => (r.frame ? { frame: r.frame, seats: r.seats } : null))
      .catch(() => {
        frames.delete(key)
        return null
      })
    frames.set(key, f)
  }
  return f
}

/** A season's boards, once per season: the map files a queued or frameless card draws turn zero
 *  from. The frame route carries no board, since the browser holds them from here. */
const boards = new Map<string, Promise<Map<string, unknown>>>()
function boardOf(game: string, season: string, mapId: string, priv: boolean): Promise<unknown> {
  const key = `${game}/${season}/${priv}`
  let b = boards.get(key)
  if (!b) {
    b = api
      .seasonMaps(game, season, { boards: true, priv })
      .then((r) => new Map(r.maps.map((m) => [m.map_id, m.board])))
      .catch(() => {
        boards.delete(key)
        return new Map<string, unknown>()
      })
    boards.set(key, b)
  }
  return b.then((m) => m.get(mapId) ?? null)
}

export async function restOf(p: { id: string; game: string; season?: string | null; map?: string | null; hasFrame: boolean; priv: boolean }): Promise<Rest> {
  if (p.hasFrame) {
    const f = await frameOf(p.id, p.priv)
    if (f) return { frame: f.frame, labels: labelsOf(f.seats) }
  }
  if (p.season && p.map) {
    const board = await boardOf(p.game, p.season, p.map, p.priv)
    if (board) return { board }
  }
  return null
}

/** Signed replay URLs for hover, once each: a card row carries none, so the first hover reads the
 *  match. */
const replays = new Map<string, Promise<string | null>>()
export function replayOf(id: string, priv: boolean) {
  const key = `${id}:${priv}`
  let r = replays.get(key)
  if (!r) {
    r = api
      .match(id, priv)
      .then((m) => m?.replay_url ?? null)
      .catch(() => {
        replays.delete(key)
        return null
      })
    replays.set(key, r)
  }
  return r
}

/** A match's last frame, for a page that draws one without a card (the maps page's hover). */
export function useFrame(id: string | null, priv: boolean): unknown {
  const [frame, setFrame] = useState<unknown>(null)
  useEffect(() => {
    if (!id) return
    let live = true
    void frameOf(id, priv).then((f) => {
      if (live) setFrame(f?.frame ?? null)
    })
    return () => {
      live = false
    }
  }, [id, priv])
  return id ? frame : null
}

