// The season's catalogue: every public match, as cards to pick by their picture or as the dense rows
// with day headings, filtered and sorted from a sticky row whose every setting is in the address.
//
// Rules that are not obvious from the code:
// - THE LIST NEVER SHIFTS UNDER THE READER. Pages are appended as the reader nears the bottom (and
//   by Load more); new matches are only counted, by polling the first page with `since` the newest
//   one shown, and join the top when the reader asks through the pill. Only Newest is polled: the
//   other sorts rank, so "new" means nothing to them.
// - Mine is the public list's owner filter with the reader's handle, so it combines with every other
//   filter. The public list holds finished matches alone; the owner's queued ones come from their
//   own route, first page only, and sit above the grid for them alone.
// - Each sort pages by its own cursor, so a change of any setting starts the list again.

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, type MatchFilters, type MatchList as MatchPage, type MatchSort, type MatchSummary } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useSelection, useQueryState } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { num } from '../lib/format'
import { count, fill, lookup } from '../lib/copy'
import { Shell } from '../components/Shell'
import { CardGrid, CardSkeletons, MatchCard } from '../components/MatchCard'
import { MatchList } from '../components/MatchRow'
import { InlineError } from '../components/ErrorStates'
import { AskForHelp } from '../components/Help'
import { EmptyState, Icon, PageHeader, Panel, Rich, Segmented, Select, Skel, type Option } from '../components/ui'
import { useSeasonWall } from '../components/SeasonWall'
import T from '../../copy/matches.json'

const PAGE = 30
const POLL_MS = 30_000
const F = T.filters
/** The filters Clear resets. `class` has no control of its own any more (the Ladder chip holds the
 *  classes), but an old link may still carry it. */
const FILTERS = ['players', 'ladder', 'class', 'map', 'outcome'] as const
const PLAYERS: Record<string, [number, number]> = { '2': [2, 2], '3-4': [3, 4], '5-8': [5, 8] }
const OUTCOMES = ['decided', 'drawn', 'dq'] as const
const SORTS: MatchSort[] = ['newest', 'closest', 'upset', 'longest', 'discussed']
const SIZES = ['tiny', 'small', 'medium', 'large', 'xlarge'] as const
const WAITING = new Set<MatchSummary['status']>(['pending', 'claimed', 'running'])
const VIEW_KEY = 'tb.matches.view'

type View = 'grid' | 'list'
type Scope = 'model' | 'version' | 'owner'

