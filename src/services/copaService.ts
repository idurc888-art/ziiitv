// Copa 2026 data service
// Reads from Supabase when populated; falls back to copaMock automatically.

export interface CopaMatch {
  id: string
  homeTeam: { name: string; shortName: string; crest: string }
  awayTeam: { name: string; shortName: string; crest: string }
  utcDate: string
  status: 'SCHEDULED' | 'LIVE' | 'IN_PLAY' | 'PAUSED' | 'FINISHED'
  minute?: number
  score: { home: number | null; away: number | null }
  group?: string
  stage: string
  venue?: string
  matchday?: number
}

export interface CopaGroup {
  name: string
  standings: {
    team: { name: string; shortName: string; crest: string; primaryColor?: string; secondaryColor?: string }
    points: number
    playedGames: number
    won: number
    draw: number
    lost: number
    goalsFor: number
    goalsAgainst: number
  }[]
}

export interface TopScorer {
  id: string
  position: number
  player: string
  team: string
  teamCrest: string
  flag: string
  goals: number
  assists: number
}

const SUPABASE_URL = 'https://xkhlentrhydviqfgqdhv.supabase.co'
const ANON_KEY     = 'sb_publishable_WsHv-bt4db2K4OIMc27rhg_utxbni2S'

const SB_HEADERS = {
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
}

function cacheGet<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > ttlMs) return null
    return data as T
  } catch { return null }
}

function cacheSet(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

function rowToMatch(r: any): CopaMatch {
  return {
    id: String(r.id),
    homeTeam: { name: r.home_team_name ?? 'TBD', shortName: r.home_team_short ?? '?', crest: r.home_team_crest ?? '' },
    awayTeam: { name: r.away_team_name ?? 'TBD', shortName: r.away_team_short ?? '?', crest: r.away_team_crest ?? '' },
    utcDate:  r.utc_date    ?? '',
    status:   r.status      ?? 'SCHEDULED',
    minute:   r.minute      ?? undefined,
    score:    { home: r.score_home ?? null, away: r.score_away ?? null },
    group:    r.match_group ?? undefined,
    stage:    r.stage       ?? 'GROUP_STAGE',
    venue:    r.venue       ?? undefined,
    matchday: r.matchday    ?? undefined,
  }
}

// ── Supabase fetchers (return null on error or empty) ─────────────────────────

async function sbMatches(): Promise<CopaMatch[] | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/copa_matches?select=*&order=utc_date.asc`,
      { headers: SB_HEADERS }
    )
    if (!res.ok) return null
    const rows: any[] = await res.json()
    if (!rows.length) return null
    return rows.map(rowToMatch)
  } catch { return null }
}

async function sbStandings(): Promise<CopaGroup[] | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/copa_standings?select=*&order=group_name.asc,position.asc`,
      { headers: SB_HEADERS }
    )
    if (!res.ok) return null
    const rows: any[] = await res.json()
    if (!rows.length) return null
    const groups: CopaGroup[] = []
    for (const row of rows) {
      const name = row.group_name ?? 'Geral'
      let g = groups.find(x => x.name === name)
      if (!g) { g = { name, standings: [] }; groups.push(g) }
      g.standings.push({
        team: { name: row.team_name ?? '', shortName: row.team_short ?? '', crest: row.team_crest ?? '' },
        points: row.points ?? 0, playedGames: row.played ?? 0,
        won: row.won ?? 0, draw: row.draw ?? 0, lost: row.lost ?? 0,
        goalsFor: row.goals_for ?? 0, goalsAgainst: row.goals_against ?? 0,
      })
    }
    return groups
  } catch { return null }
}

const COPA_PROXY    = `${SUPABASE_URL}/functions/v1/copa-proxy`
const WC_UNIQUE_ID  = 16
const WC_SEASON_ID  = 58210

// Bandeira via flagcdn (alpha2 do country)
function flagUrl(alpha2: string): string {
  return `https://flagcdn.com/w80/${alpha2.toLowerCase()}.png`
}

async function rapidStandings(): Promise<CopaGroup[] | null> {
  try {
    const cached = cacheGet<CopaGroup[]>('copa2026_standings_rapid', 5 * 60 * 1000)
    if (cached) return cached

    const path = `/api/v1/unique-tournament/${WC_UNIQUE_ID}/season/${WC_SEASON_ID}/standings/total`
    const res = await fetch(`${COPA_PROXY}?path=${encodeURIComponent(path)}`, { headers: SB_HEADERS })
    if (!res.ok) return null
    const data = await res.json()
    const rawGroups: any[] = data.standings ?? []
    if (!rawGroups.length) return null

    const groups: CopaGroup[] = rawGroups.map((g: any) => ({
      name: g.name ?? 'Grupo',
      standings: (g.rows ?? []).map((r: any) => ({
        team: {
          name:           r.team.name ?? '',
          shortName:      r.team.nameCode ?? r.team.shortName ?? '',
          crest:          flagUrl(r.team.country?.alpha2 ?? ''),
          primaryColor:   r.team.teamColors?.primary,
          secondaryColor: r.team.teamColors?.secondary,
        },
        points:      r.points      ?? 0,
        playedGames: r.matches     ?? 0,
        won:         r.wins        ?? 0,
        draw:        r.draws       ?? 0,
        lost:        r.losses      ?? 0,
        goalsFor:    r.scoresFor   ?? 0,
        goalsAgainst:r.scoresAgainst ?? 0,
      })),
    }))

    cacheSet('copa2026_standings_rapid', groups)
    return groups
  } catch { return null }
}

