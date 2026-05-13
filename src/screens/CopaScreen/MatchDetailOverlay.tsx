import React, { useEffect, useRef, useState } from 'react'
import type { CopaMatch } from '../../services/copaService'
import { COPA_WATCH_CHANNELS, channelEmbedUrl, type CopaChannel } from '../../services/copaChannels'

interface Props {
  match: CopaMatch
  onClose: () => void
  onWatchChannel: (channel: CopaChannel) => void
}

function formatMatchDate(utcDate: string): string {
  if (!utcDate) return ''
  const d = new Date(utcDate)
  const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const local = new Date(d.getTime() - 3 * 60 * 60 * 1000) // UTC-3
  const hh = String(local.getUTCHours()).padStart(2, '0')
  const mm = String(local.getUTCMinutes()).padStart(2, '0')
  return `${days[local.getUTCDay()]}, ${local.getUTCDate()} de ${months[local.getUTCMonth()]} de ${local.getUTCFullYear()} · ${hh}h${mm} (Brasília)`
}

function formatStage(stage: string, group?: string): string {
  const g = group ? ` · ${group.replace('GROUP_', 'Grupo ')}` : ''
  const s: Record<string, string> = {
    GROUP_STAGE: 'Fase de Grupos',
    ROUND_OF_16: 'Oitavas de Final',
    QUARTER_FINALS: 'Quartas de Final',
    SEMI_FINALS: 'Semifinais',
    FINAL: 'Final',
  }
  return (s[stage] ?? stage) + g
}

