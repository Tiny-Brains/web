// What a season-scoped page draws INSTEAD of itself when there is no season to draw it for.
//
// Three answers end a wait that would otherwise never end: `?season=` names a season this viewer
// cannot see (unknown, or private and not theirs -- the two answer alike on purpose, so nobody maps
// private seasons by the page they get), the seasons did not load, or the game has none yet. Each is
// a whole page, shell and title included, so a page calls this after its hooks and returns it:
//
//   const wall = useSeasonWall()
//   if (wall) return wall
//
// While the seasons are still loading it answers null, and the page draws its own placeholder.

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { usePlatform } from '../providers/platform-context'
import { Shell } from './Shell'
import { FetchFailed, Message, NotFound } from './ErrorStates'
import { fill } from '../lib/copy'
import common from '../../copy/common.json'

const E = common.errors

export function useSeasonWall(): ReactNode | null {
  const { seasonMissing, season, seasonsLoading, seasonsError, seasons, gameName } = usePlatform()
  if (seasonMissing) {
    return (
      <Shell title={E.tabNotFound}>
        <NotFound kind="season" />
      </Shell>
    )
  }
  if (season || seasonsLoading) return null
  if (seasonsError) {
    return (
      <Shell title={E.tabNotLoaded}>
        <FetchFailed error={seasonsError} kind="season" />
      </Shell>
    )
  }
  if (seasons.length === 0) {
    return (
      <Shell title={E.noSeason.tab}>
        <Message
          code={E.noSeason.code}
          title={fill(E.noSeason.title, { game: gameName })}
          actions={
            <Link className="btn primary lg" to="/start">
              {E.noSeason.start}
            </Link>
          }
        >
          <p>{E.noSeason.body}</p>
        </Message>
      </Shell>
    )
  }
  return null
}
