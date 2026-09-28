// How a runner's liveness is read, one way on both pages that list runners: the platform's
// `/admin/runners` and a season's desk.
//
// TWO QUESTIONS, NEVER ONE BADGE. `live` is AUTHORISATION -- the runner, its key and the key's owner
// are in good standing (a platform key needs a platform admin, a season key a platform admin or a live
// admin of its season). Calling in is whether it is actually there: `last_seen_at` moved within a
// lease. Authorised and silent is quiet; quiet while holding matches is wedged.

/** Five minutes is the lease, so a runner silent for longer has lost its claims or is about to. */
export const STALE_MS = 5 * 60 * 1000

/** Silent for longer than a lease. NOT a verdict on its own: a runner with nothing in flight polls,
 *  finds nothing, and its last_seen still moves -- so quiet means it has stopped calling at all,
 *  which is a machine that is off, wedged, or cannot reach the gate. */
export function isQuiet(r: { last_seen_at: string }): boolean {
  return Date.now() - new Date(r.last_seen_at).getTime() > STALE_MS
}

/** The one judgement either page makes, and it is deliberately narrow: authorised, holding matches
 *  AND silent past the lease. A quiet runner with nothing in flight is simply off, which costs the
 *  ladder nothing. */
export function isWedged(r: { live: boolean; in_flight: number; last_seen_at: string }): boolean {
  return r.live && r.in_flight > 0 && isQuiet(r)
}

/** WHAT A MACHINE SAID IT DOES, and the two facts are independent. A runner reports `match_slots`
 *  or `admit_slots` (or, on a node configured for both, each of them) at every token exchange, and
 *  Soma sticks each on the row; `admits` is NOT `!plays_matches`. A machine that has reported
 *  neither is one from before either was reported, and both pages say so rather than calling it an
 *  admitter -- which would tell an admin a queue is served by something that has never claimed an
 *  admission. */
export type RunnerRole = 'plays' | 'admits' | 'both' | 'silent'

export function runnerRole(r: { plays_matches: boolean; admits: boolean }): RunnerRole {
  if (r.plays_matches && r.admits) return 'both'
  if (r.plays_matches) return 'plays'
  if (r.admits) return 'admits'
  return 'silent'
}
