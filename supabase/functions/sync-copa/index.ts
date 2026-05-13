// sync-copa — fetches fixtures + standings from football-data.org and upserts to Supabase
// Deploy: supabase functions deploy sync-copa
// Env vars required: FOOTBALL_DATA_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const FD_KEY     = Deno.env.get('FOOTBALL_DATA_API_KEY') ?? ''
const SB_URL     = Deno.env.get('SUPABASE_URL') ?? ''
const SB_SRK     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const FD_BASE    = 'https://api.football-data.org/v4'
const COMP       = '2000' // FIFA World Cup

const FD_HEADERS = { 'X-Auth-Token': FD_KEY }
const SB_HEADERS = {
  'apikey': SB_SRK,
  'Authorization': `Bearer ${SB_SRK}`,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates',
}

async function fdFetch(path: string): Promise<any> {
  const res = await fetch(`${FD_BASE}${path}`, { headers: FD_HEADERS })
  if (!res.ok) throw new Error(`football-data.org ${path} → ${res.status}`)
  return res.json()
}

async function sbUpsert(table: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase upsert ${table} → ${res.status}: ${err}`)
  }
}

function mapStatus(s: string): string {
  const m: Record<string, string> = {
    IN_PLAY: 'IN_PLAY', PAUSED: 'PAUSED',
    FINISHED: 'FINISHED', LIVE: 'LIVE',
  }
  return m[s] ?? 'SCHEDULED'
}

async function syncMatches(): Promise<number> {
  const json = await fdFetch(`/competitions/${COMP}/matches`)
  const matches: any[] = json.matches ?? []
  const rows = matches.map((m: any) => ({
    id: m.id,
    home_team_name:  m.homeTeam?.name     ?? 'TBD',
    home_team_short: m.homeTeam?.shortName ?? '?',
    home_team_crest: m.homeTeam?.crest     ?? '',
    away_team_name:  m.awayTeam?.name     ?? 'TBD',
    away_team_short: m.awayTeam?.shortName ?? '?',
    away_team_crest: m.awayTeam?.crest     ?? '',
    utc_date:   m.utcDate ?? null,
    status:     mapStatus(m.status),
    minute:     m.minute ?? null,
    score_home: m.score?.fullTime?.home ?? null,
    score_away: m.score?.fullTime?.away ?? null,
    match_group: m.group ?? null,
    stage:      m.stage ?? 'GROUP_STAGE',
    venue:      m.venue ?? null,
    matchday:   m.matchday ?? null,
  }))
  await sbUpsert('copa_matches', rows)
  return rows.length
}

async function syncStandings(): Promise<number> {
  const json = await fdFetch(`/competitions/${COMP}/standings`)
  const standings: any[] = json.standings ?? []
  const rows: unknown[] = []
  for (const section of standings) {
    if (section.type !== 'TOTAL') continue
    const groupName = section.group
      ? section.group.replace('GROUP_', 'Grupo ')
      : 'Geral'
    const table: any[] = section.table ?? []
    table.forEach((row: any, idx: number) => {
      rows.push({
        group_name:     groupName,
        position:       idx + 1,
        team_name:      row.team?.name      ?? '',
        team_short:     row.team?.shortName ?? '',
        team_crest:     row.team?.crest     ?? '',
        points:         row.points         ?? 0,
        played:         row.playedGames    ?? 0,
        won:            row.won            ?? 0,
        draw:           row.draw           ?? 0,
        lost:           row.lost           ?? 0,
        goals_for:      row.goalsFor       ?? 0,
        goals_against:  row.goalsAgainst   ?? 0,
      })
    })
  }
  await sbUpsert('copa_standings', rows)
  return rows.length
}

serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }
  try {
    const [matchCount, standCount] = await Promise.all([
      syncMatches(),
      syncStandings(),
    ])
    return new Response(
      JSON.stringify({ ok: true, matches: matchCount, standings: standCount }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[sync-copa]', err)
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
