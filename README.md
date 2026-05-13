# ziiiTV — Contexto do Projeto

## Objetivo
App IPTV para Samsung Tizen 4.0+ (TV UN50RU7100GXZD) que carrega playlists M3U, navega com D-pad e reproduz streams HLS/DASH/TS.

## Stack Confirmada (Funcionando na TV)
- React 18 + Vite 4 + TypeScript
- Vite 4.5.14 com `@vitejs/plugin-legacy` (polyfills para Chromium 56+)
- IndexedDB nativo singleton (sem lib `idb` que causava problemas)
- Shaka Player (HLS/DASH) + AVPlay (fallback .ts)
- Zustand + Web Worker (fallback thread principal)

## Status Atual (12/05/2026) ✅ TELA COPA DO MUNDO IMPLEMENTADA

✅ **TELA COPA DO MUNDO (`CopaView.tsx`)**
- Banner com imagem `public/copa-bg.jpg` (Brasil x Marrocos, pedra texturizada, sem gradientes)
- Imagem da taça `public/copa-trophy.jpg` como fundo dos cards de jogos (100% visível)
- Emblemas das seleções 192px com glow colorido por horário (azul/âmbar/rosa/roxo)
- Horário do jogo 3x maior abaixo do card central
- Animação `cardImgEnter` (scale+fade) ao trocar card via `key={focusedMatch.id}`
- Cards centralizados (sem offset de 10% da sidebar)

✅ **ROWS DA COPA**
- Row 0: **Grupos A-L** — navegação infinita estilo HomeScreen, cores primárias dos times
- Rows 1-7: **7 dias fixos** a partir de 11/Jun (início da Copa), uma row por dia
- Dias sem jogos mostram placeholder "Nenhum jogo da Copa neste dia"
- Rows de artilheiros e canais ao final

✅ **API REAL — SportAPI (RapidAPI)**
- Key: `e3c78c49d2mshe020422b49646f8p12ab53jsna9b37bb18985`
- Host: `sportapi7.p.rapidapi.com`
- Copa 2026: `uniqueTournament=16`, `season=58210`
- `rapidStandings()` — 12 grupos com cores dos times (`teamColors.primary`)
- `rapidMatches()` — jogos dos próximos 30 dias
- Cache localStorage: standings 5min, matches 2min
- Fallback: Supabase → mock

✅ **MOCK COPA 2026 (`src/data/copaMock.ts`)**
- 19 jogos reais de 11/Jun a 17/Jun com times, horários e estádios corretos
- 12 grupos A-L com times reais
- Bandeiras via `flagcdn.com`

## 🔜 PRÓXIMO — Match Copa × Canais da Playlist

**Ideia:** botão "Onde Assistir" no jogo da Copa faz match com os canais da playlist M3U do usuário.
- Busca canais por palavras-chave: `SporTV`, `Premiere`, `ESPN`, `Band`, `Record`, `CazéTV`
- Abre direto no player AVPlay (sem YouTube, sem iframe)
- Usa `matchedChannels` do `channelsStore` que já está carregado
- Prioridade: canais ao vivo > canais de esporte > canais gerais

**Arquivos envolvidos:**
- `src/screens/CopaScreen/MatchDetailOverlay.tsx` — botão "Onde Assistir"
- `src/store/channelsStore.ts` — fonte dos canais
- `src/services/copaChannels.ts` — keywords de match por canal

## ⚠️ COPA — VALORES CALIBRADOS
```typescript
// CopaView.tsx
centralLeft = Math.floor((window.innerWidth - CENTRAL_W) / 2)  // sem offset 10%
emblemas    = Math.round(192 * vw)  // 192px (-20% de 240px)
horário     = Math.round(39 * vw)   // 3x maior que original (13px)
copa-bg.jpg = public/copa-bg.jpg    // Brasil x Marrocos, pedra texturizada
copa-trophy = public/copa-trophy.jpg // taça Copa do Mundo
```

## Status Atual (03/05/2026) ✅ LAYOUT PREMIUM FUNCIONANDO
 ONDE 
✅ **ANIMAÇÕES DIRECIONAIS NOS CARDS**
- Cards laterais: `transition: transform` com `cubic-bezier(0.2,0,0,1)` — deslizam horizontalmente
- Card central: `slotEnter-${navDir}` 400ms com fade-in direcional
- UP/DOWN: `transition: none` nos cards laterais (evita pulo lateral ao mudar de row)
- Rows não focadas: `animation: none` nas imagens (não animam quando muda de row)
- Imagens 108% para esconder bordas durante animação

