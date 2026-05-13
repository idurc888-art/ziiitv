import { useEffect, useRef, useState } from 'react'
import { copaService, type CopaMatch, type CopaGroup, type TopScorer } from '../../services/copaService'
import { COPA_WATCH_CHANNELS, channelEmbedUrl, type CopaChannel } from '../../services/copaChannels'
import { MOCK_MATCHES, MOCK_STANDINGS, MOCK_TOP_SCORERS } from '../../data/copaMock'
import MatchDetailOverlay from './MatchDetailOverlay'

function groupByDay(matches: CopaMatch[]): Record<string, CopaMatch[]> {
  const out: Record<string, CopaMatch[]> = {}
  for (const m of matches) {
    const d = m.utcDate.slice(0, 10)
    if (!out[d]) out[d] = []
    out[d].push(m)
  }
  return out
}
const MOCK_BY_DAY = groupByDay(MOCK_MATCHES)
const MOCK_LIVE   = MOCK_MATCHES.find(m => m.status === 'IN_PLAY' || m.status === 'LIVE' || m.status === 'PAUSED') ?? null

interface Props {
  vw: number
  onBack?: () => void
}

// ─── Date utils ───────────────────────────────────────────────────────────────

function toBR(utcDate: string): Date {
  const d = new Date(utcDate)
  return new Date(d.getTime() - 3 * 60 * 60 * 1000) // UTC-3
}

function dayLabel(dateStr: string): { muted: string; accent: string } {
  const d = toBR(dateStr + 'T12:00:00Z')
  const isoToday = new Date().toISOString().slice(0, 10)
  const isoTomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const DAYS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
  const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const dow = DAYS[d.getUTCDay()]
  const dm = `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`
  if (dateStr === isoToday)    return { muted: 'hoje ·', accent: `${dow}, ${dm}` }
  if (dateStr === isoTomorrow) return { muted: 'amanhã ·', accent: `${dow}, ${dm}` }
  return { muted: '', accent: `${dow}, ${dm}` }
}

function formatTime(utcDate: string): string {
  const d = toBR(utcDate)
  return `${String(d.getUTCHours()).padStart(2,'0')}h${String(d.getUTCMinutes()).padStart(2,'0')}`
}

function formatFullDate(utcDate: string): string {
  if (!utcDate) return ''
  const d = toBR(utcDate)
  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}

function stageLabel(stage: string, group?: string): string {
  const g = group ? ` · ${group.replace('GROUP_','Grupo ')}` : ''
  const MAP: Record<string,string> = {
    GROUP_STAGE: 'Fase de Grupos', ROUND_OF_16: 'Oitavas de Final',
    QUARTER_FINALS: 'Quartas de Final', SEMI_FINALS: 'Semifinais', FINAL: 'Final',
  }
  return (MAP[stage] ?? stage.replace(/_/g,' ')) + g
}

// Cor baseada no horário BRT do jogo — mesmo horário = mesma cor em todos os dias
function matchAccent(utcDate: string): string {
  const h = toBR(utcDate).getUTCHours()
  if (h < 15) return '#3b82f6'  // até 14h BRT → azul
  if (h < 18) return '#f59e0b'  // 15h–17h      → âmbar
  if (h < 21) return '#ff006e'  // 18h–20h      → rosa
  return '#a855f7'               // 21h+          → roxo
}

