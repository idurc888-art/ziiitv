import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { usePairing } from '../../hooks/usePairing'
import type { PairToken } from '../../services/pairingService'

const PINK  = '#ff006e'
const DARK  = '#0a0a0f'
const FONT  = "'Outfit', 'Helvetica Neue', sans-serif"

interface Props {
  onComplete: (data: PairToken) => void
}

export default function SetupScreen({ onComplete }: Props) {
  const { state, qrUrl, token, secondsLeft, refresh, pairData } = usePairing()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!qrUrl || !canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, qrUrl, {
      width: 280,
      margin: 2,
      color: { dark: '#0a0a0f', light: '#ffffff' },
    }).catch(console.error)
  }, [qrUrl])

  useEffect(() => {
    if (state === 'linked' && pairData) {
      setTimeout(() => onComplete(pairData), 1500)
    }
  }, [state, pairData, onComplete])

  const min = Math.floor(secondsLeft / 60)
  const sec = secondsLeft % 60
  const timeStr = `${min}:${String(sec).padStart(2, '0')}`
  const urgent  = secondsLeft < 60

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: 1920, height: 1080,
      background: DARK, fontFamily: FONT, color: '#fff', overflow: 'hidden',
    }}>
      {/* Glow de fundo */}
      <div style={{
        position: 'absolute', top: -200, right: -200,
        width: 800, height: 800, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(255,0,110,0.12) 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -300, left: -100,
        width: 600, height: 600, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(255,0,110,0.06) 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Conteúdo central */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>

        {/* Logo */}
        <div style={{
          position: 'absolute', top: 52, left: 80,
          fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em',
        }}>
          <span style={{ color: PINK, textShadow: `0 0 30px rgba(255,0,110,0.6)` }}>ZIII</span>
          <span style={{ color: '#fff' }}>TV</span>
        </div>

        {/* LOADING */}
        {state === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              border: '4px solid rgba(255,255,255,0.1)',
              borderTop: `4px solid ${PINK}`,
              animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ fontSize: 22, opacity: 0.6 }}>Gerando código de acesso...</div>
          </div>
        )}

        {/* PRONTO */}
        {state === 'ready' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 100,
            width: 1200,
          }}>
            {/* ─── ESQUERDA ─── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>

              <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1.15, marginBottom: 16 }}>
                Configure sua TV
              </div>
              <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.5)', marginBottom: 52, lineHeight: 1.6 }}>
                Escaneie o QR code com seu celular e cole<br />sua URL M3U ou Xtream para ativar.
              </div>

              {/* Passos */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 52 }}>
                {[
                  'Abra a câmera do celular',
                  'Aponte para o QR code ao lado',
                  'Cole sua URL M3U no site que abrir',
                ].map((label, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                      background: PINK, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 800, color: '#fff',
                      boxShadow: `0 0 16px rgba(255,0,110,0.4)`,
                    }}>
                      {i + 1}
                    </div>
                    <span style={{ fontSize: 20, color: 'rgba(255,255,255,0.75)' }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Código manual */}
              <div style={{
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid rgba(255,0,110,0.3)`,
                borderRadius: 16, padding: '20px 28px',
                display: 'flex', flexDirection: 'column', gap: 6,
                marginBottom: 24,
                boxShadow: `0 0 24px rgba(255,0,110,0.1)`,
              }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 2 }}>
                  Ou acesse manualmente
                </span>
                <span style={{
                  fontFamily: 'monospace', fontSize: 14,
                  color: 'rgba(255,255,255,0.5)',
                }}>
                  ziiitv-admin.vercel.app/link?token=
                  <span style={{ color: PINK, fontWeight: 700, fontSize: 16 }}>{token}</span>
                </span>
              </div>

              {/* Timer */}
              <div style={{
                fontSize: 15,
                color: urgent ? '#ff6b6b' : 'rgba(255,255,255,0.3)',
                fontWeight: urgent ? 600 : 400,
              }}>
                {urgent ? '⚠️' : '⏱'} Expira em {timeStr}
              </div>
            </div>

            {/* ─── DIREITA — QR CODE ─── */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
              <div style={{
                background: '#fff', borderRadius: 24, padding: 20,
                boxShadow: `0 0 60px rgba(255,0,110,0.3), 0 0 120px rgba(255,0,110,0.1)`,
              }}>
                <canvas ref={canvasRef} style={{ display: 'block' }} />
              </div>
              <div style={{
                background: `rgba(255,0,110,0.1)`,
                border: `1px solid rgba(255,0,110,0.25)`,
                borderRadius: 10, padding: '10px 20px',
                fontSize: 14, color: 'rgba(255,255,255,0.5)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: PINK, display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite' }} />
                Aguardando vinculação
              </div>
            </div>
          </div>
        )}

        {/* SUCESSO */}
        {state === 'linked' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
            <div style={{
              width: 100, height: 100, borderRadius: '50%',
              background: `rgba(255,0,110,0.15)`,
              border: `3px solid ${PINK}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 44, color: PINK,
              boxShadow: `0 0 40px rgba(255,0,110,0.3)`,
              animation: 'fadeIn 0.4s ease',
            }}>
              ✓
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, fontWeight: 800, marginBottom: 12 }}>TV configurada!</div>
              <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.5)' }}>Sua lista foi vinculada. Entrando na Home...</div>
            </div>
          </div>
        )}

        {/* EXPIRADO */}
        {state === 'expired' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 60 }}>⏳</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#fbbf24' }}>Código expirou</div>
            <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
              Gere um novo código para continuar.
            </div>
            <button onClick={refresh} style={{
              background: PINK, border: 'none', borderRadius: 12,
              padding: '16px 48px', fontSize: 18, fontWeight: 700, color: '#fff',
              cursor: 'pointer',
            }}>
              Gerar novo código
            </button>
          </div>
        )}

        {/* ERRO */}
        {state === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 56 }}>📡</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#ff6b6b' }}>Sem conexão com o servidor</div>
            <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.4)', maxWidth: 600, lineHeight: 1.6 }}>
              Não foi possível criar o código de pareamento.<br/>
              Verifique sua conexão ou use o código manual abaixo.
            </div>
            <button onClick={refresh} style={{
              background: PINK, border: 'none', borderRadius: 12,
              padding: '16px 48px', fontSize: 18, fontWeight: 700, color: '#fff',
              cursor: 'pointer',
            }}>
              Tentar novamente
            </button>
          </div>
        )}

      </div>

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes pulse   { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes fadeIn  { from { opacity:0; transform:scale(0.9); } to { opacity:1; transform:scale(1); } }
      `}</style>
    </div>
  )
}
