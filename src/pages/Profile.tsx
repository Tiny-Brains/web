// `/profile/:username` — one person's public page, and the only "my" page there is.
//
// NO CONTEXT STRIP: a profile spans every game and season the person has entered,
// so there is nothing on it to select. Each game section states its own season.
//
// YOUR OWN VIEW IS THE SAME PAGE. Signed in as its subject, the editable fields
// become editable in place and the versions and matches that are private to you
// become visible. Those come from GET /v1/models and GET /v1/me/matches, which are
// separate routes precisely because a public route that quietly returns more to
// some callers is the shape a privacy bug arrives in.

import { Link, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ApiError, api, type ModelStatus, type MyModel, type Profile, type ProfileGame, type Ratings } from '../api'
import { useApi } from '../lib/useApi'
import { useSession } from '../providers/session-context'
import { ago, bytes, date, num, plural, rating as fmtRating } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardBody, CardFoot, CardHead, type Column, DataTable, Icon, KeyValues, Loading, Note, Pill, SectionHead } from '../components/ui'
import { ClassChip, ModelLink, StatusPill } from '../components/Model'
import { MatchList } from '../components/MatchRow'
import { Avatar } from '../components/Avatar'
import { FetchFailed, InlineError } from '../components/ErrorStates'

export default function ProfilePage() {
  const { username = '' } = useParams()
  const { me } = useSession()
  const mine = me?.handle === username

  const profile = useApi(`profile:${username}`, () => api.profile(username))
  // Only your own page asks for these, and only when signed in as its subject.
  const myModels = useApi(`profile-models:${username}:${mine}`, () => api.myModels(), mine)
  const myMatches = useApi(`profile-mymx:${username}:${mine}`, () => api.myMatches({ limit: 12 }), mine)
  const theirMatches = useApi(`profile-mx:${username}`, () => api.matches({ owner: username, limit: 12 }), !mine)

  if (profile.state === 'error') {
    return (
      <Shell>
        <FetchFailed error={profile.error} kind="profile" />
      </Shell>
    )
  }
  if (profile.state === 'loading' || !profile.data) {
    return (
      <Shell>
        <section className="wrap sec tight">
          <Loading rows={5} label="Loading the profile" />
        </section>
      </Shell>
    )
  }

  const p = profile.data
  const matches = mine ? myMatches : theirMatches
  const privateVersions = mine ? (myModels.data ?? []) : []

  return (
    <Shell>
      <Head profile={p} mine={mine} onSaved={profile.reload} />

      <section className="wrap">
        <p className="page-sub">
          {mine
            ? 'This is your page. It is the same page everyone else sees, with the fields you can edit made editable and the versions and matches that are private to you made visible.'
            : competingSince(p)}
        </p>
      </section>

      {p.games.length === 0 && privateVersions.length === 0 ? (
        <section className="wrap sec">
          <Note tone="info" title={mine ? 'You have not entered anything yet.' : 'Nothing entered yet.'}>
            <p>
              {mine ? (
                <>
                  A profile exists as soon as you sign in. <Link to="/submit">Submit a version</Link> and
                  this page fills up.
                </>
              ) : (
                'This account has signed in but has not put a version on a ladder.'
              )}
            </p>
          </Note>
        </section>
      ) : null}

      {/* A second game is another section here, not another page. */}
      {p.games.map((g) => (
        <GameSection game={g} mine={mine} privateVersions={privateVersions} key={`${g.game}-${g.season}`} />
      ))}

      {/* A version of yours that is not on a ladder at all — rejected, or still
          being admitted — has no section above, because the public profile only
          carries active and superseded. It still has to appear on your own page. */}
      {mine ? <Unlisted profile={p} models={privateVersions} /> : null}

      <section className="wrap sec">
        <SectionHead
          title={mine ? 'Your matches' : 'Matches their models have played'}
          sub={mine ? 'Newest first, including the ones nobody else can see.' : 'Newest first, across every version.'}
          end={
            <Link className="btn sm" to="/matches">
              All matches →
            </Link>
          }
        />
        <Card>
          <div className="matches">
            {matches.state === 'error' ? (
              <InlineError error={matches.error} what="These matches" />
            ) : (
              <MatchList
                state={matches.state}
                matches={matches.data?.matches ?? []}
                empty="No matches yet. A version starts playing as soon as it passes its trial."
              />
            )}
          </div>
          <CardFoot>
            <span className="muted">
              {mine
                ? 'A cancelled or queued match never had a result, so it never moved a rating.'
                : 'Only matches that were played appear here.'}
            </span>
          </CardFoot>
        </Card>
      </section>

      {mine ? <Account profile={p} /> : null}
    </Shell>
  )
}

// ---- the masthead, editable when it is yours ------------------------------------------