✅ **OVERLAY ESCURO NOS CARDS**
- Cards à esquerda da row focada: overlay `rgba(0,0,0,0.80)` fixo
- Cards à direita da row não focada: overlay `rgba(0,0,0,0.80)` fixo
- Foco visual no card central

✅ **LAYOUT DAS ROWS**
- `targetScroll = rowTop - 105` — ancora row focada com espaço do topo
- `TOP_PAD` diferenciado: acima = `-115vw` (sobe/esconde), abaixo = `55vw` (desce)
- Card central deslocado 10% à esquerda (`centralLeft - 10% viewport`)
- `CENTRAL_H = CARD_H * 1.15 + 40` — card central 40px maior
- Rows não focadas alinhadas com o mesmo offset de 10%

✅ **TÍTULOS DAS ROWS**
- Removidos — substituídos pelo badge streaming acima do card central

✅ **BADGE STREAMING ACIMA DO CARD CENTRAL**
- Retângulo: largura do card lateral - 13px, texto da streaming à esquerda
- Quadrado: logo neon da streaming (Netflix/Amazon/Disney/Max/Apple) proporção 16:9
- Logos em `/public/logo-netflix.png`, `logo-amazon.png`, `logo-disney.png`, `logo-max.png`, `logo-apple.png`
- Glow colorido externo por streaming
- Row "Continuar Assistindo" não mostra badge

✅ **TEXTOS DO CARD CENTRAL**
- Título e tipo alinhados à esquerda
- Descrição alinhada à esquerda

✅ **ET (ALIEN) NO MENU**
- PNG: `public/alien-peek.png` (ziiirecortado.png)
- `position: fixed` fora do container com `opacity` (causa raiz do bug Chromium 63)
- Fechado: `left: -187, top: -86`, tamanho 390px
- Aberto: `left: 94, top: -129`, tamanho 454px (10% maior)
- Sombra: `drop-shadow` triplo
- Animação: `transition` suave em `left`, `top`, `width`, `height`

✅ **MENU SIDEBAR**
- Expande só lateralmente (width: 280px, `translate3d(-323px)` quando fechado)
- `transition: transform 300ms cubic-bezier(0.2,0,0,1)`
- Background: `rgba(8,8,14,0.96)` com borda rosa sutil

✅ **BANNER HERO**
- Texto posicionado no rodapé (`bottom: 80px` no CSS)
- Rola suavemente ao entrar no conteúdo (transition 500ms)

✅ **PLAYER AVPlay**
- Container raiz: `background: transparent` no Tizen (hole punch)
- TransitionOverlay: some em 3s após PlayerScreen montar (safety timer)
- `setActiveView('player')` imediato no clique (sem gap de re-render)
- HomeScreen usa `keyboardMaestro.subscribe('main')` — para de receber teclas quando player ativo
- Timeout prepareAsync: 16s
- Loading overlay: `background: transparent` (não tampa o vídeo)

✅ **PIPELINE M3U ADMIN**
- `GROUP_TO_STREAMING`: 80+ mapeamentos cobrindo 5 provedores
- `parseSeriesEntry()`: extrai título/temporada/episódio (SxxExx)
- `getVersion()`: detecta dub/leg pelo nome e group-title
- `seasons: {}`: episódios agrupados por temporada/episódio
- `unmatchedChannels` salvos no Supabase (não descartados)
- Código do app: formato `ZIII-XXXX`

## ⚠️ LAYOUT DAS ROWS — VALORES CALIBRADOS (NÃO MEXER SEM ENTENDER)
**Arquivo:** `src/screens/HomeScreen/HomeScreen.tsx`

```typescript
targetScroll = rowTop - 105        // ancora row focada
CENTRAL_H    = CARD_H * 1.15 + 40 // card central maior
TITLE_AREA   = 65vw                // espaço acima do card
DESC_AREA    = 80vw                // espaço abaixo do card
TOP_PAD      = isAbove ? -115vw : 55vw  // rows vizinhas
centralLeft  = center - 10% viewport   // deslocado à esquerda
```

