import React, { useState, useEffect } from 'react'
import { fetchTitleLogo } from '../services/tmdbService'

interface Props {
  tmdbId?: number
  mediaType?: 'movie' | 'tv'
  fallbackLogo?: string
  fallbackText: string
  vw: number
}

export default function TmdbTitleLogo({ tmdbId, mediaType, fallbackLogo, fallbackText, vw }: Props) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    if (!tmdbId || !mediaType) {
      setLogoUrl(null)
      return
    }
    
    // Mostra nulo enquanto carrega para evitar flash do logo antigo
    setLogoUrl(null)

    fetchTitleLogo(tmdbId, mediaType).then(url => {
      if (mounted && url) {
        setLogoUrl(url)
      }
    })

    return () => { mounted = false }
  }, [tmdbId, mediaType])

  // Usa o logo do TMDB se houver, caso contrário tenta o logo do canal, e por último o texto.
  const displayLogo = logoUrl || fallbackLogo

  if (displayLogo) {
    return (
      <img
        src={displayLogo}
        alt={fallbackText}
        style={{
          maxHeight: Math.round(120 * vw),
          maxWidth: Math.round(400 * vw),
          objectFit: 'contain',
          objectPosition: 'left bottom',
          filter: 'drop-shadow(0px 4px 12px rgba(0,0,0,0.8))',
          animation: 'fadeIn 300ms ease-out'
        }}
        onError={(e) => {
          // Se a imagem falhar, esconde a tag img (o que não mostra texto, mas evita quadrado quebrado)
          ;(e.target as HTMLImageElement).style.display = 'none'
        }}
      />
    )
  }

  return (
    <span style={{ animation: 'fadeIn 300ms ease-out' }}>
      {fallbackText}
    </span>
  )
}
