import React, { useEffect, useRef, useState, useMemo } from 'react'
import type { Channel } from '../../types/channel'
import { getEpisodeProgress, getLastEpisode, markEpisodeWatched } from '../../services/historyService'

interface Props {
  channel:  Channel
  similar?: Channel[]
  onPlay:   (url: string, label: string) => void
  onBack:   () => void
}

interface Episode {
  season:  number
  episode: number
  code:    string
  display: string
  url:     string
}

function parseEpisodes(ch: Channel): Episode[] {
  const eps: Episode[] = []
  const seen = new Set<string>()
  for (const s of ch.streams) {
    const src = s.label || s.quality || ''
    const m = src.match(/[Ss](\d+)[Ee](\d+)/)
    if (!m) continue
    const sn = parseInt(m[1]), ep = parseInt(m[2])
    const code = `S${String(sn).padStart(2,'0')}E${String(ep).padStart(2,'0')}`
    if (seen.has(code)) continue
    seen.add(code)
    eps.push({ season: sn, episode: ep, code, display: code, url: s.url })
  }
  return eps.sort((a, b) => a.season !== b.season ? a.season - b.season : a.episode - b.episode)
}

// ─── Layout (mesmo padrão do HomeScreen) ─────────────────────────────────────
const VW       = 1.0
const SCREEN_W = 1920
const CARD_W   = Math.round(317 * 1.10 * VW * 0.85)
const CARD_H   = Math.round(475 * 1.10 * VW * 0.85)
const CEN_H    = Math.round(CARD_H * 1.035)
const CEN_W    = Math.round(CEN_H * 1.77)
const GAP      = Math.round(16 * VW)
const SIDE_GAP = Math.round(24 * VW)
const T_AREA   = Math.round(50 * VW)
const DESC_H   = Math.round(70 * VW)
const ROW_H_FOCUSED   = T_AREA + CEN_H + DESC_H
const ROW_H_UNFOCUSED = CARD_H + Math.round(10 * VW)
const centralLeft = Math.floor((SCREEN_W - CEN_W) / 2)
const uniformCenterLeft = Math.floor((SCREEN_W - CARD_W) / 2)
const LATERAL_TOP_FOCUSED   = T_AREA + Math.round((CEN_H - CARD_H) / 2)
const LATERAL_TOP_UNFOCUSED = Math.round((CEN_H - CARD_H) / 2)

const ACCENT   = '#E50914'   // Netflix red
const HERO_H   = 160