## ⚠️ ET (ALIEN) — POSIÇÕES CALIBRADAS
```typescript
// Fechado:
left: -187, top: -86, width: 390, height: 390
// Aberto:
left: 94, top: -129, width: 454, height: 454
```

## ⚠️ LIMITAÇÕES TIZEN (NÃO USAR)
- ❌ `position: fixed` quebra se pai tem `opacity` ou `transform`
- ❌ `el.getAnimations()` / `el.animate()` — Web Animations API não existe
- ❌ CSS `inset` — usar `top/left/right/bottom` explícito
- ✅ CSS `transition` e `@keyframes` funcionam
- ✅ `translate3d` funciona (GPU compositor)


✅ **LAYOUT NETFLIX 3 ROWS FUNCIONANDO NA TV**
- Row de cima: cards visíveis parcialmente no topo (peek)
- Row central focada: card grande + título + descrição
- Row de baixo: cards visíveis parcialmente embaixo (peek)
- Scroll JS ancorando row focada a 80px do topo (`targetScroll = rowTop - 80`)
- Cinema mode expandido para tela toda (`position: fixed`) ao autoplay

✅ **TELA DE SÉRIES REFORMULADA (HomeScreen-style)**
- Uma row por temporada (igual HomeScreen)
- Card central 10% menor que Home (`CEN_H = CARD_H * 1.035`)
- Navegação UP/DOWN entre temporadas, LEFT/RIGHT entre episódios
- Scroll JS ancorando temporada focada a 80px do topo
- Hero compacto 160px no topo com backdrop + título + sinopse
- Título "EPISÓDIO S01E01" acima do card central

✅ **WATCH PROGRESS SALVO AUTOMATICAMENTE**
- `PlayerManager.requestPlay` recebe `channelName` como 1º parâmetro
- `oncurrentplaytime` salva progresso a cada 15s via `saveWatchProgress`
- `historyService.ts` persiste em localStorage (pronto para sync Supabase)

✅ **LOGS COMPLETOS NO CONSOLE DA TV**
- `[NAV] ROW_DOWN/UP` — navegação entre rows com título
- `[NAV] COL_LEFT/RIGHT` — navegação entre cards com nome do canal
- `[NAV] CINEMA_ON/OFF` — ativação/desativação do cinema mode
- `[NAV] SCROLL` — posição exata do scroll a cada navegação
- `[NAV] PLAY` — canal tocado com URL e qualidade
- Rodar: `node scripts/log-server.cjs`

✅ **QUALIDADE AUTOMÁTICA DE STREAM**
- `handlePlay` sempre escolhe a melhor qualidade disponível (4K > FHD > HD > SD)
- `quickProbeUrl` testa a melhor stream antes do play
- Fallback automático para próxima qualidade se probe falhar
- Buffer aumentado: `INITIAL_BUFFER` 4000ms, `PENDING_BUFFER` 8000ms

✅ **GOLDEN OFFSET — PREVIEW SEMPRE DE ONDE PAROU**
- `goldenOffset.ts` centraliza lógica de start position
- Prioridade: heroOffset salvo > 15s → URL pattern → fallback
- `cancelRequest()` salva offset atual via `saveHeroOffset` antes de parar
- `seekTo` no `onbufferingcomplete` com flag `hasSeekFired` (evita loop infinito)

✅ **ZERO DYNAMIC IMPORTS NO PLAYERMANAGER**
- Todos imports estáticos — elimina piscada preta causada por lazy loading no Tizen

✅ **TIMEOUT DE 8S NO PREPAREASYNC**
- Servidores IPTV lentos não travam mais o player
- Após 8s sem resposta, card volta ao thumbnail automaticamente
- Log: `[HW] TIMEOUT prepareAsync sem resposta em 8s`

✅ **STREAM HEALTH MONITOR**
- Auto-recovery de desync: detecta rebuffering excessivo (3x em 30s)
- Detecta player congelado (4s sem avançar)
- Recovery automático: stop + close + executePlay no ponto atual - 2s
- Spinner de recovery no AutoplayCard

✅ **EFEITO SLOT MACHINE NOS CARDS**
- Transição 160ms com snap duro `cubic-bezier(0.0, 0.9, 0.57, 1.0)`
- Animação direcional nas imagens (entra pelo lado do D-pad)
- Keyframes: `slotEnter-right/left/up/down`

