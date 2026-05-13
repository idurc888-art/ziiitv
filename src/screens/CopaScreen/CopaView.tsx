import React, { useEffect, useRef, useState } from 'react'
import {
  COPA_CHANNELS,
  CATEGORY_LABELS,
  channelEmbedUrl,
  embedUrl,
  checkAllLive,
  type YTChannel,
  type LiveStatus,
} from '../../services/youtubeService'

interface Props {
  vw: number
  onBack?: () => void
}

// ─── Agrupa canais por categoria ─────────────────────────────────────────────
interface CategoryGroup { label: string; channels: YTChannel[] }
function groupByCategory(channels: YTChannel[]): CategoryGroup[] {
  const map = new Map<string, YTChannel[]>()
  for (const ch of channels) {
    const label = CATEGORY_LABELS[ch.category]
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(ch)
  }
  return Array.from(map.entries()).map(([label, channels]) => ({ label, channels }))
}

// Nav position: { row: -1 = hero, 0+ = category row, col = card index }
interface NavPos { row: number; col: number }

export default function CopaView({ vw, onBack }: Props) {
  const s = (n: number) => Math.round(n * vw)

  const groups = groupByCategory(COPA_CHANNELS)
  const [nav, setNav] = useState<NavPos>({ row: -1, col: 0 })
  const [liveMap, setLiveMap] = useState<Map<string, LiveStatus>>(new Map())
  const [playerChannel, setPlayerChannel] = useState<YTChannel | null>(null)
  const heroChannel = COPA_CHANNELS[0] // Cazé TV como destaque

  // Flat map: row index → channels array
  const rowChannels = groups.map(g => g.channels)

  useEffect(() => {
    checkAllLive().then(setLiveMap)
  }, [])

  // ─── D-pad navigation ────────────────────────────────────────────────────
  useEffect(() => {
    if (playerChannel) return

    const handle = (e: KeyboardEvent) => {
      const isBack  = e.keyCode === 10009 || e.keyCode === 8 || e.key === 'Backspace'
      const isLeft  = e.keyCode === 37 || e.key === 'ArrowLeft'
      const isRight = e.keyCode === 39 || e.key === 'ArrowRight'
      const isUp    = e.keyCode === 38 || e.key === 'ArrowUp'
      const isDown  = e.keyCode === 40 || e.key === 'ArrowDown'
      const isEnter = e.keyCode === 13 || e.keyCode === 10232 || e.key === 'Enter'

      if (!isBack && !isLeft && !isRight && !isUp && !isDown && !isEnter) return
      e.preventDefault(); e.stopPropagation()

      if (isBack) { onBack?.(); return }

      if (isEnter) {
        if (nav.row === -1) setPlayerChannel(heroChannel)
        else setPlayerChannel(rowChannels[nav.row][nav.col])
        return
      }

      setNav(prev => {
        let { row, col } = prev

        if (isUp) {
          if (row === 0) row = -1
          else if (row > 0) { row--; col = Math.min(col, rowChannels[row].length - 1) }
        }
        if (isDown) {
          if (row === -1) { row = 0; col = 0 }
          else if (row < rowChannels.length - 1) { row++; col = Math.min(col, rowChannels[row].length - 1) }
        }
        if (isLeft) {
          if (row === -1) col = 0
          else col = Math.max(0, col - 1)
        }
        if (isRight) {
          if (row === -1) col = 0
          else col = Math.min(rowChannels[row].length - 1, col + 1)
        }

        return { row, col }
      })
    }

    window.addEventListener('keydown', handle, { capture: true })
    return () => window.removeEventListener('keydown', handle, { capture: true })
  }, [playerChannel, nav, rowChannels, heroChannel, onBack])

  // Back fecha o player
  useEffect(() => {
    if (!playerChannel) return
    const handle = (e: KeyboardEvent) => {
      if (e.keyCode === 10009 || e.keyCode === 8 || e.key === 'Backspace') {
        e.preventDefault(); e.stopPropagation()
        setPlayerChannel(null)
      }
    }
    window.addEventListener('keydown', handle, { capture: true })
    return () => window.removeEventListener('keydown', handle, { capture: true })
  }, [playerChannel])

  function getEmbed(ch: YTChannel): string {
    const status = liveMap.get(ch.id)
    return status?.videoId ? embedUrl(status.videoId) : channelEmbedUrl(ch.channelId)
  }

  // Card dimensions — 80% dos cards normais do app
  const CARD_W = s(317 * 1.10 * 0.80)
  const CARD_H = s(475 * 1.10 * 0.80)
  const GAP    = s(14)

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: '#0a0a0f',
      color: '#fff',
      fontFamily: '"Outfit", sans-serif',
      overflow: 'hidden',
    }}>

      {/* ── Scrollable content ──────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0,
        overflowY: 'auto', overflowX: 'hidden',
        scrollbarWidth: 'none',
      }}>

        {/* ── HERO BANNER ─────────────────────────────────────────────── */}
        <HeroBanner
          channel={heroChannel}
          isLive={liveMap.get(heroChannel.id)?.isLive ?? false}
          liveTitle={liveMap.get(heroChannel.id)?.title}
          thumbnail={liveMap.get(heroChannel.id)?.thumbnail}
          isFocused={nav.row === -1}
          vw={vw}
          onPlay={() => setPlayerChannel(heroChannel)}
        />

        {/* ── ROWS ────────────────────────────────────────────────────── */}
        <div style={{ padding: `${s(24)}px 0 ${s(80)}px` }}>
          {groups.map(({ label, channels }, rowIdx) => (
            <div key={label} style={{ marginBottom: s(32) }}>

              {/* Row title */}
              <div style={{
                padding: `0 ${s(80)}px`,
                marginBottom: s(14),
                display: 'flex', alignItems: 'center', gap: s(8),
              }}>
                <span style={{ fontSize: s(18) }}>{label.split(' ')[0]}</span>
                <span style={{
                  fontSize: s(18), fontWeight: 800, color: '#fff',
                  textTransform: 'uppercase', letterSpacing: 1,
                }}>
                  {label.split(' ').slice(1).join(' ')}
                </span>
                {channels.some(ch => liveMap.get(ch.id)?.isLive) && (
                  <div style={{
                    background: '#e50914', borderRadius: s(4),
                    padding: `${s(3)}px ${s(8)}px`,
                    fontSize: s(10), fontWeight: 900, letterSpacing: 1,
                  }}>
                    ● AO VIVO
                  </div>
                )}
              </div>

              {/* Cards */}
              <div style={{
                display: 'flex', gap: GAP,
                paddingLeft: s(80), paddingRight: s(80),
                overflowX: 'visible',
              }}>
                {channels.map((ch, colIdx) => {
                  const isFocused = nav.row === rowIdx && nav.col === colIdx
                  const status = liveMap.get(ch.id)

                  return (
                    <ChannelCard
                      key={ch.id}
                      ch={ch}
                      width={CARD_W}
                      height={CARD_H}
                      isFocused={isFocused}
                      isLive={status?.isLive ?? false}
                      liveTitle={status?.title}
                      thumbnail={status?.thumbnail}
                      vw={vw}
                      onSelect={() => setPlayerChannel(ch)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── YOUTUBE PLAYER OVERLAY ──────────────────────────────────── */}
      {playerChannel && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: '#000',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: s(14),
            padding: `${s(12)}px ${s(24)}px`,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(12px)',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: s(20) }}>{playerChannel.emoji}</span>
            <div>
              <div style={{ fontSize: s(16), fontWeight: 800 }}>{playerChannel.name}</div>
              <div style={{ fontSize: s(12), color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {playerChannel.description}
              </div>
            </div>
            <div
              onClick={() => setPlayerChannel(null)}
              style={{
                marginLeft: 'auto',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: s(8),
                padding: `${s(8)}px ${s(20)}px`,
                fontSize: s(13), fontWeight: 700, cursor: 'pointer',
                color: 'rgba(255,255,255,0.6)',
              }}
            >
              ← VOLTAR
            </div>
          </div>
          <iframe
            src={getEmbed(playerChannel)}
            style={{ flex: 1, border: 'none', width: '100%' }}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      )}
    </div>
  )
}

// ─── Hero Banner ──────────────────────────────────────────────────────────────
function HeroBanner({
  channel, isLive, liveTitle, thumbnail, isFocused, vw, onPlay
}: {
  channel: YTChannel
  isLive: boolean
  liveTitle?: string
  thumbnail?: string
  isFocused: boolean
  vw: number
  onPlay: () => void
}) {
  const s = (n: number) => Math.round(n * vw)
  const H = s(460)

  return (
    <div style={{
      position: 'relative', width: '100%', height: H,
      overflow: 'hidden', flexShrink: 0,
    }}>
      {/* Background */}
      <div style={{
        position: 'absolute', inset: 0,
        background: thumbnail
          ? `url(${thumbnail}) center/cover no-repeat`
          : `linear-gradient(135deg, ${channel.color}33 0%, #0a0a1a 100%)`,
      }} />

      {/* Gradients */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0.1) 100%)',
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
        background: 'linear-gradient(to top, #0a0a0f, transparent)',
      }} />

      {/* Emoji watermark */}
      {!thumbnail && (
        <div style={{
          position: 'absolute', right: s(120), top: '50%',
          transform: 'translateY(-50%)',
          fontSize: s(200), opacity: 0.06,
          userSelect: 'none', pointerEvents: 'none',
        }}>
          {channel.emoji}
        </div>
      )}

      {/* Content */}
      <div style={{
        position: 'absolute', bottom: s(50), left: s(80),
        maxWidth: '55%',
      }}>
        {/* Live badge */}
        {isLive && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: s(6),
            background: '#e50914',
            borderRadius: s(5), padding: `${s(4)}px ${s(12)}px`,
            fontSize: s(11), fontWeight: 900, letterSpacing: 1.5,
            marginBottom: s(12),
          }}>
            <span style={{ width: s(6), height: s(6), borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite' }} />
            AO VIVO
          </div>
        )}

        {/* Channel name */}
        <div style={{
          fontSize: s(52), fontWeight: 900, lineHeight: 0.95,
          fontFamily: '"Barlow Condensed", "Outfit", sans-serif',
          textShadow: '0 2px 20px rgba(0,0,0,0.8)',
          marginBottom: s(8),
          color: '#fff',
        }}>
          {channel.name}
        </div>

        {/* Description / Live title */}
        <div style={{
          fontSize: s(16), color: 'rgba(255,255,255,0.65)',
          marginBottom: s(24), lineHeight: 1.4,
          fontWeight: 400,
        }}>
          {liveTitle || channel.description}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: s(12) }}>
          <div
            onClick={onPlay}
            style={{
              display: 'flex', alignItems: 'center', gap: s(10),
              background: isFocused ? '#fff' : 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(8px)',
              border: isFocused ? 'none' : `2px solid ${channel.color}`,
              borderRadius: s(8),
              padding: `${s(14)}px ${s(32)}px`,
              fontSize: s(16), fontWeight: 800,
              color: isFocused ? '#000' : '#fff',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              boxShadow: isFocused ? `0 0 ${s(24)}px ${channel.color}88` : 'none',
            }}
          >
            <span style={{ fontSize: s(18) }}>▶</span>
            {isLive ? 'Assistir ao Vivo' : 'Assistir'}
          </div>
        </div>
      </div>

      {/* Color accent bar bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: s(3),
        background: `linear-gradient(to right, ${channel.color}, transparent)`,
      }} />
    </div>
  )
}

// ─── Channel Card ─────────────────────────────────────────────────────────────
function ChannelCard({
  ch, width, height, isFocused, isLive, liveTitle, thumbnail, vw, onSelect
}: {
  ch: YTChannel
  width: number
  height: number
  isFocused: boolean
  isLive: boolean
  liveTitle?: string
  thumbnail?: string
  vw: number
  onSelect: () => void
}) {
  const s = (n: number) => Math.round(n * vw)

  return (
    <div
      onClick={onSelect}
      style={{
        width, height,
        borderRadius: s(8),
        overflow: 'hidden',
        cursor: 'pointer',
        position: 'relative',
        flexShrink: 0,
        background: thumbnail
          ? `url(${thumbnail}) center/cover`
          : `linear-gradient(145deg, ${ch.color}1a 0%, #111118 100%)`,
        border: isFocused ? `2px solid ${ch.color}` : '2px solid rgba(255,255,255,0.06)',
        transform: isFocused ? 'scale(1.05) translateY(-4px)' : 'scale(1)',
        transition: 'transform 150ms cubic-bezier(0.2,0,0,1), border-color 150ms ease',
        boxShadow: isFocused
          ? `0 ${s(12)}px ${s(32)}px rgba(0,0,0,0.5), 0 0 0 1px ${ch.color}44`
          : `0 ${s(4)}px ${s(16)}px rgba(0,0,0,0.4)`,
      }}
    >
      {/* Overlay gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: isFocused
          ? 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.85) 100%)'
          : 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.88) 100%)',
      }} />

      {/* Emoji when no thumbnail */}
      {!thumbnail && (
        <div style={{
          position: 'absolute', top: '30%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: s(52), opacity: isFocused ? 0.5 : 0.2,
          userSelect: 'none',
          transition: 'opacity 150ms ease',
        }}>
          {ch.emoji}
        </div>
      )}

      {/* Color accent top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: s(3),
        background: ch.color, opacity: isFocused ? 1 : 0.5,
      }} />

      {/* LIVE badge */}
      {isLive && (
        <div style={{
          position: 'absolute', top: s(10), left: s(10),
          background: '#e50914', borderRadius: s(4),
          padding: `${s(3)}px ${s(7)}px`,
          fontSize: s(10), fontWeight: 900, letterSpacing: 1,
          color: '#fff',
        }}>
          ● AO VIVO
        </div>
      )}

      {/* Play icon when focused */}
      {isFocused && (
        <div style={{
          position: 'absolute', top: '38%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: s(44), height: s(44), borderRadius: '50%',
          background: 'rgba(255,255,255,0.18)',
          backdropFilter: 'blur(8px)',
          border: `1.5px solid rgba(255,255,255,0.35)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: s(16),
        }}>
          ▶
        </div>
      )}

      {/* Bottom info */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: `${s(10)}px ${s(12)}px ${s(12)}px`,
      }}>
        {isLive && liveTitle && (
          <div style={{
            fontSize: s(11), color: 'rgba(255,255,255,0.7)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginBottom: s(4),
          }}>
            {liveTitle}
          </div>
        )}
        <div style={{
          fontSize: s(14), fontWeight: 800, color: '#fff',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {ch.name}
        </div>
        <div style={{
          fontSize: s(11), color: 'rgba(255,255,255,0.35)',
          marginTop: s(2),
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {ch.handle}
        </div>
      </div>
    </div>
  )
}
