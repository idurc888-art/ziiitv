import React, { useEffect, useRef, useState } from 'react'
import { expandManager, type ExpandState } from '../services/expandManager'
import { keyboardMaestro } from '../services/keyboardManager'
import type { Channel } from '../types/channel'

export default function FullscreenOverlay({ onEnterPlayerMode }: { onEnterPlayerMode: (channel: Channel | null) => void }) {
  const [expandState, setExpandState] = useState<ExpandState>('idle')
  const [channel, setChannel] = useState<Channel | null>(null)
  const channelRef = useRef(channel)
  channelRef.current = channel

  useEffect(() => {
    const unsub = expandManager.subscribe((st, ch) => {
      setExpandState(st)
      setChannel(ch)
    })
    return () => { unsub() }
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (expandState !== 'fullscreen' && expandState !== 'expanding') return
      const isEnter = e.keyCode === 13 || e.key === 'Enter'
      if (isEnter) {
        e.preventDefault()
        onEnterPlayerMode(channelRef.current)
      }
    }
    keyboardMaestro.subscribe('fullscreen_overlay', handleKey)
    return () => keyboardMaestro.unsubscribe('fullscreen_overlay')
  }, [expandState, onEnterPlayerMode])

  return null
}