export default function SeriesDetailScreen({ channel, similar: _similar = [], onPlay, onBack }: Props) {
  const canonical = (channel as any).canonical
  const backdrop  = canonical?.backdrop || canonical?.poster || ''
  const poster    = canonical?.poster   || canonical?.backdrop || ''
  const title     = canonical?.title    || channel.name
  const overview  = canonical?.overview || ''
  const rating    = canonical?.rating   ? Number(canonical.rating).toFixed(1) : null
  const year      = canonical?.year     || null

  const allEpisodes = useMemo(() => parseEpisodes(channel), [channel])
  const seasons     = useMemo(
    () => [...new Set(allEpisodes.map(e => e.season))].sort((a, b) => a - b),
    [allEpisodes]
  )
  const episodesBySeason = useMemo(() => {
    const m = new Map<number, Episode[]>()
    for (const s of seasons) m.set(s, allEpisodes.filter(e => e.season === s))
    return m
  }, [seasons, allEpisodes])

  // Progresso por episódio: code → pct (0 = não assistido, 99 = completo)
  const [epProgress, setEpProgress] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    const map = new Map<string, number>()
    for (const ep of allEpisodes) {
      const pct = getEpisodeProgress(channel.name, ep.code)
      if (pct > 0) map.set(ep.code, pct)
    }
    setEpProgress(map)
  }, [channel.name, allEpisodes])

  const [focusedRow, setFocusedRow] = useState(0)
  const [focusedCols, setFocusedCols] = useState<number[]>(() => seasons.map(() => 0))

  // Auto-seleciona próximo episódio a assistir com base no histórico
  useEffect(() => {
    const last = getLastEpisode(channel.name)
    if (!last) return
    const lastEp = allEpisodes.find(e => e.code === last)
    if (!lastEp) return

    const lastPct = getEpisodeProgress(channel.name, last)
    // Se o último episódio foi concluído (>90%), aponta pro próximo
    let targetEp: Episode | null = lastEp
    if (lastPct >= 90) {
      const seasonEps = episodesBySeason.get(lastEp.season) || []
      const idx = seasonEps.indexOf(lastEp)
      if (idx < seasonEps.length - 1) {
        targetEp = seasonEps[idx + 1]
      } else {
        const nextSeasonEps = episodesBySeason.get(lastEp.season + 1)
        targetEp = nextSeasonEps?.[0] || lastEp
      }
    }

    const rowIdx = seasons.indexOf(targetEp.season)
    if (rowIdx === -1) return
    const seasonEps = episodesBySeason.get(targetEp.season) || []
    const colIdx = seasonEps.indexOf(targetEp)

    setFocusedRow(rowIdx)
    setFocusedCols(prev => {
      const next = [...prev]
      next[rowIdx] = Math.max(0, colIdx)
      return next
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const focusedRowRef  = useRef(focusedRow)
  const focusedColsRef = useRef(focusedCols)
  focusedRowRef.current  = focusedRow
  focusedColsRef.current = focusedCols

  const rowsWrapRef = useRef<HTMLDivElement | null>(null)
  const rowRefs     = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (!rowsWrapRef.current) return
    const row = rowRefs.current[focusedRow]
    if (!row) return
    const rowTop = row.offsetTop
    const targetScroll = rowTop - 80
    rowsWrapRef.current.style.transform = `translate3d(0, -${Math.max(0, targetScroll)}px, 0)`
  }, [focusedRow])

  const lastTRef = useRef(0)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const now = Date.now()
      if (now - lastTRef.current < 180) return
      lastTRef.current = now

      const row  = focusedRowRef.current
      const cols = focusedColsRef.current
      const season = seasons[row]
      const eps  = episodesBySeason.get(season) || []
      const col  = cols[row] ?? 0

      const isBack  = e.keyCode === 10009 || e.keyCode === 8 || e.key === 'Backspace'
      const isEnter = e.keyCode === 13 || e.key === 'Enter'
      const isUp    = e.keyCode === 38 || e.key === 'ArrowUp'
      const isDown  = e.keyCode === 40 || e.key === 'ArrowDown'
      const isLeft  = e.keyCode === 37 || e.key === 'ArrowLeft'
      const isRight = e.keyCode === 39 || e.key === 'ArrowRight'

      if (isBack)  { e.preventDefault(); onBack(); return }
      if (isEnter) {
        e.preventDefault()
        const ep = eps[col]
        if (ep) {
          // Marca como assistido ao iniciar (registra que chegou aqui)
          markEpisodeWatched(channel.name, ep.code)
          setEpProgress(prev => { const m = new Map(prev); m.set(ep.code, 99); return m })
          onPlay(ep.url, ep.display)
        }
        return
      }
      if (isUp)    { e.preventDefault(); setFocusedRow(r => Math.max(0, r - 1)); return }
      if (isDown)  { e.preventDefault(); setFocusedRow(r => Math.min(seasons.length - 1, r + 1)); return }
      if (isLeft || isRight) {
        e.preventDefault()
        const maxCol = eps.length - 1
        const next = [...cols]
        next[row] = isLeft
          ? (col <= 0 ? maxCol : col - 1)
          : (col >= maxCol ? 0 : col + 1)
        setFocusedCols(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [seasons, episodesBySeason, onBack, onPlay, channel.name])

  const lastEpisodeCode = getLastEpisode(channel.name)

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: SCREEN_W, height: 1080,
      background: '#141414',
      overflow: 'hidden',
      fontFamily: '"Outfit", sans-serif',
    }}>

      {/* Blurred backdrop */}
      {backdrop && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${backdrop})`,
          backgroundSize: 'cover', backgroundPosition: 'center top',
          filter: 'blur(60px)', transform: 'scale(1.15)',
          opacity: 0.18, zIndex: 0,
        }} />
      )}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        background: 'linear-gradient(to bottom, rgba(20,20,20,0.55) 0%, rgba(20,20,20,0.92) 35%, #141414 100%)',
      }} />

      {/* ── HERO ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: HERO_H, zIndex: 20, overflow: 'hidden',
      }}>
        {backdrop && (
          <img src={backdrop} style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center 25%', opacity: 0.35,
          }} />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background:
            'linear-gradient(to right, rgba(20,20,20,0.97) 32%, rgba(20,20,20,0.2) 68%),' +
            'linear-gradient(to bottom, rgba(20,20,20,0.1) 0%, rgba(20,20,20,1) 100%)',
        }} />
        <div style={{
          position: 'relative', zIndex: 5, height: '100%',
          display: 'flex', alignItems: 'center', padding: '0 60px', gap: 20,
        }}>
          {poster && (
            <img src={poster} style={{
              height: 110, width: 'auto', flexShrink: 0,
              borderRadius: 4, boxShadow: '0 8px 28px rgba(0,0,0,0.9)',
            }} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{
              fontFamily: '"Barlow Condensed", "Outfit", sans-serif',
              fontSize: 48, fontWeight: 900, color: '#fff',
              lineHeight: 1, letterSpacing: -0.5,
              textShadow: '0 4px 24px rgba(0,0,0,0.8)',
            }}>{title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {year && <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{year}</span>}
              {rating && (
                <span style={{ fontSize: 14, color: '#46d369', fontWeight: 700 }}>
                  ★ {rating}
                </span>
              )}
              <span style={{
                fontSize: 11, color: 'rgba(255,255,255,0.45)',
                border: '1px solid rgba(255,255,255,0.2)',
                padding: '1px 6px', borderRadius: 2, letterSpacing: 1,
              }}>SÉRIE</span>
            </div>
            {overview && (
              <div style={{
                fontSize: 13, color: 'rgba(255,255,255,0.38)', lineHeight: 1.5,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', maxWidth: 720,
              }}>{overview}</div>
            )}
          </div>
        </div>
      </div>

      {/* Gradients de fade top/bottom */}
      <div style={{
        position: 'fixed', top: HERO_H, left: 0, right: 0, height: '10%',
        pointerEvents: 'none', zIndex: 200,
        background: 'linear-gradient(to bottom, #141414 0%, transparent 100%)',
      }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: '12%',
        pointerEvents: 'none', zIndex: 200,
        background: 'linear-gradient(to top, #141414 0%, transparent 100%)',
      }} />

      {/* ── ROWS ── */}
      <div style={{
        position: 'absolute', top: HERO_H, left: 0, right: 0, bottom: 0,
        overflow: 'hidden', zIndex: 15,
      }}>
        <div
          ref={rowsWrapRef}
          style={{
            paddingTop: '14vh',
            transition: 'transform 350ms ease-out',
            willChange: 'transform',
          }}
        >
          {seasons.map((season, rowIdx) => {
            const isRowFocused = focusedRow === rowIdx
            const eps = episodesBySeason.get(season) || []
            const focusedEp = focusedCols[rowIdx] ?? 0
            const fEp = eps[focusedEp]

            // Contagem de assistidos nessa temporada
            const watchedCount = eps.filter(e => (epProgress.get(e.code) ?? 0) >= 90).length

            // Sabe se tem "Continuar" nessa temporada
            const hasContinue = lastEpisodeCode && eps.some(e => e.code === lastEpisodeCode)

            return (
              <div
                key={season}
                ref={el => { rowRefs.current[rowIdx] = el }}
                style={{ paddingTop: rowIdx === 0 ? 0 : 20, overflow: 'visible' }}
              >
                {/* Row title */}
                <div style={{
                  padding: '0 80px', marginBottom: 10,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{
                    fontSize: 20, fontWeight: 800,
                    color: isRowFocused ? '#fff' : 'rgba(255,255,255,0.4)',
                    transition: 'color 200ms',
                  }}>
                    Temporada {season}
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.28)' }}>
                    {watchedCount > 0
                      ? `${watchedCount} de ${eps.length} assistidos`
                      : `${eps.length} episódios`}
                  </div>
                  {hasContinue && (
                    <div style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: 1,
                      color: ACCENT, textTransform: 'uppercase',
                    }}>● Em andamento</div>
                  )}
                </div>

                {/* Cards row */}
                <div style={{
                  position: 'relative', width: '100%',
                  height: isRowFocused ? ROW_H_FOCUSED : ROW_H_UNFOCUSED,
                  overflow: 'visible', transition: 'none',
                }}>
                  {/* Side + center cards */}
                  {(() => {
                    const total = eps.length
                    if (total === 0) return null
                    const slots: { ep: Episode; idx: number; offset: number }[] = []
                    for (let offset = -4; offset <= 5; offset++) {
                      const idx = ((focusedEp + offset) % total + total) % total
                      if (offset !== 0 && slots.some(s => s.idx === idx)) continue
                      slots.push({ ep: eps[idx], idx, offset })
                    }

                    return slots.map(({ ep, offset }) => {
                      const isCenter = offset === 0
                      const pct = epProgress.get(ep.code) ?? 0
                      const isWatched = pct >= 90
                      const isInProgress = pct > 5 && pct < 90
                      const topOffset = isRowFocused ? LATERAL_TOP_FOCUSED : LATERAL_TOP_UNFOCUSED
                      const isFarEdge = offset <= -3 || offset >= 4

                      let translateX: number
                      if (isRowFocused) {
                        if (offset < 0) translateX = centralLeft - SIDE_GAP - (-offset) * (CARD_W + GAP) + GAP
                        else if (offset > 0) translateX = centralLeft + CEN_W + SIDE_GAP + (offset - 1) * (CARD_W + GAP)
                        else translateX = centralLeft + Math.floor((CEN_W - CARD_W) / 2)
                      } else {
                        translateX = uniformCenterLeft + offset * (CARD_W + GAP)
                      }

                      return (
                        <div
                          key={`${season}-${ep.code}`}
                          onClick={() => {
                            if (isCenter && isRowFocused) {
                              markEpisodeWatched(channel.name, ep.code)
                              setEpProgress(prev => { const m = new Map(prev); m.set(ep.code, 99); return m })
                              onPlay(ep.url, ep.display)
                            }
                          }}
                          style={{
                            position: 'absolute',
                            top: topOffset,
                            width: CARD_W, height: CARD_H,
                            transform: `translate3d(${translateX}px, 0, 0)`,
                            transition: isRowFocused && !isFarEdge
                              ? 'transform 380ms cubic-bezier(0.25,0.46,0.45,0.94)'
                              : 'none',
                            borderRadius: 4,
                            overflow: 'hidden',
                            border: isCenter && isRowFocused
                              ? `2px solid ${ACCENT}`
                              : '1px solid rgba(255,255,255,0.08)',
                            background: '#1a1a1a',
                            opacity: isRowFocused ? (isWatched && !isCenter ? 0.55 : 1) : 0.55,
                            zIndex: isCenter ? 0 : 1,
                            cursor: 'pointer',
                          }}
                        >
                          {/* Thumbnail */}
                          <img
                            src={backdrop || poster || undefined}
                            style={{
                              position: 'absolute', inset: 0,
                              width: '100%', height: '100%',
                              objectFit: 'cover',
                              display: isFarEdge ? 'none' : 'block',
                              filter: isWatched ? 'brightness(0.55)' : 'none',
                            }}
                          />
                          {/* Gradient */}
                          <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
                            zIndex: 3,
                          }} />

                          {/* Badge "✓ Assistido" */}
                          {isWatched && !isFarEdge && (
                            <div style={{
                              position: 'absolute', top: 10, right: 10,
                              background: 'rgba(0,0,0,0.72)',
                              border: '1.5px solid rgba(255,255,255,0.35)',
                              borderRadius: 4,
                              padding: '3px 8px',
                              fontSize: 11, fontWeight: 700,
                              color: 'rgba(255,255,255,0.75)',
                              zIndex: 6, letterSpacing: 0.5,
                            }}>✓</div>
                          )}

                          {/* Código do episódio */}
                          <div style={{
                            position: 'absolute', bottom: isInProgress ? 14 : 10, left: 10,
                            fontSize: 16, fontWeight: 700,
                            color: isWatched ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.85)',
                            zIndex: 4,
                            fontFamily: '"Barlow Condensed", sans-serif',
                            letterSpacing: 1,
                          }}>
                            {ep.display}
                          </div>

                          {/* Barra de progresso (Netflix style) */}
                          {isInProgress && !isFarEdge && (
                            <div style={{
                              position: 'absolute', bottom: 0, left: 0, right: 0,
                              height: 4, background: 'rgba(255,255,255,0.2)', zIndex: 5,
                            }}>
                              <div style={{
                                height: '100%', width: `${pct}%`,
                                background: ACCENT,
                                borderRadius: '0 2px 2px 0',
                              }} />
                            </div>
                          )}
                        </div>
                      )
                    })
                  })()}

                  {/* ── Card central focado ── */}
                  {fEp && isRowFocused && (
                    <div
                      onClick={() => {
                        markEpisodeWatched(channel.name, fEp.code)
                        setEpProgress(prev => { const m = new Map(prev); m.set(fEp.code, 99); return m })
                        onPlay(fEp.url, fEp.display)
                      }}
                      style={{
                        position: 'absolute',
                        left: centralLeft, top: T_AREA,
                        width: CEN_W, height: CEN_H,
                        zIndex: 10, borderRadius: 4, overflow: 'hidden',
                        outline: `3px solid ${ACCENT}`, outlineOffset: 0,
                        boxShadow: `0 16px 64px rgba(229,9,20,0.25), 0 8px 32px rgba(0,0,0,0.8)`,
                        cursor: 'pointer',
                      }}
                    >
                      <img src={backdrop || poster || undefined} style={{
                        width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                      }} />
                      <div style={{
                        position: 'absolute', inset: 0,
                        background:
                          'linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.55) 38%, rgba(0,0,0,0) 75%),' +
                          'linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0) 100%)',
                      }} />

                      {/* Badge episódio top-right */}
                      <div style={{
                        position: 'absolute', top: 24, right: 24,
                        background: 'rgba(0,0,0,0.65)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        color: '#fff', fontSize: 18, fontWeight: 700,
                        padding: '4px 14px', borderRadius: 4, letterSpacing: 1,
                      }}>
                        {fEp.display}
                      </div>

                      {/* Barra de progresso no card central */}
                      {(() => {
                        const pct = epProgress.get(fEp.code) ?? 0
                        if (pct <= 5 || pct >= 90) return null
                        return (
                          <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            height: 5, background: 'rgba(255,255,255,0.15)', zIndex: 8,
                          }}>
                            <div style={{
                              height: '100%', width: `${pct}%`,
                              background: ACCENT, borderRadius: '0 3px 3px 0',
                            }} />
                          </div>
                        )
                      })()}

                      {/* Botões */}
                      <div style={{
                        position: 'absolute', bottom: 28, left: 32,
                        display: 'flex', flexDirection: 'column', gap: 12,
                      }}>
                        <div style={{
                          display: 'inline-flex', alignSelf: 'flex-start',
                          background: 'rgba(255,255,255,0.12)',
                          border: '1px solid rgba(255,255,255,0.25)',
                          color: 'rgba(255,255,255,0.85)',
                          fontSize: 14, fontWeight: 600,
                          padding: '3px 14px', borderRadius: 40,
                          letterSpacing: 1.5, textTransform: 'uppercase',
                        }}>SÉRIE</div>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          {/* Botão principal: Continuar ou Assistir */}
                          {(() => {
                            const pct = epProgress.get(fEp.code) ?? 0
                            const isInProg = pct > 5 && pct < 90
                            return (
                              <div style={{
                                background: '#fff', color: '#111',
                                fontSize: 19, fontWeight: 700,
                                padding: '11px 28px', borderRadius: 4,
                                display: 'flex', alignItems: 'center', gap: 10,
                                whiteSpace: 'nowrap',
                              }}>
                                <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
                                  <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                {isInProg ? `Continuar ${fEp.display}` : 'Assistir'}
                              </div>
                            )
                          })()}
                          {/* Botão secundário: "Já assisti" se não estiver assistido */}
                          {(epProgress.get(fEp.code) ?? 0) < 90 && (
                            <div
                              onClick={e => {
                                e.stopPropagation()
                                markEpisodeWatched(channel.name, fEp.code)
                                setEpProgress(prev => { const m = new Map(prev); m.set(fEp.code, 99); return m })
                              }}
                              style={{
                                background: 'rgba(255,255,255,0.12)',
                                border: '2px solid rgba(255,255,255,0.5)',
                                color: '#fff',
                                fontSize: 15, fontWeight: 600,
                                padding: '10px 20px', borderRadius: 4,
                                display: 'flex', alignItems: 'center', gap: 8,
                                cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Já assisti
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Título acima do card central */}
                  {fEp && isRowFocused && (
                    <div style={{
                      position: 'absolute',
                      left: centralLeft,
                      top: T_AREA - Math.round(56 * VW) - Math.round(20 * VW),
                      width: CEN_W,
                      zIndex: 15, pointerEvents: 'none',
                      textAlign: 'center',
                    }}>
                      <div style={{
                        fontSize: 16, fontWeight: 600,
                        color: 'rgba(255,255,255,0.45)',
                        letterSpacing: 3, textTransform: 'uppercase',
                        marginBottom: 6,
                      }}>EPISÓDIO</div>
                      <div style={{
                        fontSize: 52, fontWeight: 800, lineHeight: 0.95,
                        color: '#fff',
                        fontFamily: '"Barlow Condensed", "Outfit", sans-serif',
                        textShadow: '0 2px 14px rgba(0,0,0,0.6)',
                      }}>
                        {fEp.display}
                      </div>
                    </div>
                  )}

                  {/* Info abaixo do card central */}
                  {fEp && isRowFocused && (
                    <div style={{
                      position: 'absolute',
                      left: centralLeft,
                      top: T_AREA + CEN_H + 14,
                      width: CEN_W,
                      zIndex: 15, pointerEvents: 'none',
                    }}>
                      {(() => {
                        const pct = epProgress.get(fEp.code) ?? 0
                        return (
                          <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: 16,
                          }}>
                            {pct > 5 && pct < 90 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 80, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }}>
                                  <div style={{ height: '100%', width: `${pct}%`, background: ACCENT, borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{Math.round(pct)}%</span>
                              </div>
                            )}
                            {overview && (
                              <div style={{
                                fontSize: 20, color: 'rgba(255,255,255,0.38)',
                                lineHeight: 1.6, textAlign: 'center',
                                display: '-webkit-box', WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                fontWeight: 300, flex: 1,
                              }}>
                                {overview}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          <div style={{ height: 400 }} />
        </div>
      </div>

      <style>{`*::-webkit-scrollbar { display: none; }`}</style>
    </div>
  )
}