function Head({ profile, mine, onSaved }: { profile: Profile; mine: boolean; onSaved: () => void }) {
  const [name, setName] = useState(profile.display_name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // The field follows the server's value when a save lands; the reader's own
  // typing is what changes it otherwise.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setName(profile.display_name ?? '')
  }, [profile.display_name])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.updateMe(name.trim() || null)
      setSaved(true)
      onSaved()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === 'display_name_too_long'
            ? String(err.detail ?? err.message)
            : err.message
          : 'It could not be saved.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="wrap who-head">
      <Avatar handle={profile.handle} name={profile.display_name} size="lg" alt={`@${profile.handle}`} />
      <div className="id">
        {mine ? (
          <div className="name-edit">
            <input
              className="input"
              type="text"
              value={name}
              maxLength={60}
              aria-label="Display name"
              placeholder={profile.handle}
              onChange={(e) => {
                setName(e.target.value)
                setSaved(false)
              }}
            />
            <button className="btn sm" type="button" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <span className="muted fine-print">
              {error ?? (saved ? 'saved' : 'your display name, edited here')}
            </span>
          </div>
        ) : (
          <h1>{profile.display_name ?? `@${profile.handle}`}</h1>
        )}
        <span className="handle">@{profile.handle}</span>
      </div>
      <div className="end">
        {mine ? (
          <Link className="btn primary" to="/submit">
            Submit a version
          </Link>
        ) : null}
        {profile.baseline ? (
          <span className="r-tag">platform baselines</span>
        ) : (
          <a className="btn" href={`https://github.com/${profile.handle}`} rel="noopener">
            <Icon id="i-github" />
            GitHub ↗
          </a>
        )}
      </div>
    </section>
  )
}

/** The sections are one per game AND season, so counting them counts a second
 *  season of the same game as a second game. The line says both numbers. */
function competingSince(p: Profile): string {
  const games = new Set(p.games.map((g) => g.game)).size
  const seasons = p.games.length
  if (games === 0) return `Signed up ${date(p.created_at)}. Nothing entered yet.`
  return (
    `Competing since ${date(p.created_at)} · ${games} ${plural(games, 'game')} entered` +
    (seasons > games ? ` across ${seasons} ${plural(seasons, 'season')}.` : '.')
  )
}

// ---- one game's versions ---------------------------------------------------------------

type Row = {
  model_id: string
  version: number
  class: string | null
  size_bytes: number | null
  status: ModelStatus
  ratings: Ratings
  /** Private to the owner, and marked as such rather than quietly mixed in. */
  priv?: boolean
  why?: string | null
}

const PRIVATE_WHY: Partial<Record<ModelStatus, string>> = {
  verified: 'Admitted and queued against a baseline. Only you can see a candidate mid-trial.',
  testing: 'Submitted; the release is being fetched and measured. Only you can see it.',
}

function privateRow(m: MyModel, why?: string | null): Row {
  return {
    model_id: m.id,
    version: m.version,
    class: m.class,
    size_bytes: m.size_bytes,
    status: m.status,
    ratings: m.ratings,
    priv: true,
    why: why ?? (m.status === 'rejected' ? m.reject_reason : PRIVATE_WHY[m.status]),
  }
}

function GameSection({
  game,
  mine,
  privateVersions,
}: {
  game: ProfileGame
  mine: boolean
  privateVersions: MyModel[]
}) {
  const rows: Row[] = [
    ...privateVersions
      .filter(
        (m) =>
          m.game === game.game &&
          m.season === game.season &&
          (m.status === 'testing' || m.status === 'verified' || m.status === 'rejected'),
      )
      .map((m) => privateRow(m)),
    ...game.versions.map((v) => ({
      model_id: v.model_id,
      version: v.version,
      class: v.class,
      size_bytes: v.size_bytes,
      status: v.status,
      ratings: v.ratings,
    })),
  ].sort((a, b) => b.version - a.version)

  return (
    <section className="wrap game-sec">
      <SectionHead
        title={
          <>
            {game.game_name}
            <Pill tone={game.season_state === 'open' ? 'open' : game.season_state === 'closed' ? 'closed' : 'settling'}>
              Season {game.season}
            </Pill>
          </>
        }
        sub={`${rows.length} ${plural(rows.length, 'version')}`}
        end={
          mine ? (
            <Link className="btn sm primary" to={`/submit?game=${game.game}`}>
              Submit a version
            </Link>
          ) : undefined
        }
      />
      <Card>
        <DataTable
          columns={VERSION_COLUMNS}
          rows={rows}
          rowKey={(r) => r.model_id}
          rowClass={(r) => (r.status === 'active' ? 'live' : r.priv ? 'priv' : undefined)}
          empty="No version on a ladder in this season."
        />
        <CardFoot>
          <span className="muted">
            {mine
              ? 'Only one version plays at a time. A new one replaces the active one when it passes its trial.'
              : 'One version plays at a time. The rest are the versions it replaced.'}
          </span>
        </CardFoot>
      </Card>
    </section>
  )
}

