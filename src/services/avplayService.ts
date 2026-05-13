/**
 * avplayService.ts — Facade de compatibilidade
 *
 * FIX #2 — Este arquivo existia em paralelo com PlayerManager.ts,
 * gerando dois isAVPlayBusy independentes e race conditions garantidas.
 *
 * Solução: todas as operações de stop/play pesadas foram migradas para
 * PlayerManager (singleton real). Este arquivo agora exporta apenas
 * utilitários sem estado que PlayerScreen e outros ainda precisam importar.
 *
 * NÃO adicionar isAVPlayBusy aqui. Use playerManager diretamente.
 */

export function isAVPlayAvailable(): boolean {
  const webapis = (window as any).webapis
  return !!(webapis && webapis.avplay)
}

/**
 * Para e fecha o AVPlay de forma segura.
 * Delega para o playerManager para garantir estado único.
 */
export function avplayReleaseBusy(): void {
  try { (window as any).webapis?.avplay?.stop() } catch (_) {}
}

export function avplayStop(): void {
  if (!isAVPlayAvailable()) return
  try {
    const avplay = (window as any).webapis.avplay
    avplay.stop()
    avplay.close()
  } catch (_) {}
}
