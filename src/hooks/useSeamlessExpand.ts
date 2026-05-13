import { useCallback } from 'react'
import { expandManager, type Rect } from '../services/expandManager'
import { playerManager } from '../services/PlayerManager'
import type { Channel } from '../types/channel'

interface ExpandOptions {
  cardId: string
  objectId: string
}

export function useSeamlessExpand({ cardId, objectId }: ExpandOptions) {

  const collapse = useCallback(() => {
    // 1. Volta estado React e CSS (fade-in da HUD)
    expandManager.markCollapsing()
    
    // 2. Comanda o PlayerManager para devolver a tag <object> à caixa original
    playerManager.collapseToCard()

    // 3. Aguarda pequenos milissegundos para estabilizar DOM e marca idle
    setTimeout(() => {
      expandManager.markIdle()
    }, 50)
  }, [])

  const expand = useCallback((channel: Channel, cardDOM: HTMLElement) => {
    if (!playerManager.isAvailable()) return

    // Compensar o INSET = 8px que a capa real tem dentro do card
    const r = cardDOM.getBoundingClientRect()
    const INSET = 8
    const startRect: Rect = { 
      x: r.left + INSET, 
      y: r.top + INSET, 
      w: r.width - (INSET * 2), 
      h: r.height - (INSET * 2) 
    }

    // Melhor qualidade disponível para fullscreen (streams já ordenados 4K > FHD > HD > SD)
    const bestUrl = channel.streams[0]?.url

    expandManager.triggerExpand(channel, startRect, objectId, collapse)
    expandManager.markFullscreen()

    // Expande imediatamente + upgrade de qualidade em background se disponível
    playerManager.expandToFullscreen(bestUrl)
  }, [cardId, objectId, collapse])

  return { expand, collapse }
}
