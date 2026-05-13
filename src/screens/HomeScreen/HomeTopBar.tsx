import React from 'react'
import type { FocusZone, DashboardView } from './homeTypes'
import { TOPBAR_LINKS } from './homeConstants'

interface Props {
  focusZone: FocusZone
  topbarIdx: number
  activeView: DashboardView
  accent: string
  links?: Array<{ label: string; view: DashboardView }> // filtrado por hasChannels
}

function itemGlow(active: boolean): React.CSSProperties {
  return active
    ? {
        boxShadow: '0 0 0 2px #ff006e, 0 0 18px rgba(255,0,110,0.55), 0 0 40px rgba(255,0,110,0.2)',
        background: 'rgba(255,0,110,0.14)',
      }
    : {}
}

export default function HomeTopBar({ focusZone, topbarIdx, activeView, accent, links }: Props) {
  const visibleLinks = links ?? TOPBAR_LINKS
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0,
      zIndex: 90,
      height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 80px',
      background: 'transparent',
      border: 'none',
      boxShadow: 'none',
      opacity: focusZone === 'content' ? 0 : 1,
      transform: focusZone === 'content' ? 'translateY(-100%)' : 'translateY(0)',
      pointerEvents: focusZone === 'content' ? 'none' : 'auto',
      transition: 'opacity 300ms ease, transform 300ms ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {visibleLinks.map((link, i) => {
          const active = focusZone === 'topbar' && topbarIdx === i
          const isCurrentView = activeView === link.view
          return (
            <div key={i} style={{
              fontSize: 26,
              fontWeight: active ? 700 : 500,
              fontFamily: '"Inter", sans-serif',
              letterSpacing: active ? 0.5 : 0.3,
              textTransform: 'uppercase',
              color: active ? '#fff' : (isCurrentView ? accent : 'rgba(255,255,255,0.45)'),
              padding: '8px 20px',
              borderRadius: 6,
              transition: 'all 220ms ease',
              whiteSpace: 'nowrap',
              borderBottom: isCurrentView && !active ? `3px solid ${accent}` : '3px solid transparent',
              ...itemGlow(active),
            }}>
              {link.label}
            </div>
          )
        })}
      </div>
    </div>
  );
}

