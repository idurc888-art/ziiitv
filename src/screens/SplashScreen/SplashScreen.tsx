import { useEffect, useRef, useState } from 'react'

interface Props { onDone: () => void }

export default function SplashScreen({ onDone }: Props) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in')
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const hasTriggeredExit = useRef(false)

  const exit = () => {
    if (hasTriggeredExit.current) return
    hasTriggeredExit.current = true
    setPhase('out')
    setTimeout(() => onDoneRef.current(), 500)
  }

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 100)
    const t2 = setTimeout(() => exit(), 1800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#000',
      display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      opacity: phase === 'out' ? 0 : 1,
      transition: phase === 'in' ? 'opacity 200ms ease' : 'opacity 500ms ease',
    }}>
      <img
        src="alien-peek.png"
        alt=""
        style={{
          maxWidth: '40vw',
          maxHeight: '60vh',
          objectFit: 'contain',
          opacity: phase === 'in' ? 0 : 1,
          transition: 'opacity 400ms ease',
        }}
      />
    </div>
  )
}
