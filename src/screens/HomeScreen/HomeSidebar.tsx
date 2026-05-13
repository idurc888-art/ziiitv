import React from 'react'
import type { FocusZone } from './homeTypes'
import { SIDEBAR_ICONS } from './homeConstants'

interface Props {
  focusZone: FocusZone
  sidebarIdx: number
  accent: string
}

export default function HomeSidebar({ focusZone, sidebarIdx, accent }: Props) {
  return (
    <div style={{
      position: 'fixed',
      top: 0, bottom: 0, left: 0,
      width: 280,
      background: 'rgba(8,8,14,0.96)',
      borderRight: '1px solid rgba(255,0,110,0.25)',
      zIndex: 999,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'flex-start',
      padding: '120px 16px 40px',
      gap: 4,
      transform: focusZone === 'sidebar' ? 'translate3d(0,0,0)' : 'translate3d(-323px,0,0)',
      transition: 'transform 300ms cubic-bezier(0.2,0,0,1)',
      overflow: 'hidden',
    }}>
      {SIDEBAR_ICONS.map((item, i) => {
        const isActive = focusZone === 'sidebar' && sidebarIdx === i
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '0 20px',
            height: 56,
            borderRadius: 10,
            color: isActive ? '#fff' : 'rgba(255,255,255,0.35)',
            background: isActive ? 'rgba(255,0,110,0.12)' : 'transparent',
            borderLeft: isActive ? `3px solid ${accent}` : '3px solid transparent',
            transition: 'all 200ms ease',
          }}>
            <div style={{
              width: 22, height: 22, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: isActive ? accent : 'inherit',
            }}>
              {item.svg}
            </div>
            <div style={{
              fontSize: 18, fontWeight: isActive ? 700 : 400,
              fontFamily: '"Outfit", sans-serif',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}>
              {item.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}
