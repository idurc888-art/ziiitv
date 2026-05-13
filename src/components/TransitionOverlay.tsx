import { useEffect, useState } from 'react'
import { transitionStore } from '../services/transitionStore'

export default function TransitionOverlay() {
  const [state, setState] = useState(() => transitionStore.getState())

  useEffect(() => {
    const unsub = transitionStore.subscribe(setState)
    return () => { unsub() }
  }, [])

  return (
    <div style={{
      position: 'fixed',
      top: 0, right: 0, bottom: 0, left: 0,
      zIndex: 9998,
      pointerEvents: 'none',
      opacity: state.visible ? 1 : 0,
      transition: `opacity ${state.visible ? '100ms' : '200ms'} ease`,
    }}>
      {state.backgroundImage && (
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
          backgroundImage: `url(${state.backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(8px)',
          transform: 'scale(1.05)',
          opacity: 0.5,
        }} />
      )}

      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
        background: 'rgba(0, 0, 0, 0.88)',
      }} />

      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div className="ziii-spinner" />
        {state.message && (
          <div style={{
            marginTop: 28, fontSize: 22, fontWeight: 600,
            color: '#fff', letterSpacing: 1,
            textShadow: '0 2px 8px rgba(0,0,0,0.8)',
            fontFamily: '"Outfit", sans-serif',
          }}>
            {state.message}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .ziii-spinner {
          width: 80px;
          height: 80px;
          border: 5px solid rgba(255,255,255,0.12);
          border-top-color: #ff006e;
          border-radius: 50%;
          animation: spin 0.85s linear infinite;
        }
      `}</style>
    </div>
  )
}