function nextFuture(all: CopaMatch[]): CopaMatch | null {
  const now = Date.now()
  return all
    .filter(m => m.status === 'SCHEDULED' && new Date(m.utcDate).getTime() > now)
    .sort((a,b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())[0] ?? null
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Zone = 'topbar' | 'hero' | 'rows'
interface NavState { zone: Zone; rowIdx: number; colIdx: number }

interface DayRow     { type: 'day';     date: string; items: CopaMatch[] }
interface ChRow      { type: 'channels';               items: CopaChannel[] }
interface ScorerRow  { type: 'scorers';                items: TopScorer[] }
interface GroupsRow  { type: 'groups';                 items: CopaGroup[] }
type AnyRow = DayRow | ChRow | ScorerRow | GroupsRow

// ─── Constants (same as HomeScreen) ──────────────────────────────────────────

const ACCENT = '#ff006e'
const GLOW   = 'rgba(255,0,110,0.45)'

// ─── GroupRows — mesma estrutura visual do MatchCarousel ─────────────────────

interface GroupRowsProps {
  standings: CopaGroup[]
  focusedIdx: number
  isFocused: boolean
  CARD_W: number; CARD_H: number; CENTRAL_W: number; CENTRAL_H: number
  GAP: number; SIDE_GAP: number; centralLeft: number
  LATERAL_TOP: number; DESC_AREA?: number; vw: number
}

function GroupRows({ standings, focusedIdx, isFocused,
  CARD_W, CARD_H, CENTRAL_W, CENTRAL_H, GAP, SIDE_GAP, centralLeft, LATERAL_TOP, DESC_AREA = 0, vw,
}: GroupRowsProps) {
  const isRowFocused = isFocused
  const total = standings.length
  const rowH = isRowFocused ? LATERAL_TOP + CENTRAL_H + DESC_AREA : CARD_H + Math.round(10 * vw)
  const slots: { group: typeof standings[0]; idx: number; offset: number }[] = []
  for (let offset = -3; offset <= 3; offset++) {
    const idx = ((focusedIdx + offset) % total + total) % total
    slots.push({ group: standings[idx], idx, offset })
  }
  const statW = Math.round(38 * vw)

  return (
    <div style={{ position: 'relative', width: '100%', height: rowH, overflow: 'visible' }}>
      {slots.map(({ group, offset }) => {
        const isCenter = offset === 0
        const isFarEdge = Math.abs(offset) >= 3
        const w = isCenter ? CENTRAL_W : CARD_W
        const h = isCenter ? CENTRAL_H : CARD_H
        const fs = Math.round((isCenter ? 17 : 13) * vw)
        const fsMuted = Math.round((isCenter ? 14 : 11) * vw)

        let tx: number
        if (offset < 0)      tx = centralLeft - SIDE_GAP - (-offset) * (CARD_W + GAP) + GAP
        else if (offset > 0) tx = centralLeft + CENTRAL_W + SIDE_GAP + (offset - 1) * (CARD_W + GAP)
        else                 tx = centralLeft

        return (
          <div key={`${offset}`} style={{
            position: 'absolute', top: isCenter ? 0 : LATERAL_TOP, width: w, height: h,
            transform: `translate3d(${tx}px, 0, 0)`,
            transition: isFarEdge ? 'none' : 'transform 280ms cubic-bezier(0.2,0,0,1)',
            borderRadius: Math.round(8 * vw), overflow: 'hidden', background: '#0d0d14',
            border: isCenter && isFocused ? '2px solid #ff006e' : `1px solid rgba(255,255,255,0.15)`,
            display: 'flex', flexDirection: 'column',
            opacity: isFarEdge ? 0 : isFocused && !isCenter ? 0.85 : 1,
            zIndex: isCenter ? 10 : 1,
            boxShadow: isCenter && isFocused ? '0 0 40px rgba(255,0,110,0.4), 0 8px 32px rgba(0,0,0,0.6)' : 'none',
            willChange: 'transform',
          }}>
            {/* Cabeçalho do grupo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(10 * vw), padding: `${Math.round(14 * vw)}px ${Math.round(20 * vw)}px`, borderBottom: '1px solid rgba(255,255,255,0.10)', background: isCenter && isFocused ? 'rgba(255,0,110,0.08)' : 'rgba(255,255,255,0.03)', flexShrink: 0 }}>
              <span style={{ fontSize: Math.round((isCenter ? 20 : 14) * vw) }}>🏆</span>
              <span style={{ fontSize: Math.round((isCenter ? 20 : 14) * vw), fontWeight: 800, color: isCenter && isFocused ? '#ff006e' : '#fff', fontFamily: '"Outfit",sans-serif', letterSpacing: 0.5, flex: 1 }}>
                {group.name}
              </span>
            </div>
            {/* Header colunas — só card central */}
            {isCenter && !isFarEdge && (
              <div style={{ display: 'flex', alignItems: 'center', padding: `${Math.round(6 * vw)}px ${Math.round(20 * vw)}px`, borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                <div style={{ width: Math.round(28 * vw), flexShrink: 0 }} />
                <div style={{ width: Math.round(38 * vw), flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: fsMuted, color: 'rgba(255,255,255,0.35)', fontFamily: '"Outfit",sans-serif', fontWeight: 600 }}>Time</div>
                {(['J','V','E','D','DIFF','GLS','PTS'] as const).map(col => (
                  <div key={col} style={{ width: statW, flexShrink: 0, textAlign: 'center', fontSize: fsMuted, color: col === 'PTS' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)', fontFamily: '"Outfit",sans-serif', fontWeight: col === 'PTS' ? 700 : 600 }}>{col}</div>
                ))}
              </div>
            )}
            {/* Linhas dos times */}
            {!isFarEdge && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                {group.standings.map((s, tIdx) => {
                  const isTop2 = tIdx < 2
                  const diff = (s.goalsFor ?? 0) - (s.goalsAgainst ?? 0)
                  const diffStr = diff > 0 ? `+${diff}` : `${diff}`
                  const glsStr = `${s.goalsFor ?? 0}:${s.goalsAgainst ?? 0}`
                  return (
                    <div key={tIdx} style={{ display: 'flex', alignItems: 'center', padding: `${Math.round((isCenter ? 10 : 7) * vw)}px ${Math.round(20 * vw)}px`, background: isTop2 ? 'rgba(255,0,110,0.06)' : 'transparent', borderBottom: tIdx < group.standings.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <div style={{ width: Math.round(28 * vw), flexShrink: 0, textAlign: 'center', fontSize: fs, fontWeight: 700, color: isTop2 ? '#ff006e' : 'rgba(255,255,255,0.3)', fontFamily: '"Outfit",sans-serif' }}>{tIdx + 1}</div>
                      <img src={s.team.crest} alt={s.team.shortName} style={{ width: Math.round((isCenter ? 30 : 22) * vw), height: Math.round((isCenter ? 20 : 15) * vw), objectFit: 'contain', flexShrink: 0, marginRight: Math.round(8 * vw) }} />
                      <div style={{ flex: 1, fontSize: fs, fontWeight: isTop2 ? 700 : 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: '"Outfit",sans-serif' }}>
                        {isCenter ? s.team.name : s.team.shortName}
                      </div>
                      {isCenter && [s.playedGames ?? 0, s.won ?? 0, s.draw ?? 0, s.lost ?? 0, diffStr, glsStr].map((val, ci) => (
                        <div key={ci} style={{ width: statW, flexShrink: 0, textAlign: 'center', fontSize: fs, fontWeight: 500, color: 'rgba(255,255,255,0.55)', fontFamily: '"Outfit",sans-serif' }}>{val}</div>
                      ))}
                      {isCenter && <div style={{ width: statW, flexShrink: 0, textAlign: 'center', fontSize: Math.round(18 * vw), fontWeight: 900, color: isTop2 ? '#ff006e' : '#fff', fontFamily: '"Outfit",sans-serif' }}>{s.points}</div>}
                      {!isCenter && (
                        <div style={{ fontSize: Math.round(12 * vw), color: 'rgba(255,255,255,0.45)', display: 'flex', gap: Math.round(6 * vw) }}>
                          <span>{s.playedGames}J</span>
                          <span style={{ color: isTop2 ? '#ff006e' : '#fff', fontWeight: 700 }}>{s.points}pts</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CopaView({ vw, onBack }: Props) {
  // Card sizing — identical to HomeScreen
  const CARD_W     = Math.round(317 * 1.10 * vw)
  const CARD_H     = Math.round(475 * 1.10 * vw)
  const CENTRAL_H  = Math.round(CARD_H * 1.15) + 40
  const CENTRAL_W  = Math.round(CENTRAL_H * 1.77)
  const GAP        = Math.round(16 * vw)
  const SIDE_GAP   = Math.round(24 * vw)
  const HERO_H     = Math.round(window.innerHeight * 0.82)

  // Centralizado (sem offset de sidebar — Copa tem tela cheia)
  const centralLeft   = Math.floor((window.innerWidth - CENTRAL_W) / 2)
  const uniformCenter = Math.floor((window.innerWidth - CARD_W)   / 2)

  // ─── Data — inicia com mock imediatamente, atualiza se Supabase tiver dados ──
  const [byDay, setByDay]       = useState<Record<string,CopaMatch[]>>(MOCK_BY_DAY)
  const [allMatches, setAll]    = useState<CopaMatch[]>(MOCK_MATCHES)
  const [liveMatch, setLive]    = useState<CopaMatch | null>(MOCK_LIVE)
  const [standings, setStands]  = useState<CopaGroup[]>(MOCK_STANDINGS)
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    Promise.all([
      copaService.getMatchesByDay(),
      copaService.getLiveMatch(),
      copaService.getStandings(),
    ]).then(([bd, live, std]) => {
      setByDay(bd)
      setAll(Object.values(bd).flat())
      setLive(live)
      setStands(std)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    const id = setInterval(() => copaService.getLiveMatch().then(setLive).catch(()=>{}), 30_000)
    return () => clearInterval(id)
  }, [])

  // ─── Artilheiros ────────────────────────────────────────────────────────────
  const [heroTab, setHeroTab]       = useState<0|1>(0)
  const heroTabRef                  = useRef<0|1>(0); heroTabRef.current = heroTab
  const [topScorers, setTopScorers] = useState<TopScorer[]>(MOCK_TOP_SCORERS)

  // ─── Rows (by day ≥ today, then channels) ──────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const sortedDays = Object.keys(byDay).filter(d => d >= today).sort()

  // 7 rows fixas — uma por dia da semana a partir do início da Copa (ou hoje se já começou)
  const copaStart = '2026-06-11'
  const todayStr = new Date().toISOString().slice(0, 10)
  const startDate = todayStr >= copaStart ? todayStr : copaStart
  const weekDays: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() + i)
    weekDays.push(d.toISOString().slice(0, 10))
  }

  const rows: AnyRow[] = [
    { type: 'groups' as const, items: standings },
    ...weekDays.map(date => ({ type: 'day' as const, date, items: byDay[date] ?? [] })),
    { type: 'scorers'  as const, items: topScorers },
    { type: 'channels' as const, items: COPA_WATCH_CHANNELS },
  ]
  const rowLen = (r: AnyRow) => Math.max(1, r.items.length)

  // ─── Hero content ───────────────────────────────────────────────────────────
  const heroMatch = liveMatch ?? nextFuture(allMatches)
  const heroIsLive = liveMatch != null

  // ─── Navigation ─────────────────────────────────────────────────────────────
  const [nav, setNav] = useState<NavState>({ zone: 'hero', rowIdx: 0, colIdx: 0 })
  const navRef = useRef(nav); navRef.current = nav
  
  const [groupIdx, setGroupIdx] = useState(0)
  const groupIdxRef = useRef(0); groupIdxRef.current = groupIdx

  const [selectedMatch, setSelectedMatch] = useState<CopaMatch | null>(null)
  const [watchChannel, setWatchChannel]   = useState<CopaChannel | null>(null)

  // ─── GPU scroll refs (same as HomeScreen) ──────────────────────────────────
  const rowsWrapRef = useRef<HTMLDivElement | null>(null)
  const rowRefs     = useRef<(HTMLDivElement | null)[]>([])

  // GPU scroll — um único effect, mesmo padrão do HomeScreen
  const prevZoneRef = useRef<Zone>('topbar')
  useEffect(() => {
    if (!rowsWrapRef.current) return
    const { zone, rowIdx } = nav
    const comingFromHero = prevZoneRef.current !== 'rows' && zone === 'rows'
    prevZoneRef.current = zone

    if (zone === 'topbar' || zone === 'hero') {
      rowsWrapRef.current.style.transition = 'transform 500ms cubic-bezier(0.2,0,0,1)'
      rowsWrapRef.current.style.transform  = `translate3d(0, ${HERO_H}px, 0)`
      return
    }
    const row = rowRefs.current[rowIdx]
    if (row) {
      // Clamp to 0 — negative targetScroll produces "--Npx" (invalid CSS) which is silently ignored
      const targetScroll = Math.max(0, row.offsetTop - 80)
      rowsWrapRef.current.style.transition = comingFromHero
        ? 'transform 500ms cubic-bezier(0.2,0,0,1)'
        : 'none'
      rowsWrapRef.current.style.transform  = `translate3d(0, -${targetScroll}px, 0)`
    }
  }, [nav.zone, nav.rowIdx])

  // ─── D-pad ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedMatch || watchChannel) return

    const handle = (e: KeyboardEvent) => {
      const isBack  = e.keyCode === 10009 || e.keyCode === 8 || e.key === 'Backspace'
      const isLeft  = e.keyCode === 37 || e.key === 'ArrowLeft'
      const isRight = e.keyCode === 39 || e.key === 'ArrowRight'
      const isUp    = e.keyCode === 38 || e.key === 'ArrowUp'
      const isDown  = e.keyCode === 40 || e.key === 'ArrowDown'
      const isEnter = e.keyCode === 13  || e.keyCode === 10232 || e.key === 'Enter'

      if (!isBack && !isLeft && !isRight && !isUp && !isDown && !isEnter) return
      e.preventDefault(); e.stopPropagation()

      const { zone, rowIdx, colIdx } = navRef.current

      // Back sobe um nível em vez de sair diretamente
      if (isBack) {
        if (zone === 'topbar') { onBack?.(); return }
        if (zone === 'hero')   { setNav(n => ({ ...n, zone: 'topbar' })); return }
        if (zone === 'rows')   { setNav(n => ({ ...n, zone: 'hero' }));   return }
        return
      }

      if (zone === 'topbar') {
        if (isDown) setNav({ zone: 'hero', rowIdx: 0, colIdx: 0 })
        return
      }

      if (zone === 'hero') {
        if (isUp) {
          setNav(n => ({ ...n, zone: 'topbar' }))
          return
        }
        if (isLeft) {
          setGroupIdx(g => (g - 1 + standings.length) % standings.length)
          return
        }
        if (isRight) {
          setGroupIdx(g => (g + 1) % standings.length)
          return
        }
        if (isDown) setNav({ zone: 'rows', rowIdx: 0, colIdx: 0 })
        if (isEnter && heroTabRef.current === 0 && heroMatch) setSelectedMatch(heroMatch)
        return
      }

      // zone === 'rows'
      if (isUp) {
        if (rowIdx === 0) setNav(n => ({ ...n, zone: 'hero', colIdx: 0 }))
        else setNav(n => ({ ...n, rowIdx: rowIdx-1, colIdx: Math.min(colIdx, rowLen(rows[rowIdx-1])-1) }))
        return
      }
      if (isDown && rowIdx < rows.length-1) {
        setNav(n => ({ ...n, rowIdx: rowIdx+1, colIdx: Math.min(colIdx, rowLen(rows[rowIdx+1])-1) }))
        return
      }
      const len = rowLen(rows[rowIdx])
      if (isLeft)  { setNav(n => ({ ...n, colIdx: (colIdx - 1 + len) % len })); return }
      if (isRight) { setNav(n => ({ ...n, colIdx: (colIdx + 1) % len })); return }

      if (isEnter) {
        const row = rows[rowIdx]
        if (row.type === 'day')      setSelectedMatch((row.items as CopaMatch[])[colIdx])
        else if (row.type === 'channels') setWatchChannel((row.items as CopaChannel[])[colIdx])
      }
    }
    window.addEventListener('keydown', handle, { capture: true })
    return () => window.removeEventListener('keydown', handle, { capture: true })
  }, [selectedMatch, watchChannel, rows, heroMatch, standings, onBack])

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: '#000',
      fontFamily: '"Outfit", sans-serif',
      color: '#fff',
      overflow: 'hidden',
    }}>

      {/* ── HERO — identical layout to HomeBanner.tsx ───────────────────── */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: HERO_H,
        overflow: 'hidden',
        zIndex: 10,
        opacity: nav.zone === 'rows' ? 0 : 1,
        visibility: nav.zone === 'rows' ? 'hidden' : 'visible',
        transform: nav.zone === 'rows' ? 'translateY(-20%)' : 'translateY(0)',
        transition: 'opacity 400ms ease-out, transform 400ms ease-out, visibility 400ms step-end',
        border: nav.zone === 'hero' ? `2px solid ${ACCENT}` : '2px solid transparent',
        background: '#050810',
      }}>
        {/* Hero banner image */}
        <img src="/copa-bg.jpg" alt="" style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center 30%',
          opacity: 1,
          pointerEvents: 'none',
        }} />

        {/* Sem gradientes — imagem em cor real */}

        {/* Content — ESCONDIDO, só mostra grupos agora */}
        {false && (
          <div style={{
            position: 'absolute',
            bottom: 160, left: 206,
            zIndex: 3, maxWidth: '40%',
            animation: 'copaHeroIn 600ms cubic-bezier(0.22,1,0.36,1) 200ms both',
          }}>
            {loading ? (
              <HeroLoading />
            ) : heroTab === 1 ? (
              <HeroScorers scorers={topScorers} isFocused={nav.zone === 'hero'} />
            ) : heroMatch ? (
              <HeroMatchContent match={heroMatch as CopaMatch} isLive={heroIsLive} isFocused={nav.zone === 'hero'} onEnter={() => setSelectedMatch(heroMatch!)} />
            ) : (
              <HeroPromo isFocused={nav.zone === 'hero'} />
            )}
          </div>
        )}

        {/* Tab indicator — ESCONDIDO */}
        {false && nav.zone === 'hero' && (
          <div style={{ position: 'absolute', bottom: 28, left: 206, zIndex: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {([0, 1] as const).map(t => (
                <div key={t} style={{
                  width: t === heroTab ? 22 : 7, height: 7,
                  borderRadius: 4, transition: 'width 200ms ease',
                  background: t === heroTab ? '#fff' : 'rgba(255,255,255,0.22)',
                }} />
              ))}
            </div>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', letterSpacing: 1 }}>
              ◄ ► {heroTab === 0 ? 'ARTILHEIROS' : 'PRÓXIMO JOGO'}
            </span>
          </div>
        )}

      </div>

      {/* ── ROWS SCROLL AREA — same structure as HomeScreen ───────────── */}
      <div style={{
        position: 'absolute', inset: 0,
        overflow: 'hidden',
        zIndex: 15,
        pointerEvents: nav.zone === 'rows' ? 'auto' : 'none',
      }}>
        {/* Gradient overlays — same as HomeScreen */}
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: '15%',
          pointerEvents: 'none', zIndex: 200,
          background: 'linear-gradient(to bottom, #000 0%, transparent 100%)',
          opacity: nav.zone === 'rows' ? 0.7 : 0,
        }} />
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, height: '15%',
          pointerEvents: 'none', zIndex: 200,
          background: 'linear-gradient(to top, #000 0%, transparent 100%)',
          opacity: nav.zone === 'rows' ? 0.7 : 0,
        }} />

        <div ref={rowsWrapRef} style={{ paddingTop: 80, willChange: 'transform' }}>
          {rows.map((row, rowIdx) => {
            if (Math.abs((nav.zone === 'rows' ? nav.rowIdx : 0) - rowIdx) > 3) return null

            const isRowFocused = nav.zone === 'rows' && nav.rowIdx === rowIdx
            const focusedColIdx = nav.zone === 'rows' && nav.rowIdx === rowIdx ? nav.colIdx : 0

            const TITLE_AREA = Math.round(10 * vw)
            const DESC_AREA  = Math.round(80 * vw)
            const LATERAL_TOP = (isRowFocused ? TITLE_AREA : 0) + Math.round((CENTRAL_H - CARD_H) / 2)

            if (row.type === 'groups') {
              return (
                <div key="groups"
                  ref={el => { rowRefs.current[rowIdx] = el }}
                  style={{ padding: `${rowIdx === 0 ? 0 : 20}px 0 24px`, overflow: 'visible' }}
                >
                  <div style={{ padding: '0 80px', marginBottom: 14, display: 'flex', alignItems: 'baseline', gap: 7 }}>
                    <span style={{ fontSize: 20, fontWeight: 400, color: 'rgba(255,255,255,0.42)', fontFamily: '"Outfit",sans-serif' }}>
                      copa 2026 ·
                    </span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', fontFamily: '"Outfit",sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      GRUPOS
                    </span>
                  </div>
                  <GroupRows
                    standings={row.items as CopaGroup[]}
                    focusedIdx={focusedColIdx}
                    isFocused={isRowFocused}
                    CARD_W={CARD_W} CARD_H={CARD_H}
                    CENTRAL_W={CENTRAL_W} CENTRAL_H={CENTRAL_H}
                    GAP={GAP} SIDE_GAP={SIDE_GAP}
                    centralLeft={centralLeft}
                    LATERAL_TOP={LATERAL_TOP}
                    DESC_AREA={DESC_AREA}
                    vw={vw}
                  />
                </div>
              )
            }

            if (row.type === 'scorers') {
              return (
                <div key="scorers"
                  ref={el => { rowRefs.current[rowIdx] = el }}
                  style={{ padding: '20px 0 24px', overflow: 'visible' }}
                >
                  <div style={{ padding: '0 80px', marginBottom: 14, display: 'flex', alignItems: 'baseline', gap: 7 }}>
                    <span style={{ fontSize: 20, fontWeight: 400, color: 'rgba(255,255,255,0.42)', fontFamily: '"Outfit",sans-serif' }}>
                      copa 2026 ·
                    </span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', fontFamily: '"Outfit",sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      ARTILHEIROS
                    </span>
                  </div>
                  <ScorerCarousel
                    scorers={row.items as TopScorer[]}
                    focusedColIdx={isRowFocused ? nav.colIdx : 0}
                    isRowFocused={isRowFocused}
                    CARD_W={CARD_W} CARD_H={CARD_H}
                    CENTRAL_W={CENTRAL_W} CENTRAL_H={CENTRAL_H}
                    GAP={GAP} SIDE_GAP={SIDE_GAP}
                    centralLeft={centralLeft} uniformCenter={uniformCenter}
                    TITLE_AREA={TITLE_AREA} DESC_AREA={DESC_AREA}
                    LATERAL_TOP={LATERAL_TOP}
                    vw={vw}
                  />
                </div>
              )
            }

            if (row.type === 'channels') {
              return (
                <div key="channels"
                  ref={el => { rowRefs.current[rowIdx] = el }}
                  style={{ padding: '20px 0 24px', overflow: 'visible' }}
                >
                  {/* Row title — same style as HomeScreen */}
                  <div style={{ padding: '0 80px', marginBottom: 14, display: 'flex', alignItems: 'baseline', gap: 7 }}>
                    <span style={{ fontSize: 20, fontWeight: 400, color: 'rgba(255,255,255,0.42)', fontFamily: '"Outfit",sans-serif' }}>
                      assistir ao vivo ·
                    </span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', fontFamily: '"Outfit",sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      CANAIS COPA 2026
                    </span>
                  </div>
                  {/* Cards — same carousel system */}
                  <ChannelCarousel
                    channels={row.items as CopaChannel[]}
                    focusedCol={isRowFocused ? nav.colIdx : -1}
                    isRowFocused={isRowFocused}
                    CARD_W={CARD_W} CARD_H={CARD_H}
                    CENTRAL_W={CENTRAL_W} CENTRAL_H={CENTRAL_H}
                    GAP={GAP} SIDE_GAP={SIDE_GAP}
                    centralLeft={centralLeft} uniformCenter={uniformCenter}
                    TITLE_AREA={TITLE_AREA} DESC_AREA={DESC_AREA}
                    LATERAL_TOP={LATERAL_TOP}
                    vw={vw}
                    onSelect={(ch) => setWatchChannel(ch)}
                  />
                </div>
              )
            }

            // Day row
            const { muted, accent } = dayLabel(row.date)
            const matches = row.items as CopaMatch[]
            const hasLive = matches.some(m => m.status === 'IN_PLAY' || m.status === 'LIVE')
            const noMatches = matches.length === 0

            return (
              <div key={row.date}
                ref={el => { rowRefs.current[rowIdx] = el }}
                style={{ padding: `${rowIdx === 0 ? 0 : 20}px 0 24px`, overflow: 'visible' }}
              >
                {/* Row title — same as HomeScreen */}
                <div style={{ padding: '0 80px', marginBottom: 14, display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  {muted && (
                    <span style={{ fontSize: 20, fontWeight: 400, color: 'rgba(255,255,255,0.42)', fontFamily: '"Outfit",sans-serif', letterSpacing: 0.3 }}>
                      {muted}
                    </span>
                  )}
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', fontFamily: '"Outfit",sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {accent}
                  </span>
                  {hasLive && (
                    <span style={{
                      marginLeft: 8, background: '#e50914', borderRadius: 4,
                      padding: '3px 9px', fontSize: 10, fontWeight: 900,
                      letterSpacing: 1.5, color: '#fff',
                    }}>
                      AO VIVO
                    </span>
                  )}
                </div>

                {/* Match carousel ou placeholder */}
                {noMatches ? (
                  <div style={{
                    height: CARD_H,
                    display: 'flex', alignItems: 'center',
                    paddingLeft: uniformCenter,
                    fontSize: Math.round(18 * vw),
                    color: 'rgba(255,255,255,0.25)',
                    fontFamily: '"Outfit",sans-serif',
                    fontStyle: 'italic',
                  }}>
                    Nenhum jogo da Copa neste dia
                  </div>
                ) : (
                <MatchCarousel
                  matches={matches}
                  focusedColIdx={focusedColIdx}
                  isRowFocused={isRowFocused}
                  CARD_W={CARD_W} CARD_H={CARD_H}
                  CENTRAL_W={CENTRAL_W} CENTRAL_H={CENTRAL_H}
                  GAP={GAP} SIDE_GAP={SIDE_GAP}
                  centralLeft={centralLeft} uniformCenter={uniformCenter}
                  TITLE_AREA={TITLE_AREA} DESC_AREA={DESC_AREA}
                  LATERAL_TOP={LATERAL_TOP}
                  vw={vw}
                  onSelect={(m) => setSelectedMatch(m)}
                />
                )}
              </div>
            )
          })}

          <div style={{ height: 400 }} />
        </div>
      </div>

      {/* ── Match Detail Overlay ──────────────────────────────────────── */}
      {selectedMatch && (
        <MatchDetailOverlay
          match={selectedMatch}
          onClose={() => setSelectedMatch(null)}
          onWatchChannel={(ch) => { setSelectedMatch(null); setWatchChannel(ch) }}
        />
      )}

      {/* ── YouTube Player Overlay ──────────────────────────────────── */}
      {watchChannel && (
        <YoutubePlayer channel={watchChannel} vw={vw} onClose={() => setWatchChannel(null)} />
      )}

      <style>{`
        @keyframes copaHeroIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes copaLivePulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        @keyframes cardImgEnter {
          from { opacity: 0; transform: scale(1.06); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

// ─── Hero content blocks ──────────────────────────────────────────────────────

function HeroLoading() {
  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 18 }}>
        Carregando dados da Copa...
      </div>
      <div style={{ width: 180, height: 4, borderRadius: 2, background: '#ff006e', opacity: 0.3 }} />
    </div>
  )
}

function HeroPromo({ isFocused }: { isFocused: boolean }) {
  return (
    <div>
      <div style={{
        display: 'inline-block', background: ACCENT, color: '#fff',
        fontSize: 12, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase',
        padding: '5px 14px', borderRadius: 4, marginBottom: 22,
        boxShadow: `0 4px 20px ${GLOW}`,
      }}>🏆 COPA 2026</div>
      <div style={{
        fontSize: 67, fontWeight: 900, lineHeight: 0.95, color: '#fff',
        fontFamily: '"Barlow Condensed","Outfit",sans-serif',
        letterSpacing: -0.5, textShadow: '0 4px 24px rgba(0,0,0,0.9)', marginBottom: 10,
      }}>
        EUA · México<br />Canadá
      </div>
      <div style={{
        fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.55)',
        letterSpacing: 4, textTransform: 'uppercase', marginBottom: 14,
      }}>
        48 seleções · 104 jogos
      </div>
      <div style={{
        fontSize: 17, fontWeight: 300, color: 'rgba(255,255,255,0.68)',
        lineHeight: 1.6, marginBottom: 32, maxWidth: 560,
      }}>
        A Copa do Mundo 2026 será a maior da história. Junho e Julho de 2026, ao vivo no Brasil.
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{
          padding: '14px 40px', borderRadius: 6,
          fontSize: 19, fontWeight: 700, fontFamily: '"Outfit",sans-serif',
          background: isFocused ? '#fff' : 'rgba(255,255,255,0.15)',
          color: isFocused ? '#000' : '#fff',
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          boxShadow: isFocused ? '0 4px 24px rgba(255,255,255,0.2)' : 'none',
          border: isFocused ? 'none' : `1.5px solid rgba(255,255,255,0.2)`,
        }}>
          📅 Ver Jogos
        </div>
      </div>
    </div>
  )
}

function HeroMatchContent({ match, isLive, isFocused, onEnter }: {
  match: CopaMatch; isLive: boolean; isFocused: boolean; onEnter: () => void
}) {
  const isFinished = match.status === 'FINISHED'
  const badge = isLive ? '🔴 AO VIVO' : isFinished ? '✅ ENCERRADO' : '🏆 COPA 2026'

  const titleLine = (isLive || isFinished) && match.score.home != null
    ? `${match.homeTeam.shortName}  ${match.score.home} × ${match.score.away}  ${match.awayTeam.shortName}`
    : `${match.homeTeam.shortName} × ${match.awayTeam.shortName}`

  const sub = stageLabel(match.stage, match.group)
  const desc = isLive
    ? `Minuto ${match.minute ?? '?'} · ${match.venue ?? ''}`
    : `${formatFullDate(match.utcDate)} · ${formatTime(match.utcDate)} (Brasília)${match.venue ? ' · ' + match.venue : ''}`

  return (
    <div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: isLive ? '#e50914' : ACCENT,
        color: '#fff', fontSize: 12, fontWeight: 800,
        letterSpacing: 3, textTransform: 'uppercase',
        padding: '5px 14px', borderRadius: 4, marginBottom: 22,
        boxShadow: `0 4px 20px ${isLive ? 'rgba(229,9,20,0.5)' : GLOW}`,
      }}>
        {isLive && (
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: '#fff',
            animation: 'copaLivePulse 1.4s ease-in-out infinite',
          }} />
        )}
        {badge}
      </div>

      <div style={{
        fontSize: 67, fontWeight: 900, lineHeight: 0.95, color: '#fff',
        fontFamily: '"Barlow Condensed","Outfit",sans-serif',
        letterSpacing: -0.5, textShadow: '0 4px 24px rgba(0,0,0,0.9)', marginBottom: 10,
      }}>
        {titleLine}
      </div>

      <div style={{
        fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.55)',
        letterSpacing: 4, textTransform: 'uppercase', marginBottom: 14,
      }}>
        {sub}
      </div>

      <div style={{
        fontSize: 17, fontWeight: 300, color: 'rgba(255,255,255,0.68)',
        lineHeight: 1.6, marginBottom: 32, maxWidth: 560,
      }}>
        {desc}
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <div
          onClick={onEnter}
          style={{
            padding: '14px 40px', borderRadius: 6, fontSize: 19, fontWeight: 700,
            fontFamily: '"Outfit",sans-serif',
            background: isFocused ? '#fff' : 'rgba(80,80,82,0.55)',
            color: isFocused ? '#000' : '#fff',
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            boxShadow: isFocused ? '0 4px 24px rgba(255,255,255,0.2)' : 'none',
            border: isFocused ? 'none' : '1.5px solid rgba(255,255,255,0.2)',
          }}
        >
          {isLive ? '▶ Assistir ao Vivo' : '📋 Ver Detalhes'}
        </div>
        <div style={{
          padding: '14px 40px', borderRadius: 6, fontSize: 19, fontWeight: 700,
          fontFamily: '"Outfit",sans-serif',
          background: 'rgba(80,80,82,0.55)', color: '#fff',
          border: '1.5px solid rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
        }}>
          📺 Onde Assistir
        </div>
      </div>
    </div>
  )
}

// ─── Match Carousel (replicates HomeScreen row layout exactly) ────────────────

function MatchCarousel({ matches, focusedColIdx, isRowFocused,
  CARD_W, CARD_H, CENTRAL_W, CENTRAL_H, GAP, SIDE_GAP,
  centralLeft, uniformCenter, TITLE_AREA, DESC_AREA, LATERAL_TOP,
  vw, onSelect,
}: {
  matches: CopaMatch[]; focusedColIdx: number; isRowFocused: boolean
  CARD_W: number; CARD_H: number; CENTRAL_W: number; CENTRAL_H: number
  GAP: number; SIDE_GAP: number; centralLeft: number; uniformCenter: number
  TITLE_AREA: number; DESC_AREA: number; LATERAL_TOP: number
  vw: number
  onSelect: (m: CopaMatch) => void
}) {
  const total = matches.length
  const rowH = isRowFocused ? TITLE_AREA + CENTRAL_H + DESC_AREA : CARD_H + Math.round(10 * vw)

  // Build slots for offsets -3..3 (both sides), allow circular repeats so right
  // side is never skipped when total < offset range.
  const slots: { m: CopaMatch; ci: number; offset: number }[] = []
  for (let offset = -3; offset <= 3; offset++) {
    const ci = ((focusedColIdx + offset) % total + total) % total
    slots.push({ m: matches[ci], ci, offset })
  }

  const focusedMatch = matches[focusedColIdx]
  const focusedAccent = matchAccent(focusedMatch?.utcDate ?? '')

  return (
    <div style={{ position: 'relative', width: '100%', height: rowH, overflow: 'visible', transition: 'none' }}>
      {/* Side cards */}
      {slots.map(({ m, ci, offset }) => {
        if (isRowFocused && offset === 0) return null

        const accent = matchAccent(m.utcDate)

        let tx: number
        if (isRowFocused) {
          if (offset < 0) tx = centralLeft - SIDE_GAP - (-offset) * (CARD_W + GAP) + GAP
          else            tx = centralLeft + CENTRAL_W + SIDE_GAP + (offset - 1) * (CARD_W + GAP)
        } else {
          tx = uniformCenter + offset * (CARD_W + GAP)
        }
        const topOff = isRowFocused ? LATERAL_TOP : 0
        const isFarEdge = Math.abs(offset) >= 3

        return (
          <div
            key={`side-${offset}`}
            onClick={() => onSelect(m)}
            style={{
              position: 'absolute', top: topOff, width: CARD_W, height: CARD_H,
              zIndex: 1, borderRadius: Math.round(8 * vw),
              cursor: 'pointer', overflow: 'hidden',
              border: `1px solid ${accent}44`,
              background: '#0d0d14',
              transform: `translate3d(${tx}px, 0, 0)`,
              opacity: isFarEdge ? 0 : isRowFocused ? 0.85 : 0.6,
              transition: 'transform 280ms cubic-bezier(0.2,0,0,1), opacity 200ms ease',
              willChange: 'transform',
            }}
          >
            <MatchCardPoster match={m} vw={vw} isCentral={false} accent={accent} />
          </div>
        )
      })}

      {/* Central focused card (16:9) */}
      {focusedMatch && isRowFocused && (
        <div
          onClick={() => onSelect(focusedMatch)}
          style={{
            position: 'absolute',
            top: TITLE_AREA, left: centralLeft,
            width: CENTRAL_W, height: CENTRAL_H,
            zIndex: 10, borderRadius: Math.round(8 * vw),
            cursor: 'pointer', overflow: 'hidden',
            border: `2px solid ${focusedAccent}`,
            background: '#0d0d14',
            boxShadow: `0 0 40px ${focusedAccent}44, 0 8px 32px rgba(0,0,0,0.6)`,
          }}
        >
          <MatchCardPoster key={focusedMatch.id} match={focusedMatch} vw={vw} isCentral={true} accent={focusedAccent} />

          {/* Description below card */}
          <div style={{
            position: 'absolute', bottom: -DESC_AREA, left: 0, right: 0,
            height: DESC_AREA, paddingTop: 12, zIndex: 15,
          }}>
            <div style={{
              fontSize: Math.round(20 * vw), fontWeight: 600,
              color: 'rgba(255,255,255,0.92)', fontFamily: '"Outfit",sans-serif',
              textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              textAlign: 'center',
            }}>
              {focusedMatch.homeTeam.shortName} × {focusedMatch.awayTeam.shortName}
            </div>
            <div style={{
              fontSize: Math.round(39 * vw), fontWeight: 700,
              color: focusedAccent, fontFamily: '"Outfit",sans-serif',
              textAlign: 'center', marginTop: 3,
              letterSpacing: 1,
            }}>
              {formatTime(focusedMatch.utcDate)} · {stageLabel(focusedMatch.stage, focusedMatch.group)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Channel Carousel ─────────────────────────────────────────────────────────

function ChannelCarousel({ channels, focusedCol, isRowFocused,
  CARD_W, CARD_H, CENTRAL_W, CENTRAL_H, GAP, SIDE_GAP,
  centralLeft, uniformCenter, TITLE_AREA, DESC_AREA, LATERAL_TOP,
  vw, onSelect,
}: {
  channels: CopaChannel[]; focusedCol: number; isRowFocused: boolean
  CARD_W: number; CARD_H: number; CENTRAL_W: number; CENTRAL_H: number
  GAP: number; SIDE_GAP: number; centralLeft: number; uniformCenter: number
  TITLE_AREA: number; DESC_AREA: number; LATERAL_TOP: number
  vw: number
  onSelect: (ch: CopaChannel) => void
}) {
  const total = channels.length
  const focusedColIdx = Math.max(0, Math.min(focusedCol, total - 1))
  const rowH = isRowFocused ? TITLE_AREA + CENTRAL_H + DESC_AREA : CARD_H + Math.round(10 * vw)

  const slots: { ch: CopaChannel; ci: number; offset: number }[] = []
  for (let offset = -4; offset <= 5; offset++) {
    const ci = ((focusedColIdx + offset) % total + total) % total
    if (offset !== 0 && slots.some(s => s.ci === ci)) continue
    slots.push({ ch: channels[ci], ci, offset })
  }
  const focusedCh = channels[focusedColIdx]

  return (
    <div style={{ position: 'relative', width: '100%', height: rowH, overflow: 'visible', transition: 'none' }}>
      {slots.map(({ ch, ci, offset }) => {
        if (isRowFocused && offset === 0) return null
        let tx: number
        if (isRowFocused) {
          if (offset < 0) tx = centralLeft - SIDE_GAP - (-offset) * (CARD_W + GAP) + GAP
          else            tx = centralLeft + CENTRAL_W + SIDE_GAP + (offset - 1) * (CARD_W + GAP)
        } else {
          tx = uniformCenter + offset * (CARD_W + GAP)
        }
        const isFarEdge = Math.abs(offset) >= 4
        return (
          <div key={`ch-${ci}-${offset}`} onClick={() => onSelect(ch)} style={{
            position: 'absolute', top: isRowFocused ? LATERAL_TOP : 0,
            width: CARD_W, height: CARD_H,
            zIndex: 1, borderRadius: Math.round(8 * vw),
            cursor: 'pointer', overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.08)',
            background: '#111',
            transform: `translate3d(${tx}px, 0, 0)`,
            opacity: 0.6,
            display: isFarEdge ? 'none' : 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: Math.round(12 * vw),
          }}>
            <div style={{ fontSize: Math.round(64 * vw) }}>{ch.logo}</div>
            <div style={{ fontSize: Math.round(18 * vw), fontWeight: 700, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{ch.name}</div>
          </div>
        )
      })}

      {focusedCh && isRowFocused && (
        <div onClick={() => onSelect(focusedCh)} style={{
          position: 'absolute', top: TITLE_AREA, left: centralLeft,
          width: CENTRAL_W, height: CENTRAL_H,
          zIndex: 10, borderRadius: Math.round(8 * vw),
          cursor: 'pointer', overflow: 'hidden',
          border: `2px solid ${ACCENT}`,
          background: 'linear-gradient(135deg, #111 0%, #1a1a2e 100%)',
          boxShadow: `0 0 40px rgba(255,0,110,0.25), 0 8px 32px rgba(0,0,0,0.6)`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: Math.round(20 * vw),
        }}>
          <div style={{ fontSize: Math.round(96 * vw) }}>{focusedCh.logo}</div>
          <div style={{ fontSize: Math.round(36 * vw), fontWeight: 900, color: '#fff' }}>{focusedCh.name}</div>
          <div style={{ fontSize: Math.round(18 * vw), color: 'rgba(255,255,255,0.45)', textAlign: 'center', maxWidth: '60%' }}>
            {focusedCh.description}
          </div>
          <div style={{
            marginTop: Math.round(8 * vw),
            background: ACCENT, borderRadius: 8,
            padding: `${Math.round(12 * vw)}px ${Math.round(36 * vw)}px`,
            fontSize: Math.round(20 * vw), fontWeight: 800, color: '#fff',
          }}>
            ▶ Assistir ao Vivo
          </div>

          {/* Description below the card */}
          <div style={{
            position: 'absolute', bottom: -DESC_AREA, left: 0, right: 0,
            height: DESC_AREA, paddingTop: 12, zIndex: 15,
          }}>
            <div style={{
              fontSize: Math.round(20 * vw), fontWeight: 600, color: 'rgba(255,255,255,0.92)',
              fontFamily: '"Outfit",sans-serif', textAlign: 'center',
            }}>
              {focusedCh.name}
            </div>
            <div style={{
              fontSize: Math.round(13 * vw), fontWeight: 400, color: 'rgba(255,255,255,0.45)',
              fontFamily: '"Outfit",sans-serif', textAlign: 'center', marginTop: 3,
            }}>
              {focusedCh.handle}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Match Card Poster ────────────────────────────────────────────────────────

function MatchCardPoster({ match, vw, isCentral, accent }: {
  match: CopaMatch; vw: number; isCentral: boolean; accent: string
}) {
  const isLive     = match.status === 'IN_PLAY' || match.status === 'LIVE' || match.status === 'PAUSED'
  const isFinished = match.status === 'FINISHED'
  const hasScore   = (isLive || isFinished) && match.score.home != null

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0d0d14' }}>
      {/* Imagem de fundo — 100% visível, sem camadas */}
      {isCentral && (
        <img src="/copa-trophy.jpg" alt="" style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center 30%',
          opacity: 1,
          pointerEvents: 'none',
          animation: 'cardImgEnter 300ms cubic-bezier(0.2,0,0,1) both',
        }} />
      )}
      {/* Accent color bar — top edge, identifies time slot */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: Math.round(3 * vw),
        background: isLive ? '#e50914' : accent,
        opacity: 0.85,
      }} />
      {/* Background gradient tinted by accent — só nos cards laterais */}
      {!isCentral && (
        <div style={{
          position: 'absolute', inset: 0,
          background: isLive
            ? 'radial-gradient(ellipse at center, rgba(229,9,20,0.10) 0%, #0d0d14 70%)'
            : `radial-gradient(ellipse at center, ${accent}0D 0%, #0d0d14 70%)`,
        }} />
      )}

      {/* Team crests */}
      <div style={{
        position: 'absolute', left: 0, right: 0,
        top: isCentral ? '20%' : '18%',
        display: 'flex', alignItems: 'center', justifyContent: 'space-evenly',
        padding: `0 ${Math.round(isCentral ? 60 : 20) * vw}px`,
      }}>
        <TeamCrestDisplay
          crest={match.homeTeam.crest}
          shortName={match.homeTeam.shortName}
          size={isCentral ? Math.round(192 * vw) : Math.round(80 * vw)}
          glow={isCentral ? accent : undefined}
          vw={vw}
        />

        {/* Score / VS */}
        <div style={{ textAlign: 'center', minWidth: Math.round(isCentral ? 120 : 60) * vw }}>
          {hasScore ? (
            <div style={{
              fontSize: isCentral ? Math.round(56 * vw) : Math.round(28 * vw),
              fontWeight: 900, color: '#fff',
              textShadow: isLive ? '0 0 20px rgba(229,9,20,0.5)' : 'none',
              lineHeight: 1,
            }}>
              {match.score.home}<span style={{ color: 'rgba(255,255,255,0.2)', margin: `0 ${Math.round(4*vw)}px` }}>×</span>{match.score.away}
            </div>
          ) : (
            <div style={{
              fontSize: isCentral ? Math.round(36 * vw) : Math.round(22 * vw),
              fontWeight: 300, color: 'rgba(255,255,255,0.2)',
            }}>vs</div>
          )}
        </div>

        <TeamCrestDisplay
          crest={match.awayTeam.crest}
          shortName={match.awayTeam.shortName}
          size={isCentral ? Math.round(192 * vw) : Math.round(80 * vw)}
          glow={isCentral ? accent : undefined}
          vw={vw}
        />
      </div>

      {/* Status badge — top center */}
      <div style={{
        position: 'absolute', top: Math.round(12 * vw), left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
      }}>
        {isLive ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: Math.round(5 * vw),
            background: 'rgba(229,9,20,0.3)', border: '1px solid rgba(229,9,20,0.5)',
            borderRadius: Math.round(4 * vw),
            padding: `${Math.round(3 * vw)}px ${Math.round(10 * vw)}px`,
            fontSize: Math.round(10 * vw), fontWeight: 900, letterSpacing: 1.5, color: '#ff6666',
          }}>
            <span style={{
              width: Math.round(5 * vw), height: Math.round(5 * vw),
              borderRadius: '50%', background: '#e50914',
              animation: 'copaLivePulse 1.4s ease-in-out infinite',
            }} />
            AO VIVO{match.minute != null ? ` ${match.minute}'` : ''}
          </div>
        ) : isFinished ? (
          <div style={{
            fontSize: Math.round(10 * vw), fontWeight: 700, letterSpacing: 1,
            color: 'rgba(255,255,255,0.3)',
          }}>✅ Encerrado</div>
        ) : (
          <div style={{
            fontSize: Math.round(10 * vw), fontWeight: 700, letterSpacing: 1,
            color: accent,
            background: `${accent}18`,
            border: `1px solid ${accent}44`,
            borderRadius: Math.round(4 * vw),
            padding: `${Math.round(3 * vw)}px ${Math.round(10 * vw)}px`,
          }}>
            {formatTime(match.utcDate)}
          </div>
        )}
      </div>

      {/* Bottom gradient — same as SideCard */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.92))',
        zIndex: 3,
      }} />

      {/* Bottom text — same position/style as SideCard */}
      <div style={{
        position: 'absolute', bottom: Math.round(12 * vw), left: Math.round(10 * vw), right: Math.round(10 * vw),
        zIndex: 4,
      }}>
        <div style={{
          fontSize: isCentral ? Math.round(22 * vw) : Math.round(13 * vw),
          fontWeight: 600, color: 'rgba(255,255,255,0.92)',
          fontFamily: '"Outfit",sans-serif', letterSpacing: 0.3,
          textShadow: '0 1px 6px rgba(0,0,0,0.9)',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          textAlign: 'center',
        }}>
          {match.homeTeam.shortName} × {match.awayTeam.shortName}
        </div>
        <div style={{
          fontSize: isCentral ? Math.round(14 * vw) : Math.round(11 * vw),
          fontWeight: 400, color: 'rgba(255,255,255,0.45)',
          fontFamily: '"Outfit",sans-serif',
          textAlign: 'center', marginTop: Math.round(2 * vw),
        }}>
          {match.group ? match.group.replace('GROUP_','Grupo ') : match.stage.replace(/_/g,' ')}
        </div>
      </div>
    </div>
  )
}

function TeamCrestDisplay({ crest, shortName, size, vw, glow }: {
  crest: string; shortName: string; size: number; vw: number; glow?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: Math.round(6 * vw) }}>
      {crest ? (
        <img src={crest} alt="" style={{
          width: size, height: size, objectFit: 'contain',
          filter: glow ? `drop-shadow(0 0 ${Math.round(size * 0.15)}px ${glow}) drop-shadow(0 0 ${Math.round(size * 0.3)}px ${glow}88)` : 'none',
        }} />
      ) : (
        <div style={{
          width: size, height: size, borderRadius: Math.round(8 * vw),
          background: 'rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.5, color: 'rgba(255,255,255,0.3)',
        }}>⚽</div>
      )}
      <span style={{
        fontSize: Math.round(size * 0.18),
        fontWeight: 700, color: glow ? '#fff' : 'rgba(255,255,255,0.6)',
        letterSpacing: 1, textTransform: 'uppercase',
        textShadow: glow ? `0 0 12px ${glow}` : 'none',
      }}>
        {shortName}
      </span>
    </div>
  )
}

