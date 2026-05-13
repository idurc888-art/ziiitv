import type { CopaMatch, CopaGroup, TopScorer } from '../services/copaService'

const flag = (code: string) => `https://flagcdn.com/w80/${code}.png`

// 4 horários fixos UTC → BRT:
//   15:00Z = 12h BRT  → azul
//   18:00Z = 15h BRT  → âmbar
//   21:00Z = 18h BRT  → rosa
//   23:00Z = 20h BRT  → roxo

export const MOCK_MATCHES: CopaMatch[] = [

  // ══ Qui 11/Jun — Abertura ══
  { id: 'wc-01', group: 'GROUP_A', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'México',        shortName: 'MEX', crest: flag('mx') },
    awayTeam: { name: 'África do Sul', shortName: 'RSA', crest: flag('za') },
    utcDate: '2026-06-11T23:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'Estadio Azteca, Cidade do México' },

  // ══ Sex 12/Jun ══
  { id: 'wc-02', group: 'GROUP_B', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Canadá',   shortName: 'CAN', crest: flag('ca') },
    awayTeam: { name: 'Catar',    shortName: 'QAT', crest: flag('qa') },
    utcDate: '2026-06-12T18:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'BMO Field, Toronto' },
  { id: 'wc-03', group: 'GROUP_C', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Brasil',   shortName: 'BRA', crest: flag('br') },
    awayTeam: { name: 'Marrocos', shortName: 'MAR', crest: flag('ma') },
    utcDate: '2026-06-12T21:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'MetLife Stadium, Nova York' },
  { id: 'wc-04', group: 'GROUP_D', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'EUA',      shortName: 'USA', crest: flag('us') },
    awayTeam: { name: 'Paraguai', shortName: 'PAR', crest: flag('py') },
    utcDate: '2026-06-12T23:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'SoFi Stadium, Los Angeles' },

  // ══ Sáb 13/Jun ══
  { id: 'wc-05', group: 'GROUP_E', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Alemanha',       shortName: 'GER', crest: flag('de') },
    awayTeam: { name: 'Costa do Marfim', shortName: 'CIV', crest: flag('ci') },
    utcDate: '2026-06-13T18:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'AT&T Stadium, Dallas' },
  { id: 'wc-06', group: 'GROUP_F', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Holanda', shortName: 'NED', crest: flag('nl') },
    awayTeam: { name: 'Japão',   shortName: 'JPN', crest: flag('jp') },
    utcDate: '2026-06-13T21:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'Lumen Field, Seattle' },
  { id: 'wc-07', group: 'GROUP_G', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Bélgica', shortName: 'BEL', crest: flag('be') },
    awayTeam: { name: 'Egito',   shortName: 'EGY', crest: flag('eg') },
    utcDate: '2026-06-13T23:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'Gillette Stadium, Boston' },

  // ══ Dom 14/Jun ══
  { id: 'wc-08', group: 'GROUP_H', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Espanha', shortName: 'ESP', crest: flag('es') },
    awayTeam: { name: 'Uruguai', shortName: 'URU', crest: flag('uy') },
    utcDate: '2026-06-14T18:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'Hard Rock Stadium, Miami' },
  { id: 'wc-09', group: 'GROUP_I', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'França',  shortName: 'FRA', crest: flag('fr') },
    awayTeam: { name: 'Senegal', shortName: 'SEN', crest: flag('sn') },
    utcDate: '2026-06-14T21:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'Empower Field, Denver' },
  { id: 'wc-10', group: 'GROUP_J', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Argentina', shortName: 'ARG', crest: flag('ar') },
    awayTeam: { name: 'Argélia',   shortName: 'ALG', crest: flag('dz') },
    utcDate: '2026-06-14T23:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'Arrowhead Stadium, Kansas City' },

  // ══ Seg 15/Jun ══
  { id: 'wc-11', group: 'GROUP_K', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Portugal',    shortName: 'POR', crest: flag('pt') },
    awayTeam: { name: 'Colômbia',    shortName: 'COL', crest: flag('co') },
    utcDate: '2026-06-15T18:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'NRG Stadium, Houston' },
  { id: 'wc-12', group: 'GROUP_L', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Inglaterra', shortName: 'ENG', crest: flag('gb-eng') },
    awayTeam: { name: 'Croácia',    shortName: 'CRO', crest: flag('hr') },
    utcDate: '2026-06-15T21:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'Lincoln Financial Field, Filadélfia' },
  { id: 'wc-13', group: 'GROUP_A', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Estados Unidos', shortName: 'USA', crest: flag('us') },
    awayTeam: { name: 'Cuba',           shortName: 'CUB', crest: flag('cu') },
    utcDate: '2026-06-15T23:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'SoFi Stadium, Los Angeles' },

  // ══ Ter 16/Jun ══
  { id: 'wc-14', group: 'GROUP_B', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Suíça', shortName: 'SUI', crest: flag('ch') },
    awayTeam: { name: 'BiH',   shortName: 'BIH', crest: flag('ba') },
    utcDate: '2026-06-16T18:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'BC Place, Vancouver' },
  { id: 'wc-15', group: 'GROUP_C', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Haiti',   shortName: 'HAI', crest: flag('ht') },
    awayTeam: { name: 'Escócia', shortName: 'SCO', crest: flag('gb-sct') },
    utcDate: '2026-06-16T21:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'Estadio Akron, Guadalajara' },
  { id: 'wc-16', group: 'GROUP_D', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Austrália', shortName: 'AUS', crest: flag('au') },
    awayTeam: { name: 'Turquia',   shortName: 'TUR', crest: flag('tr') },
    utcDate: '2026-06-16T23:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'Estadio BBVA, Monterrey' },

  // ══ Qua 17/Jun ══
  { id: 'wc-17', group: 'GROUP_E', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Curaçao',  shortName: 'CUW', crest: flag('cw') },
    awayTeam: { name: 'Equador',  shortName: 'ECU', crest: flag('ec') },
    utcDate: '2026-06-17T18:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'AT&T Stadium, Dallas' },
  { id: 'wc-18', group: 'GROUP_F', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Suécia',  shortName: 'SWE', crest: flag('se') },
    awayTeam: { name: 'Tunísia', shortName: 'TUN', crest: flag('tn') },
    utcDate: '2026-06-17T21:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'Levi\'s Stadium, São Francisco' },
  { id: 'wc-19', group: 'GROUP_G', stage: 'GROUP_STAGE', matchday: 1,
    homeTeam: { name: 'Irã',          shortName: 'IRN', crest: flag('ir') },
    awayTeam: { name: 'Nova Zelândia', shortName: 'NZL', crest: flag('nz') },
    utcDate: '2026-06-17T23:00:00Z', status: 'SCHEDULED', score: { home: null, away: null }, venue: 'Mercedes-Benz Stadium, Atlanta' },
]

// ─────────────────────────────────────────────────────────────────────────────
// STANDINGS — 6 grupos
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_STANDINGS: CopaGroup[] = [
  {
    name: 'Grupo A',
    standings: [
      { team: { name: 'Estados Unidos', shortName: 'EUA', crest: flag('us') }, points: 3, playedGames: 1, won: 1, draw: 0, lost: 0, goalsFor: 2, goalsAgainst: 1 },
      { team: { name: 'México',         shortName: 'MEX', crest: flag('mx') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Jamaica',        shortName: 'JAM', crest: flag('jm') }, points: 0, playedGames: 1, won: 0, draw: 0, lost: 1, goalsFor: 1, goalsAgainst: 2 },
      { team: { name: 'Cuba',           shortName: 'CUB', crest: flag('cu') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
    ],
  },
  {
    name: 'Grupo B',
    standings: [
      { team: { name: 'Brasil',    shortName: 'BRA', crest: flag('br') }, points: 3, playedGames: 1, won: 1, draw: 0, lost: 0, goalsFor: 3, goalsAgainst: 0 },
      { team: { name: 'Argentina', shortName: 'ARG', crest: flag('ar') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Uruguai',   shortName: 'URU', crest: flag('uy') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Equador',   shortName: 'ECU', crest: flag('ec') }, points: 0, playedGames: 1, won: 0, draw: 0, lost: 1, goalsFor: 0, goalsAgainst: 3 },
    ],
  },
  {
    name: 'Grupo C',
    standings: [
      { team: { name: 'França',   shortName: 'FRA', crest: flag('fr') }, points: 3, playedGames: 1, won: 1, draw: 0, lost: 0, goalsFor: 2, goalsAgainst: 0 },
      { team: { name: 'Alemanha', shortName: 'GER', crest: flag('de') }, points: 3, playedGames: 1, won: 1, draw: 0, lost: 0, goalsFor: 2, goalsAgainst: 1 },
      { team: { name: 'Marrocos', shortName: 'MAR', crest: flag('ma') }, points: 0, playedGames: 1, won: 0, draw: 0, lost: 1, goalsFor: 1, goalsAgainst: 2 },
      { team: { name: 'Portugal', shortName: 'POR', crest: flag('pt') }, points: 0, playedGames: 1, won: 0, draw: 0, lost: 1, goalsFor: 0, goalsAgainst: 2 },
    ],
  },
  {
    name: 'Grupo D',
    standings: [
      { team: { name: 'Espanha',       shortName: 'ESP', crest: flag('es') }, points: 3, playedGames: 1, won: 1, draw: 0, lost: 0, goalsFor: 1, goalsAgainst: 0 },
      { team: { name: 'Inglaterra',    shortName: 'ING', crest: flag('gb-eng') }, points: 1, playedGames: 1, won: 0, draw: 1, lost: 0, goalsFor: 1, goalsAgainst: 1 },
      { team: { name: 'Países Baixos', shortName: 'HOL', crest: flag('nl') }, points: 1, playedGames: 1, won: 0, draw: 1, lost: 0, goalsFor: 1, goalsAgainst: 1 },
      { team: { name: 'Senegal',       shortName: 'SEN', crest: flag('sn') }, points: 0, playedGames: 1, won: 0, draw: 0, lost: 1, goalsFor: 0, goalsAgainst: 1 },
    ],
  },
  {
    name: 'Grupo E',
    standings: [
      { team: { name: 'Itália',  shortName: 'ITA', crest: flag('it') }, points: 6, playedGames: 2, won: 2, draw: 0, lost: 0, goalsFor: 5, goalsAgainst: 1 },
      { team: { name: 'Canadá',  shortName: 'CAN', crest: flag('ca') }, points: 3, playedGames: 2, won: 1, draw: 0, lost: 1, goalsFor: 3, goalsAgainst: 2 },
      { team: { name: 'Japão',   shortName: 'JAP', crest: flag('jp') }, points: 0, playedGames: 2, won: 0, draw: 0, lost: 2, goalsFor: 1, goalsAgainst: 4 },
      { team: { name: 'Peru',    shortName: 'PER', crest: flag('pe') }, points: 3, playedGames: 2, won: 1, draw: 0, lost: 1, goalsFor: 2, goalsAgainst: 4 },
    ],
  },
  {
    name: 'Grupo F',
    standings: [
      { team: { name: 'Suíça',     shortName: 'SUI', crest: flag('ch') }, points: 3, playedGames: 2, won: 1, draw: 1, lost: 0, goalsFor: 3, goalsAgainst: 1 },
      { team: { name: 'Colômbia',  shortName: 'COL', crest: flag('co') }, points: 4, playedGames: 2, won: 1, draw: 1, lost: 0, goalsFor: 3, goalsAgainst: 2 },
      { team: { name: 'Croácia',   shortName: 'CRO', crest: flag('hr') }, points: 1, playedGames: 2, won: 0, draw: 1, lost: 1, goalsFor: 2, goalsAgainst: 3 },
      { team: { name: 'Camarões',  shortName: 'CMR', crest: flag('cm') }, points: 0, playedGames: 2, won: 0, draw: 0, lost: 2, goalsFor: 1, goalsAgainst: 3 },
    ],
  },
  {
    name: 'Grupo G',
    standings: [
      { team: { name: 'Bélgica',      shortName: 'BEL', crest: flag('be') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Egito',        shortName: 'EGI', crest: flag('eg') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Irã',          shortName: 'IRN', crest: flag('ir') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Nova Zelândia', shortName: 'NZL', crest: flag('nz') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
    ],
  },
  {
    name: 'Grupo H',
    standings: [
      { team: { name: 'Espanha',       shortName: 'ESP', crest: flag('es') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Cabo Verde',    shortName: 'CPV', crest: flag('cv') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Arábia Saudita', shortName: 'KSA', crest: flag('sa') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Uruguai',       shortName: 'URU', crest: flag('uy') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
    ],
  },
  {
    name: 'Grupo I',
    standings: [
      { team: { name: 'França',  shortName: 'FRA', crest: flag('fr') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Senegal', shortName: 'SEN', crest: flag('sn') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Iraque',  shortName: 'IRQ', crest: flag('iq') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Noruega', shortName: 'NOR', crest: flag('no') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
    ],
  },
  {
    name: 'Grupo J',
    standings: [
      { team: { name: 'Argentina', shortName: 'ARG', crest: flag('ar') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Argélia',   shortName: 'ALG', crest: flag('dz') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Áustria',   shortName: 'AUT', crest: flag('at') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Jordânia',  shortName: 'JOR', crest: flag('jo') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
    ],
  },
  {
    name: 'Grupo K',
    standings: [
      { team: { name: 'Portugal',     shortName: 'POR', crest: flag('pt') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'RD Congo',     shortName: 'COD', crest: flag('cd') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Uzbequistão',  shortName: 'UZB', crest: flag('uz') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Colômbia',     shortName: 'COL', crest: flag('co') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
    ],
  },
  {
    name: 'Grupo L',
    standings: [
      { team: { name: 'Inglaterra', shortName: 'ING', crest: flag('gb-eng') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Croácia',    shortName: 'CRO', crest: flag('hr') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Gana',       shortName: 'GHA', crest: flag('gh') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      { team: { name: 'Panamá',     shortName: 'PAN', crest: flag('pa') }, points: 0, playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// TOP SCORERS — Artilheiros da Copa 2026
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_TOP_SCORERS: TopScorer[] = [
  { id: 'sc-1', position: 1, player: 'Vini Jr',           team: 'Brasil',      teamCrest: flag('br'), flag: '🇧🇷', goals: 3, assists: 1 },
  { id: 'sc-2', position: 2, player: 'Lautaro Martínez',  team: 'Argentina',   teamCrest: flag('ar'), flag: '🇦🇷', goals: 2, assists: 0 },
  { id: 'sc-3', position: 3, player: 'Kylian Mbappé',     team: 'França',      teamCrest: flag('fr'), flag: '🇫🇷', goals: 2, assists: 1 },
  { id: 'sc-4', position: 4, player: 'Federico Valverde', team: 'Uruguai',     teamCrest: flag('uy'), flag: '🇺🇾', goals: 2, assists: 2 },
  { id: 'sc-5', position: 5, player: 'Ciro Immobile',     team: 'Itália',      teamCrest: flag('it'), flag: '🇮🇹', goals: 2, assists: 0 },
  { id: 'sc-6', position: 6, player: 'Harry Kane',        team: 'Inglaterra',  teamCrest: flag('gb-eng'), flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', goals: 1, assists: 1 },
  { id: 'sc-7', position: 7, player: 'Hirving Lozano',    team: 'México',      teamCrest: flag('mx'), flag: '🇲🇽', goals: 1, assists: 0 },
  { id: 'sc-8', position: 8, player: 'Ferran Torres',     team: 'Espanha',     teamCrest: flag('es'), flag: '🇪🇸', goals: 1, assists: 1 },
]
