/**
 * Image Preloader Otimizado (Tizen / Chromium 63)
 * Evita engasgar a Main Thread não usando fetchPriority='high' (que sequer é suportado no Chrome 63).
 * Distribui a carga através de instâncias nativas de Image() e requestIdleCallback.
 */

// Polyfill seguro para requestIdleCallback
const requestIdleCallbackShim = 
  (window as any).requestIdleCallback || 
  function(cb: (deadline: { timeRemaining: () => number }) => void) {
    const start = Date.now()
    return setTimeout(() => {
      cb({
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
      })
    }, 1)
  }

/**
 * Pré-carrega uma única imagem retornando Promise.
 */
export const preloadImage = (url: string): Promise<void> => {
  return new Promise((resolve) => {
    if (!url) {
      resolve()
      return
    }
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => {
      console.warn(`[PRELOAD] Falha ao carregar imagem: ${url}`)
      resolve() // resolvemos para não travar Promise.all de imagens não-críticas
    }
    img.src = url
  })
}

/**
 * Carrega a bateria crítica de imagens simultaneamente e aguarda conclusão.
 * Utilizado ANTES de remover a Splash Screen.
 */
export const preloadCritical = async (urls: string[]): Promise<void> => {
  const validUrls = urls.filter(u => u && u.trim() !== '')
  if (validUrls.length === 0) return
  
  // @ts-ignore
  if (window.DEBUG) console.log(`[PRELOAD CRITICAL] Iniciando ${validUrls.length} imagens.`)
  
  await Promise.all(validUrls.map(preloadImage))
  
  // @ts-ignore
  if (window.DEBUG) console.log(`[PRELOAD CRITICAL] Finalizado.`)
}

/**
 * Pre-load serial de imagens restantes. 
 * Executado fora da thread principal para não concorrer com Decode/Render.
 */
export const preloadIdle = (urls: string[]): void => {
  const queue = urls.filter(u => u && u.trim() !== '')
  if (queue.length === 0) return
  let i = 0
  const processNext = () => {
    if (i < queue.length) {
      const url = queue[i++]
      const img = new Image()
      img.onload = () => { setTimeout(() => requestIdleCallbackShim(processNext), 50) }
      img.onerror = () => { setTimeout(() => requestIdleCallbackShim(processNext), 50) }
      img.src = url
    }
  }
  requestIdleCallbackShim(processNext)
}

/**
 * Carrega imagens em lotes progressivos — cria sensação de "sempre carregando".
 * Cada lote de N imagens aparece junto, com pausa entre lotes.
 * Substitui o preloadCritical (que bloqueava a UI) + preloadIdle (muito lento).
 */
export const preloadBatched = (urls: string[], batchSize = 10, batchDelay = 150): void => {
  const queue = urls.filter(u => u && u.trim() !== '')
  if (queue.length === 0) return
  let index = 0
  const loadBatch = () => {
    const batch = queue.slice(index, index + batchSize)
    if (!batch.length) return
    batch.forEach(url => { const img = new Image(); img.src = url })
    index += batchSize
    if (index < queue.length) setTimeout(loadBatch, batchDelay)
  }
  // Pequeno delay inicial para não competir com o primeiro render do React
  setTimeout(() => requestIdleCallbackShim(loadBatch), 100)
}