// ─── Hero Scorers (tab 1 content) ────────────────────────────────────────────

function HeroScorers({ scorers, isFocused }: { scorers: TopScorer[]; isFocused: boolean }) {
  const top = scorers.slice(0, 5)
  return (
    <div>
      <div style={{
        display: 'inline-block', background: '#f59e0b', color: '#000',
        fontSize: 12, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase',
        padding: '5px 14px', borderRadius: 4, marginBottom: 22,
        boxShadow: '0 4px 20px rgba(245,158,11,0.45)',
      }}>⚽ ARTILHEIROS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {top.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{
              fontSize: 20, fontWeight: 900, minWidth: 28, textAlign: 'right',
              color: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'rgba(255,255,255,0.28)',
            }}>
              {s.position}
            </span>
            <span style={{ fontSize: 30 }}>{s.flag}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 19, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>{s.player}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{s.team}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{s.goals}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>gols</span>
              {s.assists > 0 && (
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>+{s.assists}a</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Scorer Carousel ──────────────────────────────────────────────────────────

const SCORER_ACCENT = '#f59e0b'

function ScorerCarousel({ scorers, focusedColIdx, isRowFocused,
  CARD_W, CARD_H, CENTRAL_W, CENTRAL_H, GAP, SIDE_GAP,
  centralLeft, uniformCenter, TITLE_AREA, DESC_AREA, LATERAL_TOP,
  vw,
}: {
  scorers: TopScorer[]; focusedColIdx: number; isRowFocused: boolean
  CARD_W: number; CARD_H: number; CENTRAL_W: number; CENTRAL_H: number
  GAP: number; SIDE_GAP: number; centralLeft: number; uniformCenter: number
  TITLE_AREA: number; DESC_AREA: number; LATERAL_TOP: number
  vw: number
}) {
  const total = scorers.length
  const rowH = isRowFocused ? TITLE_AREA + CENTRAL_H + DESC_AREA : CARD_H + Math.round(10 * vw)

  const slots: { s: TopScorer; ci: number; offset: number }[] = []
  for (let offset = -3; offset <= 3; offset++) {
    const ci = ((focusedColIdx + offset) % total + total) % total
    slots.push({ s: scorers[ci], ci, offset })
  }
  const focusedScorer = scorers[focusedColIdx]

  return (
    <div style={{ position: 'relative', width: '100%', height: rowH, overflow: 'visible', transition: 'none' }}>
      {slots.map(({ s, offset }) => {
        if (isRowFocused && offset === 0) return null
        let tx: number
        if (isRowFocused) {
          if (offset < 0) tx = centralLeft - SIDE_GAP - (-offset) * (CARD_W + GAP) + GAP
          else            tx = centralLeft + CENTRAL_W + SIDE_GAP + (offset - 1) * (CARD_W + GAP)
        } else {
          tx = uniformCenter + offset * (CARD_W + GAP)
        }
        const topOff = isRowFocused ? LATERAL_TOP : 0
        const isFarEdge = Math.abs(offset) >= 3
        return (
          <div key={`scorer-${offset}`} style={{
            position: 'absolute', top: topOff, width: CARD_W, height: CARD_H,
            zIndex: 1, borderRadius: Math.round(8 * vw),
            overflow: 'hidden',
            border: `1px solid ${SCORER_ACCENT}44`,
            background: '#0d0d14',
            transform: `translate3d(${tx}px, 0, 0)`,
            opacity: isFarEdge ? 0 : isRowFocused ? 0.85 : 0.6,
            transition: 'transform 280ms cubic-bezier(0.2,0,0,1), opacity 200ms ease',
            willChange: 'transform',
          }}>
            <ScorerCardPoster scorer={s} vw={vw} isCentral={false} />
          </div>
        )
      })}

      {focusedScorer && isRowFocused && (
        <div style={{
          position: 'absolute', top: TITLE_AREA, left: centralLeft,
          width: CENTRAL_W, height: CENTRAL_H,
          zIndex: 10, borderRadius: Math.round(8 * vw),
          overflow: 'hidden',
          border: `2px solid ${SCORER_ACCENT}`,
          background: '#0d0d14',
          boxShadow: `0 0 40px ${SCORER_ACCENT}44, 0 8px 32px rgba(0,0,0,0.6)`,
        }}>
          <ScorerCardPoster scorer={focusedScorer} vw={vw} isCentral={true} />
          <div style={{
            position: 'absolute', bottom: -DESC_AREA, left: 0, right: 0,
            height: DESC_AREA, paddingTop: 12, zIndex: 15,
          }}>
            <div style={{
              fontSize: Math.round(20 * vw), fontWeight: 600,
              color: 'rgba(255,255,255,0.92)', fontFamily: '"Outfit",sans-serif',
              textAlign: 'center',
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            }}>
              {focusedScorer.player}
            </div>
            <div style={{
              fontSize: Math.round(13 * vw), fontWeight: 700,
              color: SCORER_ACCENT, fontFamily: '"Outfit",sans-serif',
              textAlign: 'center', marginTop: 3, letterSpacing: 1,
            }}>
              {focusedScorer.goals} gols · {focusedScorer.team}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Scorer Card Poster ───────────────────────────────────────────────────────

function ScorerCardPoster({ scorer, vw, isCentral }: { scorer: TopScorer; vw: number; isCentral: boolean }) {
  const rankColor = scorer.position === 1 ? '#ffd700' : scorer.position === 2 ? '#c0c0c0' : scorer.position === 3 ? '#cd7f32' : 'rgba(255,255,255,0.28)'
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0d0d14' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: Math.round(3 * vw),
        background: SCORER_ACCENT, opacity: 0.85,
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse at center, ${SCORER_ACCENT}0D 0%, #0d0d14 70%)`,
      }} />

      {/* Rank */}
      <div style={{
        position: 'absolute', top: isCentral ? '10%' : '8%',
        left: 0, right: 0, textAlign: 'center',
        fontSize: isCentral ? Math.round(68 * vw) : Math.round(42 * vw),
        fontWeight: 900, color: rankColor,
        fontFamily: '"Barlow Condensed","Outfit",sans-serif',
        lineHeight: 1, textShadow: `0 0 24px ${rankColor}66`,
      }}>
        #{scorer.position}
      </div>

      {/* Flag */}
      <div style={{
        position: 'absolute', top: isCentral ? '36%' : '38%',
        left: 0, right: 0, textAlign: 'center',
        fontSize: isCentral ? Math.round(54 * vw) : Math.round(34 * vw),
      }}>
        {scorer.flag}
      </div>

      {/* Bottom gradient */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.92))', zIndex: 3,
      }} />

      {/* Bottom text */}
      <div style={{
        position: 'absolute', bottom: Math.round(12 * vw), left: Math.round(10 * vw), right: Math.round(10 * vw),
        zIndex: 4, textAlign: 'center',
      }}>
        <div style={{
          fontSize: isCentral ? Math.round(20 * vw) : Math.round(13 * vw),
          fontWeight: 700, color: '#fff',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {scorer.player}
        </div>
        <div style={{
          fontSize: isCentral ? Math.round(30 * vw) : Math.round(18 * vw),
          fontWeight: 900, color: SCORER_ACCENT, marginTop: Math.round(2 * vw),
        }}>
          {scorer.goals} ⚽
        </div>
        {scorer.assists > 0 && (
          <div style={{
            fontSize: isCentral ? Math.round(13 * vw) : Math.round(10 * vw),
            color: 'rgba(255,255,255,0.4)', marginTop: Math.round(2 * vw),
          }}>
            +{scorer.assists} assist.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── YouTube Player Overlay ───────────────────────────────────────────────────

function YoutubePlayer({ channel, vw, onClose }: { channel: CopaChannel; vw: number; onClose: () => void }) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.keyCode === 10009 || e.keyCode === 8 || e.key === 'Backspace') {
        e.preventDefault(); e.stopPropagation(); onClose()
      }
    }
    window.addEventListener('keydown', handle, { capture: true })
    return () => window.removeEventListener('keydown', handle, { capture: true })
  }, [onClose])

  const s = (n: number) => Math.round(n * vw)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: s(14),
        padding: `${s(12)}px ${s(24)}px`,
        background: 'rgba(0,0,0,0.9)', flexShrink: 0,
      }}>
        <span style={{ fontSize: s(22) }}>{channel.logo}</span>
        <div>
          <div style={{ fontSize: s(16), fontWeight: 800 }}>{channel.name}</div>
          <div style={{ fontSize: s(11), color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{channel.description}</div>
        </div>
        <div onClick={onClose} style={{
          marginLeft: 'auto', background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: s(8),
          padding: `${s(8)}px ${s(20)}px`, fontSize: s(13), fontWeight: 700,
          cursor: 'pointer', color: 'rgba(255,255,255,0.5)',
        }}>
          ← BACK para voltar
        </div>
      </div>
      <iframe
        src={channelEmbedUrl(channel.youtubeChannelId)}
        style={{ flex: 1, border: 'none', width: '100%' }}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  )
}