const VERSION_COLUMNS: Column<Row>[] = [
  { key: 'v', head: '#', cellClass: 'r-rank', cell: (r) => `v${r.version}` },
  {
    key: 'model',
    head: 'Version',
    wide: true,
    cellClass: 'v-cell',
    cell: (r) => (
      <>
        <div className="r-model">
          <ModelLink id={r.model_id} k={r.class} />
        </div>
        {r.why ? (
          <div className="why">
            <span className="privacy">only you see this · </span>
            {r.why}
          </div>
        ) : null}
      </>
    ),
  },
  { key: 'class', head: 'Class', cell: (r) => <ClassChip k={r.class} /> },
  { key: 'size', head: 'Size', align: 'right', cellClass: 'r-num', cell: (r) => bytes(r.size_bytes) },
  { key: 'status', head: 'Status', cell: (r) => <StatusPill status={r.status} /> },
  { key: 'open', head: 'Open', align: 'right', cellClass: 'r-rating', cell: (r) => <LadderCell r={r.ratings.open} /> },
  {
    key: 'class-rating',
    head: 'Class',
    align: 'right',
    cellClass: 'r-rating',
    cell: (r) => <LadderCell r={r.class ? r.ratings[r.class] : undefined} />,
  },
  {
    key: 'matches',
    head: 'Matches',
    align: 'right',
    cellClass: 'r-num muted',
    cell: (r) => (r.ratings.open ? num(r.ratings.open.matches) : '—'),
  },
]

function LadderCell({ r }: { r: Ratings[string] | undefined }) {
  if (!r) return <span className="muted">—</span>
  return (
    <>
      {fmtRating(r.rating)} <span className="muted rank-tag">#{r.rank}</span>
    </>
  )
}

/** Versions with no public section to sit in — a first submission still being
 *  admitted, or one rejected before it ever reached a ladder. */
function Unlisted({ profile, models }: { profile: Profile; models: MyModel[] }) {
  const listed = new Set(profile.games.map((g) => `${g.game}:${g.season}`))
  const orphans = models.filter((m) => !listed.has(`${m.game}:${m.season}`))
  if (orphans.length === 0) return null

  return (
    <section className="wrap game-sec">
      <SectionHead
        title="Not on a ladder"
        sub="Only you can see these: they have not reached a ladder, so they are not on your public page."
      />
      <Card>
        <DataTable
          columns={VERSION_COLUMNS}
          rows={orphans.map((m) =>
            privateRow(m, m.status === 'rejected' ? m.reject_reason : `${m.game}, season ${m.season}`),
          )}
          rowKey={(r) => r.model_id}
          rowClass={() => 'priv'}
        />
      </Card>
    </section>
  )
}

// ---- your account, which is why there is no settings page -------------------------------

function Account({ profile }: { profile: Profile }) {
  const { signOut } = useSession()
  const sessions = useApi('sessions', () => api.sessions())
  const [busy, setBusy] = useState<string | null>(null)

  const revoke = async (sid: string) => {
    setBusy(sid)
    try {
      await api.revokeSession(sid)
      sessions.reload()
    } finally {
      setBusy(null)
    }
  }

  const rows = sessions.data ?? []

  return (
    <section className="wrap sec">
      <SectionHead title="Your account" sub="Signing out lives here, so there is no separate settings page." />
      <Card>
        <CardHead title="GitHub identity" end="the only way in" />
        <CardBody>
          <KeyValues
            items={[
              {
                key: 'Signed in as',
                value: (
                  <a href={`https://github.com/${profile.handle}`} rel="noopener">
                    @{profile.handle} ↗
                  </a>
                ),
                hint: 'TinyBrains holds your GitHub login and nothing else. There is no password here to change.',
              },
              { key: 'Member since', value: date(profile.created_at) },
            ]}
          />
        </CardBody>
      </Card>

      <div className="mt">
        <Card>
          <CardHead title="Active sessions" end={rows.length ? `${rows.length} signed in` : undefined} />
          <div className="sessions">
            {sessions.state === 'loading' ? (
              <Loading rows={2} label="Loading sessions" />
            ) : sessions.state === 'error' ? (
              <InlineError error={sessions.error} what="Your sessions" />
            ) : (
              rows.map((s) => (
                <div className="sess" key={s.sid}>
                  {s.current ? <Icon id="i-check" /> : <span className="sess-gap" />}
                  <span>
                    {s.current ? 'This browser · ' : ''}
                    {s.user_agent ?? 'an unnamed browser'}
                  </span>
                  <span className="when">
                    {s.current ? 'now' : `last used ${ago(s.last_seen_at)}`} · expires {date(s.expires_at)}
                  </span>
                  {s.current ? null : (
                    <button
                      className="btn sm danger"
                      type="button"
                      onClick={() => revoke(s.sid)}
                      disabled={busy === s.sid}
                    >
                      Sign out
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          <CardFoot>
            <button className="btn danger" type="button" onClick={() => void signOut()}>
              Sign out
            </button>
            {rows.length > 1 ? (
              <button
                className="btn danger"
                type="button"
                onClick={() => revoke('others')}
                disabled={busy === 'others'}
              >
                Sign out everywhere else
              </button>
            ) : null}
            <span className="muted push">Your versions keep playing while you are signed out.</span>
          </CardFoot>
        </Card>
      </div>
    </section>
  )
}
