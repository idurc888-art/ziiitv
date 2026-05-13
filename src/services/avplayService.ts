// AVPlay Service — API nativa Samsung Tizen
// Funções utilitárias usadas pelo PlayerScreen e HomeScreen.
// A lógica de player completa está em PlayerManager.ts.

export function isAVPlayAvailable(): boolean {
  const webapis = (window as any).webapis
  return !!(webapis && webapis.avplay)
}

export function avplayStop(): void {
  if (!isAVPlayAvailable()) return
  try {
    const avplay = (window as any).webapis.avplay
    avplay.stop()
    avplay.close()
  } catch { /* ignorar */ }
}

// No-op mantido para compatibilidade com HomeScreen (flag de busy foi removida com avplayLoad)
export function avplayReleaseBusy(): void {}
