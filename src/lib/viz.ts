// The cartridge's viewer, as this application loads and feeds it: the module, the public surface
// of a mounted viewer, and the few things a card needs before it can draw (a match's last frame, a
// season's boards, a replay URL for a hover), each fetched once per page load.
//
// A REPLAY IS DRAWN BY THE ENGINE THAT PLAYED IT. The viewer re-simulates a match from its actions,
// so one built on another engine draws a plausible match that never happened, with no error. The
// image keeps the current viewer at /cartridges/<game>/ and every engine the ladder has played
// under /cartridges/<game>/engines/<hex>/, and engines.json says which is which (written by
// scripts/engines-index.mjs). loadVizFor() picks by the match's engine_digest and REFUSES one it
// does not hold (EngineNotBundled); it never falls back to another engine. A frame or a board is
// data the viewer draws without the component, so a card's resting picture takes the current one.
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

/** One module instance per viewer, so a page with two viewers on one engine decodes the component
 *  once. The import is by a literal path prefix so a bundler cannot follow it, and the prefix must
 *  stay IN THE TEMPLATE: Vite's dev server leaves `/cartridges/${…}` alone but tags a bare variable
 *  with `?import`, which public/ answers with a 500. */
const modules = new Map<string, Promise<VizModule>>()

/** Each viewer module's directory under /cartridges/, for its shell.js beside it (mountPoint). */
const moduleDirs = new WeakMap<VizModule, string>()

/** A module under /cartridges/, by its path there. */
function loadModule(path: string): Promise<VizModule> {
  let m = modules.get(path)
  if (!m) {
    m = (import(/* @vite-ignore */ `/cartridges/${path}`) as Promise<VizModule>).then((mod) => {
      moduleDirs.set(mod, path.slice(0, path.lastIndexOf('/')))
      return mod
    })
    // A REJECTION IS NOT AN ANSWER TO CACHE. Left in the map, one failed fetch makes every
    // later replay on the page report the viewer missing for as long as the tab is open.
    m.catch(() => modules.delete(path))
    modules.set(path, m)
  }
  return m
}

/** The game's current viewer: the engine the ladder plays now. What a card, a board and the seat
 *  colours are drawn with; a replay goes through loadVizFor(). */
export function loadViz(game: string): Promise<VizModule> {
  return loadModule(`${game}/viz.js`)
}

/** What the image holds for a game: the engine its current viewer is, and every engine kept by
 *  digest. `current` is null when the build could not tell. */
type Engines = { current: string | null; engines: string[] }
const indexes = new Map<string, Promise<Engines>>()
function enginesOf(game: string): Promise<Engines> {
  let e = indexes.get(game)
  if (!e) {
    e = fetch(`/cartridges/${game}/engines.json`).then((r) => {
      if (!r.ok) throw new Error(`engines.json answered ${r.status}`)
      return r.json() as Promise<Engines>
    })
    e.catch(() => indexes.delete(game))
    indexes.set(game, e)
  }
  return e
}

/** A match played on an engine whose viewer this site does not hold. Not a fault in the match:
 *  drawing it with another engine is what must not happen. */
export class EngineNotBundled extends Error {
  digest: string
  constructor(digest: string) {
    super(`no viewer for ${digest}`)
    this.digest = digest
  }
}

/** The viewer of the engine a match was played on: the current one when it is that engine, the one
 *  kept by its digest when it is an older one, and EngineNotBundled for any other. A match with no
 *  digest is drawn by the current viewer: Soma records the engine of every match that has a
 *  replay, so only an API from before the field sends one without. */
export async function loadVizFor(game: string, digest: string | null | undefined): Promise<VizModule> {
  if (!digest) return loadViz(game)
  const index = await enginesOf(game)
  if (digest === index.current) return loadViz(game)
  if (!index.engines.includes(digest)) throw new EngineNotBundled(digest)
  return loadModule(`${game}/engines/${digest.replace(/^sha256:/, '')}/viz.js`)
}

/** A viewer module's stylesheet writer (shell.js's), which every release has exported. */
type Shell = { injectCss?: (doc: unknown) => void }

/** Where a match's viewer mounts inside `host`, and how to take it down again.
 *
 *  EVERY RELEASE'S VIEWER INJECTS ITS STYLESHEET INTO THE DOCUMENT UNDER ONE ID (`tb-viz-style`),
 *  and the first one in wins, so two engines' viewers on one page would share one engine's
 *  stylesheet: a season-1 match page would draw its rail's tiles, or its stage's seat colours,
 *  with the other engine's rules. So the current viewer's stylesheet is put in the document first,
 *  and an older engine's viewer mounts in a shadow root of the host that holds ITS stylesheet,
 *  written there by its own injectCss. The tokens it reads are custom properties, which inherit
 *  into the shadow root. Nothing here writes a rule of the viewer's. */
export async function mountPoint(game: string, viz: VizModule, host: HTMLElement): Promise<{ target: HTMLElement; clear: () => void }> {
  const current = await loadViz(game).catch(() => null)
  if (viz === current) {
    // A host that once held an older engine's viewer shows its own children again.
    host.shadowRoot?.replaceChildren(host.ownerDocument.createElement('slot'))
    return { target: host, clear: () => host.replaceChildren() }
  }
  const doc = host.ownerDocument
  const shellOf = (dir: string) => loadModule(`${dir}/shell.js`) as unknown as Promise<Shell>
  const mine = (await shellOf(game).catch(() => null))?.injectCss
  mine?.(doc)
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
  shadow.replaceChildren()
  const dir = moduleDirs.get(viz)
  const theirs = dir ? (await shellOf(dir).catch(() => null))?.injectCss : undefined
  // injectCss(doc) asks the document for its id, makes a <style> and appends it to the head: the
  // shadow root answers the first and is the head, so the stylesheet lands inside it.
  theirs?.({ getElementById: (id: string) => shadow.getElementById(id), createElement: (tag: string) => doc.createElement(tag), head: shadow })
  const target = doc.createElement('div')
  shadow.appendChild(target)
  return { target, clear: () => shadow.replaceChildren() }
}

/** Whether the current viewer is the engine that played a match, which a card's hover asks before
 *  it plays a replay on the Tile the current viewer drew. Unknown is no. */
export async function onCurrentEngine(game: string, digest: string | null | undefined): Promise<boolean> {
  if (!digest) return true
  return enginesOf(game).then(
    (index) => index.current === digest,
    () => false,
  )
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

/** Signed replay URLs for hover, once each, with the engine that played the match: a card row
 *  carries neither, so the first hover reads the match. */
const replays = new Map<string, Promise<{ url: string; digest: string | null } | null>>()
export function replayOf(id: string, priv: boolean) {
  const key = `${id}:${priv}`
  let r = replays.get(key)
  if (!r) {
    r = api
      .match(id, priv)
      .then((m) => (m?.replay_url ? { url: m.replay_url, digest: m.engine_digest } : null))
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