export default function MatchDetailOverlay({ match, onClose, onWatchChannel }: Props) {
  const [focusIdx, setFocusIdx] = useState(0)
  const focusRef = useRef(focusIdx)
  focusRef.current = focusIdx

  const channels = COPA_WATCH_CHANNELS
  const isLive = match.status === 'IN_PLAY' || match.status === 'PAUSED' || match.status === 'LIVE'
  const isFinished = match.status === 'FINISHED'

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const isBack  = e.keyCode === 10009 || e.keyCode === 8 || e.key === 'Backspace'
      const isLeft  = e.keyCode === 37 || e.key === 'ArrowLeft'
      const isRight = e.keyCode === 39 || e.key === 'ArrowRight'
      const isEnter = e.keyCode === 13 || e.keyCode === 10232 || e.key === 'Enter'

      if (!isBack && !isLeft && !isRight && !isEnter) return
      e.preventDefault(); e.stopPropagation()

      if (isBack) { onClose(); return }
      if (isLeft)  setFocusIdx(i => Math.max(0, i - 1))
      if (isRight) setFocusIdx(i => Math.min(channels.length - 1, i + 1))
      if (isEnter) onWatchChannel(channels[focusRef.current])
    }
    window.addEventListener('keydown', handle, { capture: true })
    return () => window.removeEventListener('keydown', handle, { capture: true })
  }, [onClose, onWatchChannel, channels])

  const accent = '#ff006e'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 8000,
      background: 'rgba(0,0,0,0.92)',
      backdropFilter: 'blur(16px)',
      display: 'flex', flexDirection: 'column',
      fontFamily: '"Outfit", sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '32px 80px 0',
        gap: 16,
      }}>
        <div style={{
          fontSize: 13, fontWeight: 700,
          letterSpacing: 3, textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.3)',
          marginRight: 'auto',
        }}>
          Copa 2026 🏆
        </div>
        <div style={{
          fontSize: 12, color: 'rgba(255,255,255,0.25)',
          letterSpacing: 2, textTransform: 'uppercase',
        }}>
          BACK para fechar
        </div>
      </div>

      {/* Match centerpiece */}
      <div style={{
        flex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 80px',
        gap: 12,
      }}>
        {/* Status badge */}
        {isLive && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(229,9,20,0.2)',
            border: '1px solid rgba(229,9,20,0.5)',
            borderRadius: 8,
            padding: '6px 20px',
            fontSize: 13, fontWeight: 900,
            letterSpacing: 2, color: '#ff4444',
            marginBottom: 8,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: '#e50914',
              animation: 'copa-pulse 1.4s ease-in-out infinite',
            }} />
            AO VIVO{match.minute != null ? ` — ${match.minute}º` : ''}
          </div>
        )}
        {isFinished && (
          <div style={{
            fontSize: 13, fontWeight: 700, letterSpacing: 2,
            color: 'rgba(255,255,255,0.4)', marginBottom: 8,
          }}>
            ✅ ENCERRADO
          </div>
        )}

        {/* Teams + score */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 48,
        }}>
          <TeamDisplay
            name={match.homeTeam.name}
            shortName={match.homeTeam.shortName}
            crest={match.homeTeam.crest}
            align="right"
          />

          <div style={{ textAlign: 'center', minWidth: 120 }}>
            {(isLive || isFinished) && match.score.home != null ? (
              <div style={{
                fontSize: 72, fontWeight: 900, lineHeight: 1,
                color: '#fff',
                textShadow: `0 0 40px ${accent}66`,
              }}>
                {match.score.home} <span style={{ color: 'rgba(255,255,255,0.2)' }}>×</span> {match.score.away}
              </div>
            ) : (
              <div style={{ fontSize: 40, color: 'rgba(255,255,255,0.2)', fontWeight: 300 }}>vs</div>
            )}
          </div>

          <TeamDisplay
            name={match.awayTeam.name}
            shortName={match.awayTeam.shortName}
            crest={match.awayTeam.crest}
            align="left"
          />
        </div>

        {/* Stage + venue */}
        <div style={{
          textAlign: 'center', marginTop: 8,
          fontSize: 14, color: 'rgba(255,255,255,0.4)', letterSpacing: 1,
        }}>
          {formatStage(match.stage, match.group)}
          {match.venue ? ` · ${match.venue}` : ''}
        </div>
        <div style={{
          fontSize: 13, color: 'rgba(255,255,255,0.3)',
        }}>
          {formatMatchDate(match.utcDate)}
        </div>

        {/* Divider */}
        <div style={{
          width: 600, height: 1,
          background: 'rgba(255,255,255,0.08)',
          marginTop: 24, marginBottom: 16,
        }} />

        {/* Channel selection */}
        <div style={{
          fontSize: 12, fontWeight: 700, letterSpacing: 3,
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.3)',
          marginBottom: 16,
        }}>
          Onde assistir
        </div>

        <div style={{ display: 'flex', gap: 20 }}>
          {channels.map((ch, i) => {
            const isFoc = focusIdx === i
            return (
              <div
                key={ch.id}
                onClick={() => onWatchChannel(ch)}
                style={{
                  width: 180,
                  borderRadius: 12,
                  padding: '20px 16px',
                  background: isFoc ? 'rgba(255,0,110,0.15)' : 'rgba(255,255,255,0.04)',
                  border: isFoc ? `2px solid ${accent}` : '2px solid rgba(255,255,255,0.08)',
                  boxShadow: isFoc ? `0 0 28px rgba(255,0,110,0.3)` : 'none',
                  transform: isFoc ? 'scale(1.04) translateY(-4px)' : 'scale(1)',
                  transition: 'all 200ms cubic-bezier(0.34,1.56,0.64,1)',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 10 }}>{ch.logo}</div>
                <div style={{
                  fontSize: 15, fontWeight: 700,
                  color: isFoc ? '#fff' : 'rgba(255,255,255,0.6)',
                }}>
                  {ch.name}
                </div>
                <div style={{
                  fontSize: 11, color: 'rgba(255,255,255,0.3)',
                  marginTop: 4,
                }}>
                  {ch.handle}
                </div>
                {isFoc && (
                  <div style={{
                    marginTop: 12,
                    background: accent,
                    borderRadius: 6,
                    padding: '6px 0',
                    fontSize: 12, fontWeight: 800,
                    color: '#fff', letterSpacing: 1,
                  }}>
                    ▶ Assistir
                  </div>
                )}
                {ch.priority === 1 && (
                  <div style={{
                    marginTop: isFoc ? 6 : 12,
                    fontSize: 10, fontWeight: 700,
                    color: '#f59e0b', letterSpacing: 1.5,
                    textTransform: 'uppercase',
                  }}>
                    ★ Recomendado
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes copa-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}

function TeamDisplay({ name, shortName, crest, align }: {
  name: string; shortName: string; crest: string; align: 'left' | 'right'
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: align === 'right' ? 'flex-end' : 'flex-start',
      gap: 10, minWidth: 200,
    }}>
      {crest ? (
        <img src={crest} alt="" style={{ width: 80, height: 80, objectFit: 'contain' }} />
      ) : (
        <div style={{
          width: 80, height: 80, borderRadius: 12,
          background: 'rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32,
        }}>⚽</div>
      )}
      <div style={{
        fontSize: 28, fontWeight: 900, color: '#fff',
        textAlign: align,
        lineHeight: 1.1,
      }}>
        {shortName || name}
      </div>
    </div>
  )
}