async function rapidMatches(): Promise<CopaMatch[] | null> {
  try {
    const cached = cacheGet<CopaMatch[]>('copa2026_matches_rapid', 2 * 60 * 1000)
    if (cached) return cached

    const dates: string[] = []
    for (let i = -1; i <= 30; i++) {
      const d = new Date(Date.now() + i * 86400000)
      dates.push(d.toISOString().slice(0, 10))
    }

    const allMatches: CopaMatch[] = []
    for (const date of dates) {
      const path = `/api/v1/sport/football/scheduled-events/${date}`
      const res = await fetch(`${COPA_PROXY}?path=${encodeURIComponent(path)}`, { headers: SB_HEADERS })
      if (!res.ok) continue
      const data = await res.json()
      const events: any[] = (data.events ?? []).filter((e: any) =>
        e.season?.id === WC_SEASON_ID
      )
      for (const e of events) {
        const status = e.status?.type === 'inprogress' ? 'IN_PLAY'
          : e.status?.type === 'finished' ? 'FINISHED' : 'SCHEDULED'
        allMatches.push({
          id:       String(e.id),
          homeTeam: { name: e.homeTeam?.name ?? '', shortName: e.homeTeam?.nameCode ?? '', crest: flagUrl(e.homeTeam?.country?.alpha2 ?? '') },
          awayTeam: { name: e.awayTeam?.name ?? '', shortName: e.awayTeam?.nameCode ?? '', crest: flagUrl(e.awayTeam?.country?.alpha2 ?? '') },
          utcDate:  new Date(e.startTimestamp * 1000).toISOString(),
          status:   status as CopaMatch['status'],
          minute:   e.status?.description ? parseInt(e.status.description) || undefined : undefined,
          score:    { home: e.homeScore?.current ?? null, away: e.awayScore?.current ?? null },
          group:    e.tournament?.name ?? undefined,
          stage:    'GROUP_STAGE',
          venue:    e.venue?.stadium?.name ?? undefined,
        })
      }
    }

    if (!allMatches.length) return null
    cacheSet('copa2026_matches_rapid', allMatches)
    return allMatches
  } catch { return null }
}



let _mockMatches: CopaMatch[] | null = null
let _mockStandings: CopaGroup[] | null = null

async function getMockMatches(): Promise<CopaMatch[]> {
  if (!_mockMatches) {
    const m = await import('../data/copaMock')
    _mockMatches = m.MOCK_MATCHES
  }
  return _mockMatches
}

async function getMockStandings(): Promise<CopaGroup[]> {
  if (!_mockStandings) {
    const m = await import('../data/copaMock')
    _mockStandings = m.MOCK_STANDINGS
  }
  return _mockStandings
}

// ── Public API ────────────────────────────────────────────────────────────────

async function fetchMatches(): Promise<CopaMatch[]> {
  const rapid = await rapidMatches()
  if (rapid) return rapid
  const live = await sbMatches()
  if (live) return live
  return getMockMatches()
}

export const copaService = {
  async getMatchesByDay(): Promise<Record<string, CopaMatch[]>> {
    const all = await fetchMatches()
    const byDay: Record<string, CopaMatch[]> = {}
    for (const m of all) {
      const day = m.utcDate.slice(0, 10)
      if (!byDay[day]) byDay[day] = []
      byDay[day].push(m)
    }
    return byDay
  },

  async getTodayMatches(): Promise<CopaMatch[]> {
    const byDay = await this.getMatchesByDay()
    const today = new Date().toISOString().slice(0, 10)
    return byDay[today] ?? []
  },

  async getLiveMatch(): Promise<CopaMatch | null> {
    const cached = cacheGet<CopaMatch | null>('copa2026_live', 30 * 1000)
    if (cached !== null) return cached
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/copa_matches?select=*&status=in.(IN_PLAY,PAUSED,LIVE)&order=utc_date.asc&limit=1`,
        { headers: SB_HEADERS }
      )
      if (res.ok) {
        const rows: any[] = await res.json()
        if (rows.length > 0) {
          const match = rowToMatch(rows[0])
          cacheSet('copa2026_live', match)
          return match
        }
      }
    } catch { /* fall through to mock */ }
    // Supabase empty or offline — find live match in mock
    const all = await getMockMatches()
    const live = all.find(m => m.status === 'IN_PLAY' || m.status === 'PAUSED' || m.status === 'LIVE') ?? null
    cacheSet('copa2026_live', live)
    return live
  },

  async getStandings(): Promise<CopaGroup[]> {
    const rapid = await rapidStandings()
    if (rapid) return rapid
    const live = await sbStandings()
    if (live) return live
    return getMockStandings()
  },

  async getMatchDetail(id: string): Promise<CopaMatch | null> {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/copa_matches?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
        { headers: SB_HEADERS }
      )
      if (res.ok) {
        const rows: any[] = await res.json()
        if (rows.length > 0) return rowToMatch(rows[0])
      }
    } catch { /* fall through */ }
    const all = await getMockMatches()
    return all.find(m => m.id === id) ?? null
  },

  hasApiKey(): boolean {
    return true
  },
}
