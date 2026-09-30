// `/admin/seasons` — admin session only. The one link to it is the Admin group of an administrator's
// account menu, so the page still has to introduce itself.
//
// A DESK, NOT A DOCUMENT. One season at a time — the one the header's switcher selects, which is
// the live one unless another is chosen — drawn as a strip that says where it stands, then its maps
// and its baselines side by side. The page is a FIXED HEIGHT and each list scrolls inside its own
// panel, so a season of forty boards and a dozen baselines is one screen, not a scroll past one
// list to reach the other. Creating a season is a form an admin fills in a few times a year, so it
// is a page of its own (`/admin/seasons/new`) behind a button.
//
// The panels and the strip's sheets are components/SeasonPanels.tsx, which the season admin's own
// desk (`/season-admin`) draws too; that desk is where a season's people, runners, notices and log
// are, and the strip links to it. Every season a platform admin may see is on the switcher, the
// private ones included, because the seasons are read through the member's route once signed in.
//
// TWO OPERATIONS ON THE SEASON ITSELF, and they are not symmetrical. Moving a scheduled season's
// dates is a form. Closing one is a REQUEST, because it settles every rating and freezes every
// standing and cannot be undone — so the strip makes you type the season's slug rather than click
// a red button by accident.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, type Season } from '../api'
import { usePlatform } from '../providers/platform-context'
import { seasonDeskPath } from '../lib/paths'
import { useSession } from '../providers/session-context'
import { useSelection } from '../lib/selection'
import { num } from '../lib/format'
import { cx } from '../lib/cx'
import { Shell } from '../components/Shell'
import { Badge, Icon, IconLabel, Loading, Notice, PageHeader, PagePlaceholder, Panel, Rich, Select } from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import { SeasonBadge, SeasonEntryBadge } from '../components/Model'
import { BaselinesPanel, CloseSheet, DatesSheet, MapsPanel, MemorySheet } from '../components/SeasonPanels'
import { InlineError, AdminGate, NotFound } from '../components/ErrorStates'
import { fill, lookup } from '../lib/copy'
import T from '../../copy/admin-seasons.json'
import common from '../../copy/common.json'

export default function SeasonsAdmin() {
  const { me, session } = useSession()

  if (session.state === 'loading') {
    return (
      <Shell title={T.tab}>
        <PagePlaceholder label={common.site.checkingSession} />
      </Shell>
    )
  }

  // Gated here as a courtesy, not as the control: Soma answers 403 to a non-admin whatever this
  // page renders, and that is what actually protects the operations.
  if (!me || me.role !== 'admin') {
    return (
      <Shell title={T.tab}>
        <AdminGate signedIn={Boolean(me)} />
      </Shell>
    )
  }

  return <Desk />
}

