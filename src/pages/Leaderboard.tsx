// The ladder: every active version ranked by rating, as a table or as size against rating.
// Every control — the ladder, the view, hidden baselines, the page — lives in the address, so a
// view is a link somebody can send.

import { Link } from 'react-router-dom'
import { api } from '../api'
import { useApi } from '../lib/useApi'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { useSelection, useQueryState } from '../lib/selection'
import { useSession } from '../providers/session-context'
import { useLadderHeads } from '../lib/useLadderHeads'
import { num } from '../lib/format'
import { versionPath } from '../lib/paths'
import { Shell } from '../components/Shell'
import { DataTable, Icon, PageHeader, Pagination, Panel, PanelBody, PanelFoot, PanelHead, Rich, Section, Segmented } from '../components/ui'
import { SeasonBadge } from '../components/Model'
import { ladderColumns, ladderEmpty } from '../components/LadderTable'
import { LadderTabs } from '../components/LadderTabs'
import { SizeRatingPlot } from '../components/SizeRatingPlot'
import { Champions } from '../components/Champions'
import { InlineError } from '../components/ErrorStates'
import { fill } from '../lib/copy'
import T from '../../copy/leaderboard.json'

const PAGE = 50

export default function Leaderboard() {
  const { live, slug, season, gameName } = usePlatform()
  const { href, season: wanted } = useSelection()
  const { me } = useSession()
  const classes = useWeightClasses()
  const [param, setParam] = useQueryState()
  const ladder = param('ladder') || 'open'
  const hide = param('baselines') === 'hidden'
  const plot = param('view') === 'plot'
  const cursor = param('cursor') || null

  const board = useApi(`lb:${slug}:${wanted}:${ladder}:${cursor}`, () => api.leaderboard(slug, { ladder, season: wanted, limit: PAGE, cursor }))
  const heads = useLadderHeads(slug, wanted, classes)
  const entries = board.data?.entries ?? []
  const rows = hide ? entries.filter((r) => !r.baseline) : entries
  const title = live || !season ? T.title : T.titleFinal
  const yours = me ? entries.find((r) => r.owner === me.handle) : undefined

  return (
    <Shell nav="leaderboard" scoped title={ladder === 'open' ? title : fill(live || !season ? T.tabClass : T.tabClassFinal, { ladder })}>
      <PageHeader
        crumbs={[{ label: season ? `${gameName} · ${season.name}` : gameName, to: href('/') }, { label: title, icon: 'i-leaderboard' }]}
        title={title}
        icon="i-leaderboard"
        badges={season && !live ? <SeasonBadge state={season.state} /> : null}
        actions={
          yours ? (
            <Link className="btn sm" to={versionPath(yours.model_id, yours.version)}>
              {fill(T.yourBest, { rank: yours.rank })}
            </Link>
          ) : null
        }
        sub={<Rich text={T.sub} />}
      />
      <div className="wrap page-body stack">
        {season && !live && classes.length && ladder === 'open' ? (
          <Section title={T.champions}>
            <Champions classes={classes} heads={heads.byLadder} state={heads.state} hrefFor={(l) => href('/leaderboard', { ladder: l })} />
          </Section>
        ) : null}
        <Panel>
          <PanelHead
            title={
              <LadderTabs
                classes={classes}
                value={ladder}
                heads={heads.byLadder}
                hrefFor={(l) => href('/leaderboard', { ladder: l === 'open' ? null : l, view: plot ? 'plot' : null, baselines: hide ? 'hidden' : null })}
              />
            }
            end={
              <>
                <button
                  className={hide ? 'btn sm' : 'btn sm ghost'}
                  type="button"
                  aria-pressed={hide}
                  onClick={() => setParam({ baselines: hide ? '' : 'hidden' })}
                >
                  <Icon id="i-anchor" />
                  {hide ? T.baselines.hidden : T.baselines.hide}
                </button>
                <Segmented
                  label={T.view.label}
                  value={plot ? 'plot' : 'table'}
                  onChange={(v) => setParam({ view: v === 'plot' ? 'plot' : '' })}
                  items={[
                    { key: 'table', label: T.view.table, icon: 'i-table' },
                    { key: 'plot', label: T.view.plot, icon: 'i-scatter', title: T.view.plotTitle },
                  ]}
                />
              </>
            }
          />
          {board.state === 'error' ? (
            <InlineError error={board.error} what={T.error} />
          ) : plot ? (
            <PanelBody>
              <SizeRatingPlot entries={rows} classes={classes} you={me?.handle} state={board.state} />
            </PanelBody>
          ) : (
            <DataTable
              columns={ladderColumns({ you: me?.handle })}
              rows={rows}
              state={board.state}
              loadingRows={10}
              rowKey={(r) => r.version_id}
              rowClass={(r) => (me && r.owner === me.handle ? 'you' : undefined)}
              empty={hide && entries.length > 0 ? T.emptyHidden : ladderEmpty(ladder, classes, live)}
            />
          )}
          <PanelFoot end={board.data ? fill(T.total, { n: num(board.data.total), ladder }) : null}>
            <Pagination
              onNext={board.data?.next_cursor ? () => setParam({ cursor: board.data?.next_cursor ?? '' }) : null}
              onStart={cursor ? () => setParam({ cursor: '' }) : null}
              nextLabel={fill(T.pager.next, { n: PAGE })}
              startLabel={T.pager.start}
            />
          </PanelFoot>
        </Panel>
        <p className="muted" style={{ fontSize: 13 }}>
          <Rich text={T.legend} vars={{ baseline: <Icon id="i-anchor" />, settling: <Icon id="i-settling" /> }} />
        </p>
      </div>
    </Shell>
  )
}