✅ **SUPABASE BACKEND FUNCIONANDO**
- Admin salva só canais matchados (~573) em vez de 59.836 brutos
- Edge Function `get-channels` retorna rápido sem estourar memória/CPU
- Problema resolvido: `UploadPlaylist.tsx` agora ignora `unmatchedChannels`
- Deploy nas duas TVs (sua + pais) funcionando

✅ **DOIS ÍCONES DO APP (quadrado + retangular)**
- `icon.png` — ícone quadrado (lista de apps)
- `icon_large.png` — ícone retangular (banner)
- Logo: alien rosa neon com controle remoto

✅ **LAYOUT NETFLIX 3 ROWS FUNCIONANDO NA TV**
- Row de cima: cards visíveis parcialmente no topo (peek)
- Row central focada: card grande + título + descrição
- Row de baixo: cards visíveis parcialmente embaixo (peek)
- Scroll JS ancorando row focada a 80px do topo (`targetScroll = rowTop - 80`)
- Cinema mode expandido para tela toda (`position: fixed`) ao autoplay

✅ **TELA DE SÉRIES REFORMULADA (HomeScreen-style)**
- Uma row por temporada (igual HomeScreen)
- Card central 10% menor que Home (`CEN_H = CARD_H * 1.035`)
- Navegação UP/DOWN entre temporadas, LEFT/RIGHT entre episódios
- Scroll JS ancorando temporada focada a 80px do topo
- Hero compacto 160px no topo com backdrop + título + sinopse
- Título "EPISÓDIO S01E01" acima do card central

✅ **WATCH PROGRESS SALVO AUTOMATICAMENTE**
- `PlayerManager.requestPlay` recebe `channelName` como 1º parâmetro
- `oncurrentplaytime` salva progresso a cada 15s via `saveWatchProgress`
- `historyService.ts` persiste em localStorage (pronto para sync Supabase)

✅ **LOGS COMPLETOS NO CONSOLE DA TV**
- `[NAV] ROW_DOWN/UP` — navegação entre rows com título
- `[NAV] COL_LEFT/RIGHT` — navegação entre cards com nome do canal
- `[NAV] CINEMA_ON/OFF` — ativação/desativação do cinema mode
- `[NAV] SCROLL` — posição exata do scroll a cada navegação
- `[NAV] PLAY` — canal tocado com URL e qualidade
- Rodar: `node scripts/log-server.cjs`

✅ **QUALIDADE AUTOMÁTICA DE STREAM**
- `handlePlay` sempre escolhe a melhor qualidade disponível (4K > FHD > HD > SD)
- `quickProbeUrl` testa a melhor stream antes do play
- Fallback automático para próxima qualidade se probe falhar
- Buffer aumentado: `INITIAL_BUFFER` 4000ms, `PENDING_BUFFER` 8000ms

✅ **GOLDEN OFFSET — PREVIEW SEMPRE DE ONDE PAROU**
- `goldenOffset.ts` centraliza lógica de start position
- Prioridade: heroOffset salvo > 15s → URL pattern → fallback
  - `/live/` ou `.ts` → 0ms (ao vivo)
  - `/movie/` → 240000ms (4min)
  - `/series/` → 90000ms (1min30s)
  - fallback → 120000ms (2min)
- `cancelRequest()` salva offset atual via `saveHeroOffset` antes de parar (threshold 5s)
- `seekTo` no `onbufferingcomplete` com flag `hasSeekFired` (evita loop infinito)
- Poster overlay cobre tela preta durante loading/buffering

✅ **DUAS CONSISTÊNCIAS DE PROGRESSO**
- **Preview offset** (`heroOffsetMs`): onde o autoplay parou — retoma automaticamente
- **Fullscreen progress** (`progressPct`): percentual assistido em tela cheia — salvo a cada 15s

✅ **ZERO DYNAMIC IMPORTS NO PLAYERMANAGER**
- Todos imports estáticos — elimina piscada preta causada por lazy loading no Tizen

✅ **TELA DE TV AO VIVO ORGANIZADA POR CATEGORIAS** (fase anterior)
- Fileira "🔴 Jogos Ao Vivo Agora" detecta automaticamente canais com eventos
- Fileiras separadas: Premiere, SporTV, ESPN, Combate/Lutas, Todos Esportes
- Hero banner prioriza jogos ao vivo + Premiere + SporTV
- Build & Deploy: ~20s total

