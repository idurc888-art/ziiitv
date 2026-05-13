import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Step = 'loading' | 'form' | 'success' | 'expired' | 'error'

export function LinkPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [step, setStep] = useState<Step>('loading')
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) { setStep('error'); setErrorMsg('Token não encontrado na URL.'); return }

    supabase
      .from('pair_tokens')
      .select('status, expires_at')
      .eq('token', token)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setStep('error'); setErrorMsg('Código inválido ou expirado.'); return }
        if (data.status === 'linked')  { setStep('success'); return }
        if (data.status === 'expired' || new Date(data.expires_at) < new Date()) { setStep('expired'); return }
        setStep('form')
      })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setSubmitting(true)
    setErrorMsg('')

    const { error } = await supabase
      .from('pair_tokens')
      .update({ status: 'linked', playlist_url: url.trim(), playlist_type: 'm3u', linked_at: new Date().toISOString() })
      .eq('token', token)

    if (error) {
      setErrorMsg('Erro ao vincular. Tente novamente.')
      setSubmitting(false)
      return
    }
    setStep('success')
  }

  return (
    <div style={{
      minHeight: '100dvh', background: '#0a0a0f',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '24px 20px',
      fontFamily: "'Outfit', system-ui, sans-serif", color: '#fff',
    }}>

      {/* Logo */}
      <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', color: '#ff006e', marginBottom: 40, textShadow: '0 0 24px rgba(255,0,110,0.5)' }}>
        ZIII<span style={{ color: '#fff' }}>TV</span>
      </div>

      <div style={{ width: '100%', maxWidth: 420 }}>

        {step === 'loading' && (
          <div style={{ textAlign: 'center', opacity: 0.5, fontSize: 16 }}>Verificando código...</div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Vincular sua lista</div>
              <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                Cole a URL M3U da sua lista IPTV abaixo para vincular à sua TV.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                URL M3U ou M3U8
              </label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="http://servidor.com/lista.m3u?user=...&pass=..."
                required
                style={{
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 12, padding: '14px 16px', fontSize: 14, color: '#fff',
                  outline: 'none', width: '100%', boxSizing: 'border-box',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            {errorMsg && (
              <div style={{ background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)', borderRadius: 10, padding: '12px 16px', fontSize: 14, color: '#ff6b6b' }}>
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !url.trim()}
              style={{
                background: submitting ? 'rgba(255,0,110,0.4)' : '#ff006e',
                border: 'none', borderRadius: 12, padding: '16px',
                fontSize: 16, fontWeight: 700, color: '#fff',
                cursor: submitting ? 'not-allowed' : 'pointer',
                transition: 'background 200ms',
              }}
            >
              {submitting ? 'Vinculando...' : 'Vincular à TV'}
            </button>

            <div style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
              Código: {token}
            </div>
          </form>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', border: '2px solid rgba(34,197,94,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
              ✓
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#4ade80', marginBottom: 8 }}>TV vinculada!</div>
              <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                Sua lista foi configurada com sucesso.<br />Pode fechar esta página e voltar para a TV.
              </div>
            </div>
          </div>
        )}

        {step === 'expired' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 48 }}>⏳</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fbbf24' }}>Código expirado</div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)' }}>
              O código expirou. Volte à TV e gere um novo.
            </div>
          </div>
        )}

        {step === 'error' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 48 }}>❌</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f87171' }}>Código inválido</div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)' }}>
              {errorMsg || 'Este código não existe ou já foi utilizado.'}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