export default function Matches() {
  const { season, live, slug, gameName, scope: reads } = usePlatform()
  const { href, season: wanted } = useSelection()
  const { me, session } = useSession()
  const [param, setParam] = useQueryState()
  const classes = useWeightClasses()

  const mine = Boolean(me) && param('mine') === '1'
  const [players, ladder, klass, map, rawOutcome] = FILTERS.map(param)
  const outcome = (OUTCOMES as readonly string[]).includes(rawOutcome) ? (rawOutcome as MatchFilters['outcome']) : null
  const sort: MatchSort = SORTS.includes(param('sort') as MatchSort) ? (param('sort') as MatchSort) : 'newest'
  const filtered = FILTERS.some((k) => param(k))
  // Narrowed from another page: one model's, one version's or one person's matches. Mine is the
  // owner filter too, so while it is on the owner chip gives way to it.
  const scope = (['model', 'version', 'owner'] as const).find((k) => param(k) && !(k === 'owner' && mine))
  const setFilter = setParam
  const clear = () => setFilter({ ...Object.fromEntries(FILTERS.map((k) => [k, ''])), mine: '' })

  const [pmin, pmax] = PLAYERS[players] ?? [null, null]
  const filters: MatchFilters = {
    model: param('model') || null,
    version: param('version') || null,
    owner: mine && me ? me.handle : param('owner') || null,
    game: slug,
    season: wanted,
    ladder: ladder || null,
    class: klass || null,
    map: map || null,
    outcome,
    players_min: pmin,
    players_max: pmax,
    sort: sort === 'newest' ? null : sort,
    limit: PAGE,
  }
  const key = `mx:${reads.priv ? 'member:' : ''}${JSON.stringify(filters)}`
  // A link to ?mine=1 waits for the session rather than reading everyone's matches first, and a
  // named season waits to resolve, so a private one is never asked of the public route.
  const ready = !(param('mine') === '1' && session.state === 'loading') && reads.ready
  const feed = useFeed(key, (cursor) => api.matches({ ...filters, cursor }, reads.priv), ready)
  const fresh = useFresh(feed, sort === 'newest' && ready, (since) => api.matches({ ...filters, since, cursor: null }, reads.priv))

  // The owner's queued matches: their route spans seasons and every state, so it is narrowed here
  // to this season, the settings a queued match can answer, and the states before a result.
  const [tick, setTick] = useState(0)
  const queued = useApi(`mx-q:${slug}:${me?.handle ?? ''}:${tick}`, () => api.myMatches({ game: slug, limit: PAGE }), mine && sort === 'newest')
  const waiting =
    mine && sort === 'newest' && !outcome && queued.data
      ? queued.data.matches.filter(
          (m) =>
            WAITING.has(m.status) &&
            m.season === season?.slug &&
            (pmin === null || (m.seats.length >= pmin && m.seats.length <= (pmax ?? 8))) &&
            // One rated ladder: every match counts on Open, and a class chip means a seat of that
            // class (mirrors the server's ?ladder= filter), since m.ladders is now always [open].
            (!ladder || ladder === 'open' || m.seats.some((s) => s.class === ladder)) &&
            (!klass || m.seats.some((s) => s.class === klass)) &&
            (!map || m.map === map) &&
            (!filters.model || m.seats.some((s) => s.model_id === filters.model)) &&
            (!filters.version || m.seats.some((s) => s.version_id === filters.version)),
        )
      : []

  // Every board the season has, disabled ones included: matches were played on them, and a board
  // taken out of play is still one somebody wants to find their matches on.
  const boards = useApi(`mx-maps:${reads.key}:${season?.slug ?? ''}`, () => api.seasonMaps(slug, season!.slug, { priv: reads.priv }), Boolean(season))
  // Playing now has its own uncached route; it is re-read with the same tick as the queued rows.
  const playingNow = useApi(`mx-playing:${reads.key}:${season?.slug ?? ''}:${tick}`, () => api.playing(slug, season!.slug, reads.priv), Boolean(season))
  const wall = useSeasonWall()
  const boardOptions: Option[] = [
    { value: '', label: F.any },
    ...[...(boards.data?.maps ?? [])]
      .sort((a, b) => sizeRank(a.size) - sizeRank(b.size) || a.players - b.players || a.map_id.localeCompare(b.map_id))
      .map((b) => ({
        value: b.map_id,
        label: b.map_id,
        group: sizeWord(b.size),
        hint: fill(b.enabled ? F.board.hint : F.board.hintOff, { n: b.players }),
      })),
  ]
  const ladderOptions: Option[] = [
    { value: '', label: F.any },
    { value: 'open', label: F.ladder.open },
    ...classes.map((c) => ({ value: c.class, label: c.class })),
  ]
  const sortOptions: Option[] = SORTS.map((s) => ({ value: s === 'newest' ? '' : s, label: F.sort[s] }))

  const [view, setView] = useView(param('view'), (v) => setParam({ view: v === 'list' ? 'list' : '' }))

  const all = [...waiting, ...feed.matches]
  const scopeLabel = scope ? scopeName(scope, param(scope), all) : null
  const anySet = filtered || mine

  // The next page starts loading as the reader nears the bottom. Re-observed whenever the list grows,
  // because an observer only speaks when the sentinel crosses the margin, and one that is still in
  // it after a short page would never speak again.
  const sentinel = useRef<HTMLDivElement>(null)
  const canMore = feed.state === 'ready' && feed.next !== null && feed.more === 'idle'
  const { more } = feed
  const loadMore = feed.loadMore
  useEffect(() => {
    const el = sentinel.current
    if (!el || !canMore || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), { rootMargin: '0px 0px 900px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [canMore, loadMore, feed.matches.length])

  if (wall) return wall

  const takeFresh = () => {
    if (!fresh) return
    if (fresh.n <= fresh.matches.length) feed.prepend(fresh.matches)
    else feed.restart()
    fresh.dismiss()
    setTick((t) => t + 1)
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' })
  }

  const total =
    feed.total === null ? null : feed.capped ? fill(T.totalCapped, { n: num(feed.total) }) : count(T.total, feed.total, { n: num(feed.total) })
  const playing = playingNow.data?.playing ?? 0

  const empty = filtered ? (
    <Rich
      text={T.empty.filtered}
      vars={{
        clear: (
          <button className="btn sm" type="button" onClick={clear}>
            {T.empty.clear}
          </button>
        ),
      }}
    />
  ) : mine ? (
    T.empty.mine
  ) : scope ? (
    T.empty.scoped
  ) : (
    T.empty.none
  )

  return (
    <Shell nav="matches" scoped title={T.title}>
      <PageHeader
        crumbs={[{ label: season ? `${gameName} · ${season.name}` : gameName, to: href('/') }, { label: T.title, icon: 'i-matches' }]}
        title={live || !season ? T.title : fill(T.titleSeason, { season: season.name })}
        icon="i-matches"
        badges={
          <span className="mx-counts">
            {feed.state === 'loading' ? <Skel w={90} /> : total !== null ? <span className="mx-total">{total}</span> : null}
            {playing > 0 ? (
              <span className="mx-playing" title={T.playingTip}>
                <Icon id="i-live" />
                {fill(T.playing, { n: num(playing) })}
              </span>
            ) : null}
          </span>
        }
      />
      <div className="wrap page-body stack mx-body">
        <div className="mx-bar">
          <div className="mx-filters" role="group" aria-label={F.label}>
            <span className="mx-flabel" aria-hidden="true">
              {F.players.label}
            </span>
            <Segmented
              label={F.players.label}
              value={players in PLAYERS ? players : 'any'}
              onChange={(k) => setFilter({ players: k === 'any' ? '' : k })}
              items={[
                { key: 'any', label: F.any },
                { key: '2', label: F.players.two },
                { key: '3-4', label: F.players.threeToFour },
                { key: '5-8', label: F.players.fiveToEight },
              ]}
            />
            <Select look="pick" prefix={F.ladder.label} label={F.ladder.label} value={ladder} options={ladderOptions} onChange={(v) => setFilter({ ladder: v })} />
            <Select look="pick" prefix={F.board.label} label={F.board.label} value={map} options={boardOptions} onChange={(v) => setFilter({ map: v })} />
            <span className="mx-flabel" aria-hidden="true">
              {F.outcome.label}
            </span>
            <Segmented
              label={F.outcome.label}
              value={outcome ?? 'any'}
              onChange={(k) => setFilter({ outcome: k === 'any' ? '' : k })}
              items={[
                { key: 'any', label: F.any },
                { key: 'decided', label: F.outcome.decided },
                { key: 'drawn', label: F.outcome.drawn },
                { key: 'dq', label: F.outcome.dq },
              ]}
            />
            {me ? (
              <button className="mx-chip" type="button" aria-pressed={mine} title={F.mineTip} onClick={() => setFilter({ mine: mine ? '' : '1' })}>
                <Icon id="i-user" />
                {F.mine}
              </button>
            ) : null}
            <Select look="pick" prefix={F.sort.label} label={F.sort.label} value={sort === 'newest' ? '' : sort} options={sortOptions} onChange={(v) => setFilter({ sort: v })} />
            {scope && scopeLabel ? (
              <span className="mx-scope">
                {scopeLabel}
                <button className="icon-btn" type="button" aria-label={T.scope.stop[scope]} title={T.scope.stop[scope]} onClick={() => setParam({ [scope]: '' })}>
                  <Icon id="i-x" />
                </button>
              </span>
            ) : null}
            {anySet ? (
              <button className="btn sm ghost" type="button" onClick={clear}>
                <Icon id="i-x" />
                {F.clear}
              </button>
            ) : null}
            <div className="mx-view">
              <Segmented
                label={T.view.label}
                value={view}
                onChange={(k) => setView(k === 'list' ? 'list' : 'grid')}
                items={[
                  { key: 'grid', icon: 'i-grid', title: T.view.grid, label: <span className="vis-hidden">{T.view.grid}</span> },
                  { key: 'list', icon: 'i-list', title: T.view.list, label: <span className="vis-hidden">{T.view.list}</span> },
                ]}
              />
            </div>
          </div>
          {fresh && fresh.n > 0 ? (
            <button className="mx-fresh" type="button" onClick={takeFresh}>
              <Icon id="i-up" />
              {count(T.fresh, fresh.n, { n: num(fresh.n) })}
            </button>
          ) : null}
        </div>

        {feed.error ? (
          <FeedError error={feed.error} onClear={anySet ? clear : null} />
        ) : feed.state === 'ready' && all.length === 0 ? (
          <EmptyState boxed>{empty}</EmptyState>
        ) : view === 'grid' ? (
          <CardGrid>
            {feed.state === 'loading' ? (
              <CardSkeletons n={PAGE} />
            ) : (
              all.map((m) => <MatchCard m={m} via="grid" chip={sort === 'upset' ? 'upset' : 'comments'} key={m.id} />)
            )}
            {more === 'loading' ? <CardSkeletons n={6} /> : null}
          </CardGrid>
        ) : (
          <Panel className="mx-list">
            <MatchList
              state={feed.state === 'loading' ? 'loading' : 'ready'}
              matches={all}
              grouped={sort === 'newest'}
              you={me?.handle}
              loadingRows={12}
              empty={empty}
            />
          </Panel>
        )}

        {feed.state === 'ready' && feed.next !== null ? (
          <div className="mx-more" ref={sentinel}>
            {more === 'error' ? (
              <p className="mx-more-error" role="alert">
                <Rich
                  text={T.moreError}
                  vars={{
                    retry: (
                      <button className="btn sm" type="button" onClick={loadMore}>
                        {T.retry}
                      </button>
                    ),
                  }}
                />
              </p>
            ) : (
              <button className="btn" type="button" onClick={loadMore} disabled={more === 'loading'}>
                {more === 'loading' ? T.loadingMore : T.more}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </Shell>
  )
}

/** The first page failing: a refusal as its sentence, anything else as the list that did not load. */
function FeedError({ error, onClear }: { error: ApiError; onClear: (() => void) | null }) {
  const said = error.status === 400 ? lookup(T.refusals, error.code) : undefined
  return (
    <div className="stack tight">
      {said ? (
        <EmptyState boxed>
          {said}{' '}
          {onClear ? (
            <button className="btn sm" type="button" onClick={onClear}>
              {T.empty.clear}
            </button>
          ) : null}
        </EmptyState>
      ) : (
        <InlineError error={error} what={T.error} />
      )}
      <AskForHelp />
    </div>
  )
}

// ---- the feed: first page, appended pages, prepended new ones ------------------------------------

type Feed = {
  key: string
  state: 'loading' | 'ready' | 'error'
  error: ApiError | null
  matches: MatchSummary[]
  next: string | null
  total: number | null
  capped: boolean
  more: 'idle' | 'loading' | 'error'
}

const blank = (key: string): Feed => ({ key, state: 'loading', error: null, matches: [], next: null, total: null, capped: false, more: 'idle' })

/** Ids already held are dropped, so a match that moved between pages is never drawn twice. */
function merge(head: MatchSummary[], tail: MatchSummary[]): MatchSummary[] {
  const seen = new Set<string>()
  return [...head, ...tail].filter((m) => !seen.has(m.id) && Boolean(seen.add(m.id)))
}

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, 'unknown', err instanceof Error ? err.message : String(err))
}

/** `useApi` for a list that grows: `key` alone decides when it starts again, as there. */
function useFeed(key: string, load: (cursor: string | null) => Promise<MatchPage>, enabled: boolean) {
  const [feed, setFeed] = useState<Feed>(() => blank(key))
  const [nonce, setNonce] = useState(0)
  const latest = useRef(load)
  const current = useRef(feed)
  const busy = useRef(false)
  useEffect(() => {
    latest.current = load
    current.current = feed
  })

  useEffect(() => {
    if (!enabled) return
    let live = true
    // oxlint-disable-next-line react/set-state-in-effect
    setFeed(blank(key))
    latest.current(null).then(
      (page) => {
        if (live)
          setFeed({
            key,
            state: 'ready',
            error: null,
            matches: page.matches,
            next: page.next_cursor,
            total: page.total,
            capped: Boolean(page.total_capped),
            more: 'idle',
          })
      },
      (err: unknown) => {
        if (live) setFeed({ ...blank(key), state: 'error', error: asApiError(err) })
      },
    )
    return () => {
      live = false
    }
  }, [key, enabled, nonce])

  const loadMore = useCallback(() => {
    const f = current.current
    if (busy.current || f.state !== 'ready' || !f.next) return
    busy.current = true
    const k = f.key
    setFeed((x) => (x.key === k ? { ...x, more: 'loading' } : x))
    latest
      .current(f.next)
      .then(
        (page) => setFeed((x) => (x.key === k ? { ...x, matches: merge(x.matches, page.matches), next: page.next_cursor, more: 'idle' } : x)),
        () => setFeed((x) => (x.key === k ? { ...x, more: 'error' } : x)),
      )
      .finally(() => {
        busy.current = false
      })
  }, [])

  const prepend = useCallback((fresh: MatchSummary[]) => {
    setFeed((x) => {
      const matches = merge(fresh, x.matches)
      const added = matches.length - x.matches.length
      return { ...x, matches, total: x.total === null ? null : x.total + added }
    })
  }, [])
  const restart = useCallback(() => setNonce((n) => n + 1), [])

  // A render between a new key and its effect would otherwise draw the old list under new filters.
  const shown = feed.key === key ? feed : blank(key)
  return { ...shown, current, loadMore, prepend, restart }
}

/** Every 30 s while the tab is visible: how many matches finished since the newest one shown, and
 *  the first page of them. Nothing is drawn from it until the reader takes them. */
function useFresh(
  feed: ReturnType<typeof useFeed>,
  enabled: boolean,
  poll: (since: string | null) => Promise<MatchPage>,
): { n: number; matches: MatchSummary[]; dismiss: () => void } | null {
  const [found, setFound] = useState<{ key: string; n: number; matches: MatchSummary[] } | null>(null)
  const latest = useRef(poll)
  useEffect(() => {
    latest.current = poll
  })
  const { key, state, current } = feed

  useEffect(() => {
    if (!enabled || state !== 'ready') return
    let live = true
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const since = current.current.matches.find((m) => m.played_at)?.played_at ?? null
      latest.current(since).then(
        (page) => {
          const f = current.current
          if (!live || f.key !== key) return
          const held = new Set(f.matches.map((m) => m.id))
          const matches = page.matches.filter((m) => !held.has(m.id))
          // `total` counts every match at or after `since`, the ones already shown at that instant too.
          const n = Math.max(0, (page.total ?? page.matches.length) - (page.matches.length - matches.length))
          setFound(n > 0 ? { key, n, matches } : null)
        },
        () => {
          // A missed poll is the next one's to catch; the list is still right as far as it goes.
        },
      )
    }, POLL_MS)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [enabled, state, key, current])

  const dismiss = useCallback(() => setFound(null), [])
  return found && found.key === key && enabled ? { n: found.n, matches: found.matches, dismiss } : null
}

// ---- small helpers -------------------------------------------------------------------------------

function storedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

/** The address wins, then what this browser last chose. Choosing writes both. */
function useView(asked: string, write: (v: View) => void): [View, (v: View) => void] {
  const [remembered, setRemembered] = useState<View>(storedView)
  const view: View = asked === 'list' ? 'list' : asked === 'grid' ? 'grid' : remembered
  const set = (v: View) => {
    setRemembered(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // Not remembering is a smaller failure than not switching.
    }
    write(v)
  }
  return [view, set]
}

function sizeRank(size: string | null): number {
  const i = (SIZES as readonly string[]).indexOf(size ?? '')
  return i < 0 ? SIZES.length : i
}

function sizeWord(size: string | null): string {
  return size && (SIZES as readonly string[]).includes(size) ? F.board.sizes[size as (typeof SIZES)[number]] : F.board.sizes.other
}

/** The scope chip's words, named from the matches in hand: the list carries the names, so asking
 *  for the model or the version again would be a request for what is already here. */
function scopeName(scope: Scope, id: string, matches: MatchSummary[]): string {
  if (scope === 'owner') return fill(T.scope.owner, { handle: id })
  const seats = matches.flatMap((m) => m.seats)
  if (scope === 'model') {
    const s = seats.find((x) => x.model_id === id)
    return s ? fill(T.scope.model, { name: s.model }) : T.scope.fallback.model
  }
  const s = seats.find((x) => x.version_id === id)
  return s ? fill(T.scope.version, { name: s.model, v: s.version }) : T.scope.fallback.version
}