✅ **PREVIEW DE VÍDEO ESTÁVEL + TRANSIÇÕES PERFEITAS** (fase anterior)
- `PlayerManager` com loop infinito corrigido
- Troca de card instantânea com fade suave
- Expand para fullscreen funcional

## Como Fazer Deploy
```bash
bash deploy.sh
```
Simples assim. O script faz build + empacota + instala na TV.

## Configuração do Developer Mode na TV
1. Na TV: Apps → digita `12345` → Developer Mode ON
2. Host PC IP: `10.0.0.103`
3. Reinicia a TV
4. Conecta: `~/tizen-studio/tools/sdb connect 10.0.0.100:26101`

## Certificado (zi01)
- Localização: `/home/carneiro888/SamsungCertificate/zi01/`
- Perfil no Tizen Studio: `zi01`
- Verified by: Samsung VD Author CA + VD DEVELOPER Partner CA Class
- DUIDs registrados: `RLCKJITTOD2EM` e `00000002094ebbd4`
- Senha: (salva no Tizen Certificate Manager)

## Informações da TV
- Modelo: UN50RU7100GXZD
- IP: `10.0.0.100`
- DUID: `00000002094ebbd4`
- Tizen: 5.0 / Chromium 63

## Playlist M3U
- URL: `http://cdc55.cc/get.php?username=0357028521&password=82740&type=m3u_plus&output=ts`

## Status Atual (21/04/2026 09:14)
✅ **VIDEO PREVIEW NOS CARDS IMPLEMENTADO**
- Preview de vídeo **dentro do card** (estilo Netflix)
- Toca instantaneamente quando foca, com som
- Começa em 4 minutos (`#t=240`)
- Hero Banner preview desabilitado (eliminou piscadas)
- Gestão automática de memória (React lifecycle)

**Detalhes técnicos:**
- `<video>` renderiza só quando `isFocused && ch.activeStream?.url`
- `autoPlay + loop + playsInline` (sem `muted`)
- `#t=240` na URL para seek instantâneo no servidor
- zIndex 5 (acima de backdrop/poster)
- Troca de card: desmonta vídeo anterior automaticamente

## Decisões Técnicas Críticas
1. **Vite 4 em vez de Vite 8** — Rolldown não gera código compatível com Chromium 56/63
2. **Plugin-legacy sem viteSingleFile** — conflito entre os dois, arquivos separados funcionam
3. **IndexedDB nativo singleton** — lib `idb` não persistia dados, API nativa com singleton funciona
4. **Web Worker fallback** — `type: 'module'` não suportado, parse no thread principal
5. **DebugOverlay lateral retrátil** — menu na lateral direita, abre/fecha com F1 ou click
6. **Arquitetura enterprise** — singleton DB, idempotência, feature flags, logs limpos
7. **Limpeza agressiva de nomes** — remove anos, artigos, qualidade, codecs para eliminar duplicatas
8. **Home por streaming** — organiza filmes/séries por Netflix, Amazon, HBO, Disney+
9. **Scroll JS puro** — `rowsWrapRef.style.transform` direto no DOM, zero re-render React
10. **Zero dynamic imports no PlayerManager** — imports estáticos eliminam piscada preta no Tizen
11. **seekTo no onbufferingcomplete** — START_POSITION não funciona em .mp4, seekTo é a solução
12. **hasSeekFired flag** — evita loop infinito de seek a cada rebuffer do AVPlay
13. **position: fixed no cinema mode** — cobre tela toda (rows cima/baixo) ao autoplay
14. **targetScroll = rowTop - 80** — ancora row focada a 80px do topo, deixa peek nas vizinhas
15. **Séries como rows por temporada** — mesma UX da HomeScreen, card central 10% menor

## Organização da Home
```
🎬 Netflix Filmes
📺 Netflix Séries
🎥 Amazon Filmes
🍿 Amazon Séries
🎭 HBO Filmes
🎪 HBO Séries
✨ Disney+ Filmes
🏰 Disney+ Séries
🔥 Continuar Assistindo (último)
```

## Referência de Layout
`/home/carneiro888/Documentos/zikualdo/Telvix/LEGACY_SVELTE_TELVIX/` — projeto Svelte que funcionava na TV, layout Netflix-like com:
- Sidebar 70px (ícones verticais)
- Topbar horizontal (links grandes)
- Hero banner (carrossel com backdrop)
- Carrosséis horizontais (Top 10, Continuar, Categorias)
- Navegação D-pad entre 4 zonas (sidebar, topbar, hero, content)