function Desk() {
  const { slug: game, gameName, season: resolved, seasons, seasonsLoading, seasonsError, seasonMissing, reload } = usePlatform()
  const { href } = useSelection()
  // THE SEASON ON SCREEN OUTLIVES A RELOAD OF THE SEASONS. Moving the dates or requesting a close
  // re-reads them, and while that runs the platform has no season -- which would unmount the desk,
  // and with it the sheet saying what just happened. React's own pattern for state that follows a
  // value: set during render, compared first, so it settles in one extra pass.
  const [kept, setKept] = useState<Season | null>(resolved)
  if (resolved !== null && resolved !== kept) setKept(resolved)
  const season = resolved ?? (seasonsLoading ? kept : null)

  if (seasonMissing) {
    return (
      <Shell title={common.errors.tabNotFound}>
        <NotFound kind="season" />
      </Shell>
    )
  }

  return (
    <Shell title={T.tab} scoped>
      <PageHeader
        crumbs={[{ label: common.admin.crumb, to: '/admin/seasons' }, { label: T.header.crumb }]}
        title={T.header.title}
        badges={<Badge tone="info">{common.admin.badge}</Badge>}
        actions={
          <Link className="btn primary" to={href('/admin/seasons/new')}>
            <IconLabel icon="i-plus">{T.header.newSeason}</IconLabel>
          </Link>
        }
      >
        <AdminTabs current="seasons" />
      </PageHeader>

      <div className="wrap page-body">
        {season === null ? (
          seasonsLoading ? (
            <Loading rows={4} label={T.loading} />
          ) : seasonsError ? (
            <InlineError error={seasonsError} what={T.what} />
          ) : (
            <Notice tone="info" title={fill(T.none.title, { game: gameName })}>
              <p>
                <Rich text={T.none.body} />
              </p>
            </Notice>
          )
        ) : (
          <div className="desk">
            <SeasonStrip key={`strip-${season.slug}`} game={game} season={season} seasons={seasons} onDone={reload} />
            <div className="desk-lists">
              {/* Neither list reloads the seasons: a flip or an upload changes nothing the header or
                  the strip draws, and the seasons' reload blanks the desk while it runs. */}
              <MapsPanel key={`maps-${season.slug}`} game={game} season={season} />
              <BaselinesPanel key={`baselines-${season.slug}`} game={game} season={season} />
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}

// ---- the season ------------------------------------------------------------------------------

const dayMonthYear = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Which season, where it stands, and the operations on it. The picker is the header's switcher
 *  again, here where the admin is looking; both write the same `?season=`. */
function SeasonStrip({ game, season, seasons, onDone }: { game: string; season: Season; seasons: Season[]; onDone: () => void }) {
  const { setSeason } = useSelection()
  const [sheet, setSheet] = useState<'dates' | 'memory' | 'close' | null>(null)
  const open = season.state === 'open' || season.state === 'settling'
  const canClose = open && season.close_requested_at === null

  return (
    <Panel className="desk-strip">
      <div className="strip-row">
        <Select
          look="pick"
          prefix={T.strip.season}
          label={T.strip.season}
          value={season.slug}
          options={seasons.map((s) => ({
            value: s.slug,
            label: s.name,
            hint: s.visibility === 'private' ? fill(T.strip.privateHint, { state: s.state === 'closed' ? T.strip.final : s.state }) : s.state === 'closed' ? T.strip.final : s.state,
          }))}
          onChange={(slug) => setSeason(slug)}
        />
        <SeasonBadge state={season.state} />
        <SeasonEntryBadge visibility={season.visibility} entry={season.entry} />
        <Featured game={game} season={season} />
        <Restrict game={game} season={season} onDone={onDone} />
        <span className="strip-fact" title={T.strip.window}>
          <Icon id="i-calendar" />
          {dayMonthYear(season.submissions_open_at)} → {dayMonthYear(season.closed_at ?? season.submissions_close_at)}
        </span>
        <span className="strip-fact" title={T.strip.entered}>
          <Icon id="i-flask" label={T.strip.entered} />
          {num(season.entered_versions)}
        </span>
        <span className="strip-fact" title={T.strip.played}>
          <Icon id="i-matches" label={T.strip.played} />
          {num(season.matches_played)}
        </span>
        <div className="strip-actions">
          {season.state === 'scheduled' ? (
            <button className={cx('btn sm', sheet === 'dates' && 'on')} type="button" onClick={() => setSheet(sheet === 'dates' ? null : 'dates')}>
              <IconLabel icon="i-calendar">{T.strip.moveDates}</IconLabel>
            </button>
          ) : null}
          {season.state === 'scheduled' ? (
            <button className={cx('btn sm', sheet === 'memory' && 'on')} type="button" onClick={() => setSheet(sheet === 'memory' ? null : 'memory')}>
              {T.strip.memory}
            </button>
          ) : null}
          {canClose ? (
            <button className={cx('btn sm danger', sheet === 'close' && 'on')} type="button" onClick={() => setSheet(sheet === 'close' ? null : 'close')}>
              {T.strip.close}
            </button>
          ) : null}
          {open && !canClose ? <Badge tone="wait">{T.strip.closeRequested}</Badge> : null}
          {/* Its people, runners, notices and log: the season's own desk, which its admins share. */}
          <Link className="btn sm" to={seasonDeskPath({ game, season: season.slug })}>
            <IconLabel icon="i-shield">{T.strip.seasonDesk}</IconLabel>
          </Link>
          {/* The finals, the score resets and the idle fill: a page of their own. */}
          <Link className="btn sm" to={`/admin/seasons/rounds?season=${season.slug}`}>
            <IconLabel icon="i-trophy">{T.strip.rounds}</IconLabel>
          </Link>
          <Link className="btn sm" to={`/leaderboard?season=${season.slug}`}>
            <IconLabel icon="i-leaderboard">{season.state === 'closed' ? T.strip.finalStandings : T.strip.standings}</IconLabel>
          </Link>
        </div>
      </div>
      {sheet === 'dates' ? <DatesSheet season={season} game={game} onDone={onDone} /> : null}
      {sheet === 'memory' ? <MemorySheet season={season} game={game} onDone={onDone} /> : null}
      {sheet === 'close' ? <CloseSheet season={season} game={game} onDone={onDone} /> : null}
    </Panel>
  )
}

/** The season a game shows when nobody picked one. Only a public season can be; making one so moves
 *  every "no season" read on the site, so it is a click the admin makes on purpose. */
function Featured({ game, season }: { game: string; season: Season }) {
  const { game: g, reload } = usePlatform()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (g?.season?.slug === season.slug) return <Badge tone="ok">{T.strip.featured}</Badge>
  if (season.visibility !== 'public' || season.state === 'closed') return null
  const feature = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.featureSeason(game, season.slug)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? (lookup(T.strip.featureSaid, err.code) ?? err.message) : T.refusals.unsent)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button className="btn sm" type="button" disabled={busy} onClick={() => void feature()} title={T.strip.featureTitle}>
        {T.strip.feature}
      </button>
      {error ? <span className="form-error">{error}</span> : null}
    </>
  )
}

/** THE ONE EDIT VISIBILITY OR ENTRY TAKES AFTER A SEASON IS CREATED, and it goes one way: a
 *  scheduled season's entry narrows from open to its participants. It never widens back (that would
 *  publish a cohort's season to everyone who can see it) and visibility never changes at all, so
 *  there is no control for either of those anywhere. It is gone the moment the season opens, because
 *  by then competitors have submitted under the entry they read. Confirmed, not a bare click: a
 *  season nobody has been added to yet admits nobody. */
function Restrict({ game, season, onDone }: { game: string; season: Season; onDone: () => void }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (season.state !== 'scheduled' || season.entry !== 'open') return null
  const restrict = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.restrictSeasonEntry(game, season.slug)
      setAsking(false)
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? (lookup(T.strip.restrictSaid, err.code) ?? err.message) : T.refusals.unsent)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button className={cx('btn sm', asking && 'on')} type="button" onClick={() => setAsking(!asking)} title={T.strip.restrictTitle}>
        {T.strip.restrict}
      </button>
      {asking ? (
        <Notice tone="warn" title={T.strip.restrictAsk}>
          <p>{T.strip.restrictBody}</p>
          <div className="row">
            <button className="btn sm primary" type="button" disabled={busy} onClick={() => void restrict()}>
              {busy ? T.strip.restricting : T.strip.restrictDo}
            </button>
            <button className="btn sm" type="button" onClick={() => setAsking(false)}>
              {T.strip.restrictCancel}
            </button>
          </div>
        </Notice>
      ) : null}
      {error ? <span className="form-error">{error}</span> : null}
    </>
  )
}