## Documentação Centralizada (`/docs`)
A documentação completa do projeto foi movida e estruturada na pasta `/docs`:
- `/docs/arquitetura/CORE_ARCHITECTURE.md` — Visão geral da Stack, Arquitetura Enterprise (Singleton, dbClient), e regras.
- `/docs/planejamento/ROADMAP.md` — Planejamento atualizado das fases do projeto.
- `/docs/contexto_e_regras/` — Relatórios do plano Enterprise (regras de negócios, resumos).
- `/docs/design_e_ui/` — Guias de layout baseados no projeto Telvix.
- `/docs/dados_e_analises/` — Parsing de TMDB, análises das streams M3U.

## Arquivos Chave (Source)
- `vite.config.ts` — Vite 4 + plugin-legacy
- `deploy.sh` — build + package + install na TV
- `public/config.xml` — manifest Tizen com CSP permissivo
- `src/components/DebugOverlay.tsx` — menu lateral retrátil de debug
- `src/services/dbClient.ts` — singleton IndexedDB
- `src/services/playlistService.ts` — idempotência + feature flag DEBUG
- `src/services/streamNormalizer.ts` — limpeza agressiva de nomes + dedup
- `src/services/contentSelector.ts` — organiza home por streaming
- `src/store/channelsStore.ts` — estados explícitos + proteção contra reprocessamento
- `src/services/PlayerManager.ts` — singleton AVPlay, qualidade automática, golden offset, progress save
- `src/services/goldenOffset.ts` — lógica de start position (heroOffset > URL pattern > fallback)
- `src/services/historyService.ts` — localStorage: heroOffsetMs + progressPct + plays
- `src/services/streamHealthCheck.ts` — quickProbeUrl para testar streams antes do play
- `src/hooks/useCardAutoplay.ts` — hook de autoplay com channelName para progress tracking
- `src/services/LoggerService.ts` — logger enterprise com categorias HW/MEM/NAV/BOOT
- `scripts/log-server.cjs` — servidor WebSocket para receber logs da TV no PC

## ⚠️ LAYOUT DAS ROWS — VALORES CALIBRADOS (NÃO MEXER SEM ENTENDER)
**Arquivo:** `src/screens/HomeScreen/HomeScreen.tsx`

### Como funciona o alinhamento:
O layout tem 3 rows visíveis simultaneamente (estilo Netflix):
- **Row de cima**: só um pedacinho (~15%) dos cards aparece no topo
- **Row central (focada)**: título acima + card grande + descrição abaixo
- **Row de baixo**: só um pedacinho (~15%) dos cards aparece no rodapé

### Variáveis críticas:

**1. `targetScroll` (controla quanto de cada row vizinha aparece):**
```typescript
const targetScroll = rowTop - 80  // 80px = ancora row focada a 80px do topo
// MENOR = tudo sobe (row de cima some, row de baixo aparece mais)
// MAIOR = tudo desce (row de cima aparece mais, row de baixo some)
```

**2. `TITLE_AREA` (espaço entre o topo da row e o card central):**
```typescript
const TITLE_AREA = Math.round(65 * vw)  // ~65px em 1920px
// MENOR = título e card sobem (título pode colidir com cards de cima!)
// MAIOR = título e card descem
```

**3. `TOP_PAD` (posição vertical dos cards nas rows NÃO focadas):**
```typescript
const TOP_PAD = isRowFocused ? 0 : Math.round(3 * vw)  // ~3px
// MENOR = cards de cima/baixo sobem
// MAIOR = cards de cima/baixo descem
```

**4. `DESC_AREA` (espaço abaixo do card para a descrição):**
```typescript
const DESC_AREA = Math.round(80 * vw)  // ~80px
// Altura FIXA — garante que a row de baixo sempre fica no mesmo lugar
// independente de ter 2 ou 3 linhas de descrição
```

### Valores finais aprovados (29/04/2026):
```typescript
targetScroll = rowTop - 80
TITLE_AREA   = 65vw  (~65px)
DESC_AREA    = 80vw  (~80px)
TOP_PAD      = 3vw   (~3px) para rows não focadas
LATERAL_TOP_OFFSET = (isRowFocused ? TITLE_AREA : TOP_PAD) + Math.round((CENTRAL_H - CARD_H) / 2)
```

### Regra de ouro:
- Para subir TUDO → diminuir `targetScroll`
- Para descer TUDO → aumentar `targetScroll`
- Para subir só o card central → diminuir `TITLE_AREA`
- Para descer cards vizinhos → aumentar `TOP_PAD`
- **NUNCA usar TOP_PAD diferente para cima/baixo** — causa "pulo" visual ao navegar

---
**Arquivo:** `src/screens/HomeScreen/HomeScreen.tsx`

### Como funciona o alinhamento:
O layout tem 3 rows visíveis simultaneamente (estilo Netflix):
- **Row de cima**: só um pedacinho (~15%) dos cards aparece no topo
- **Row central (focada)**: título acima + card grande + descrição abaixo
- **Row de baixo**: só um pedacinho (~15%) dos cards aparece no rodapé

### Variáveis críticas:

**1. `targetScroll` (controla quanto de cada row vizinha aparece):**
```typescript
const targetScroll = rowTop - 80  // 80px = ancora row focada a 80px do topo
// MENOR = tudo sobe (row de cima some, row de baixo aparece mais)
// MAIOR = tudo desce (row de cima aparece mais, row de baixo some)
```

**2. `TITLE_AREA` (espaço entre o topo da row e o card central):**
```typescript
const TITLE_AREA = Math.round(65 * vw)  // ~65px em 1920px
// MENOR = título e card sobem (título pode colidir com cards de cima!)
// MAIOR = título e card descem
```

**3. `TOP_PAD` (posição vertical dos cards nas rows NÃO focadas):**
```typescript
const TOP_PAD = isRowFocused ? 0 : Math.round(3 * vw)  // ~3px
// MENOR = cards de cima/baixo sobem
// MAIOR = cards de cima/baixo descem
```

**4. `DESC_AREA` (espaço abaixo do card para a descrição):**
```typescript
const DESC_AREA = Math.round(80 * vw)  // ~80px
// Altura FIXA — garante que a row de baixo sempre fica no mesmo lugar
// independente de ter 2 ou 3 linhas de descrição
```

### Valores finais aprovados (29/04/2026):
```typescript
targetScroll = rowTop - 80
TITLE_AREA   = 65vw  (~65px)
DESC_AREA    = 80vw  (~80px)
TOP_PAD      = 3vw   (~3px) para rows não focadas
LATERAL_TOP_OFFSET = (isRowFocused ? TITLE_AREA : TOP_PAD) + Math.round((CENTRAL_H - CARD_H) / 2)
```

### Regra de ouro:
- Para subir TUDO → diminuir `targetScroll`
- Para descer TUDO → aumentar `targetScroll`
- Para subir só o card central → diminuir `TITLE_AREA`
- Para descer cards vizinhos → aumentar `TOP_PAD`
- **NUNCA usar TOP_PAD diferente para cima/baixo** — causa "pulo" visual ao navegar

---

## Próximos Passos (Backlog Priorizado)

### 🔴 Alta Prioridade
1. **Qualidade automática de stream** — sempre selecionar a melhor qualidade disponível
   - Speed test no boot (~2s) → classifica conexão como FAST/SLOW
   - `handlePlay` usa `pickBestStream` em vez do `activeStream` padrão
   - Fallback: se stream HD travar, cai para SD automaticamente
   - Streams `.ts`/`.mp4` são bitrate fixo — ABR nativo NÃO funciona neles
2. **Buffer tuning** — aumentar `INITIAL_BUFFER` de 500 → 4000ms (2 linhas, alto impacto)
3. **Sync watch progress com Supabase** — `historyService` já tem estrutura, falta conectar
   - No boot: puxa histórico do Supabase por `user_id`
   - A cada 15s: upsert na tabela `watch_events`
   - Offline: cai para localStorage, sincroniza quando voltar

### 🟡 Média Prioridade
4. **Tela de Busca** — search screen com teclado virtual D-pad
5. **Melhorar detecção de streaming** — usar `group-title` da playlist M3U
6. **Filtros por gênero** — TMDB genres nas rows

### 🟢 Baixa Prioridade
7. **Virtualização de listas** — performance com 100+ rows
8. **Configuração manual de qualidade** — usuário força SD/HD/4K no menu settings
